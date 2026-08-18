/* Shepherd sync server.
 *
 *   node server/server.js                 # http://localhost:8787, data in server/data
 *   node server/server.js --port 8080 --host 0.0.0.0
 *   node server/server.js --cert cert.pem --key key.pem
 *
 * No npm dependencies. It serves the app, holds one shared JSON database on
 * disk, and gives every publisher their own login. Copy the data directory to
 * back the congregation up; nothing leaves the machine it runs on. */
'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var os = require('os');
var path = require('path');
var url = require('url');

var DB = require('./db.js');
var Auth = require('./auth.js');
var Permit = require('./permit.js');
var Mail = require('./mail.js');
var Notify = require('./notify.js');
var Push = require('./push.js');

require('../js/util.js');
require('../js/schema.js');
require('../js/program.js');
require('../js/seed.js');
var Seed = globalThis.Seed;

var APP_ROOT = path.resolve(__dirname, '..');
var VERSION = '1.0';
var MAX_BODY = 24 * 1024 * 1024;

/* ---------- arguments ---------- */

function arg(name, fallback) {
  var i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  var v = process.argv[i + 1];
  return v && v.slice(0, 2) !== '--' ? v : true;
}

var PORT = +arg('port', process.env.PORT || 8787);
var HOST = arg('host', process.env.HOST || '0.0.0.0');
var DATA_DIR = path.resolve(String(arg('data', path.join(__dirname, 'data'))));
// Set when a reverse proxy (Caddy, nginx, Cloudflare) terminates TLS in front of us.
var TRUST_PROXY = !!arg('trust-proxy', process.env.TRUST_PROXY === '1');

var db = new DB(DATA_DIR);
var auth = new Auth(DATA_DIR);
var mail = new Mail(DATA_DIR);
var push = new Push(DATA_DIR);
var notify = new Notify(DATA_DIR, mail, push);

/* Links in emails need an address that works from a phone, which the server
   cannot know for itself — so use what the administrator set, else what the
   browser asked for. */
function baseUrlFrom(req) {
  if (mail.settings.baseUrl) return mail.settings.baseUrl.replace(/\/$/, '');
  var host = req && req.headers && req.headers.host;
  if (!host) return 'http://localhost:' + PORT;
  return (isSecure(req) ? 'https://' : 'http://') + host;
}

/* ---------- helpers ---------- */

function isSecure(req) {
  if (req.socket.encrypted) return true;
  if (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') return true;
  return false;
}

function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/* Safe to expose on the open internet: no third-party anything is loaded, so the
   policy can be strict. Inline style attributes are used throughout the app,
   hence 'unsafe-inline' for styles only — scripts stay same-origin files. */
function securityHeaders(req) {
  var h = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  };
  if (isSecure(req)) h['Strict-Transport-Security'] = 'max-age=15552000';
  return h;
}

function send(res, status, body, headers) {
  var payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  var h = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, securityHeaders(res.__req || { socket: {}, headers: {} }), headers || {});
  res.writeHead(status, h);
  res.end(payload);
}

/* ---------- brute-force protection ---------- */

/* Sign-in is the only thing an unauthenticated visitor can reach, so it is the
   only thing worth throttling. Guessing at one account locks that account for a
   while; the per-address limit is far higher because a whole congregation on the
   hall's wifi shares one address, and locking them all out over one brother's
   forgotten password would be worse than the attack. */
var LIMITS = { email: 8, ip: 60 };
var FAILURE_WINDOW = 15 * 60 * 1000;
var attempts = Object.create(null);

function attemptKey(key) {
  var rec = attempts[key];
  if (!rec || Date.now() - rec.first > FAILURE_WINDOW) {
    rec = attempts[key] = { count: 0, first: Date.now() };
  }
  return rec;
}

function lockedOut(keys) {
  for (var i = 0; i < keys.length; i++) {
    var rec = attemptKey(keys[i]);
    var limit = LIMITS[keys[i].split(':')[0]] || LIMITS.email;
    if (rec.count >= limit) {
      return Math.ceil((FAILURE_WINDOW - (Date.now() - rec.first)) / 1000);
    }
  }
  return 0;
}

function noteFailure(keys) { keys.forEach(function (k) { attemptKey(k).count += 1; }); }
function clearFailures(keys) { keys.forEach(function (k) { delete attempts[k]; }); }

setInterval(function () {
  Object.keys(attempts).forEach(function (k) {
    if (Date.now() - attempts[k].first > FAILURE_WINDOW) delete attempts[k];
  });
}, FAILURE_WINDOW).unref();

function fail(res, status, message) { send(res, status, { error: message }); }

function readBody(req, cb) {
  var chunks = [], size = 0, done = false;
  req.on('data', function (c) {
    if (done) return;
    size += c.length;
    if (size > MAX_BODY) { done = true; cb(new Error('Request too large')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', function () {
    if (done) return;
    done = true;
    var raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) { cb(null, {}); return; }
    try { cb(null, JSON.parse(raw)); } catch (e) { cb(new Error('Body was not valid JSON')); }
  });
  req.on('error', function (e) { if (!done) { done = true; cb(e); } });
}

function cookies(req) {
  var out = {};
  (req.headers.cookie || '').split(';').forEach(function (part) {
    var i = part.indexOf('=');
    if (i === -1) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function sessionOf(req) {
  var token = cookies(req).sh_session;
  var s = auth.session(token);
  return s ? { token: token, personId: s.personId } : null;
}

function requireSession(req, res) {
  var s = sessionOf(req);
  if (!s) { fail(res, 401, 'Not signed in.'); return null; }
  return s;
}

function personOf(personId) { return db.exists() ? db.find('people', personId) : null; }

/* ---------- static files ---------- */

var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  var rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  var file = path.resolve(APP_ROOT, '.' + rel);
  if (file !== APP_ROOT && file.indexOf(APP_ROOT + path.sep) !== 0) { fail(res, 403, 'Forbidden'); return; }
  if (file.indexOf(path.join(APP_ROOT, 'server')) === 0) { fail(res, 403, 'Forbidden'); return; }
  fs.stat(file, function (err, stat) {
    if (err || !stat.isFile()) { fail(res, 404, 'Not found'); return; }
    res.writeHead(200, Object.assign({
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    }, securityHeaders(req)));
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- API ---------- */

var routes = {};

routes['GET /api/health'] = function (req, res) {
  send(res, 200, {
    server: 'shepherd',
    version: VERSION,
    needsSetup: !db.exists() || auth.isEmpty(),
    seq: db.seq
  });
};

routes['POST /api/setup'] = function (req, res, body) {
  if (db.exists() && !auth.isEmpty()) { fail(res, 409, 'This server is already set up.'); return; }
  var email = String(body.email || '').trim().toLowerCase();
  if (!email || !body.password) { fail(res, 400, 'An email address and password are needed.'); return; }

  var doc;
  if (body.demo) {
    doc = Seed.build();
  } else {
    doc = Seed.blankState();
    var cong = doc.congregations[0];
    cong.name = String(body.congregationName || 'My Congregation').trim();
    cong.city = String(body.city || '').trim();
    doc.groups.push({ id: 'grp_1', congId: cong.id, name: 'Group 1', overseerId: null, assistantId: null });
    doc.people.push({
      id: 'p_1', congId: cong.id,
      firstName: String(body.firstName || 'Account').trim(),
      lastName: String(body.lastName || 'Administrator').trim(),
      gender: 'm', appointment: 'elder',
      roles: ['admin', 'elder', 'coordinator', 'publisher'],
      qualifications: ['chairman', 'prayer', 'treasures', 'gems', 'living', 'public_talk',
        'cbs_conductor', 'wt_conductor'],
      publisherType: 'publisher', status: 'active',
      email: email, phone: '', address: '', baptizedOn: '', birthOn: '',
      serviceGroupId: 'grp_1', emergencyContact: '', unavailable: [], notes: '',
      createdAt: Date.now()
    });
    doc.account.name = String(body.accountName || cong.name).trim();
    doc.account.ownerEmail = email;
  }
  var adminId = body.demo ? 'p_1' : 'p_1';
  var adminPerson = doc.people.filter(function (p) { return p.id === adminId; })[0];
  if (adminPerson) {
    if ((adminPerson.roles || []).indexOf('admin') === -1) adminPerson.roles.push('admin');
    adminPerson.email = email;
  }
  db.init(doc);
  try {
    auth.setPassword(adminId, email, String(body.password), false);
  } catch (e) { fail(res, 400, e.message); return; }
  var token = auth.startSession(adminId, req.headers['user-agent']);
  send(res, 200, { personId: adminId, seq: db.seq }, { 'Set-Cookie': sessionCookie(token, req) });
};

function sessionCookie(token, req, clear) {
  var secure = isSecure(req) ? '; Secure' : '';
  var age = clear ? 0 : 60 * 60 * 24 * 30;
  return 'sh_session=' + (clear ? '' : token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + age + secure;
}

routes['POST /api/login'] = function (req, res, body) {
  if (!db.exists() || auth.isEmpty()) { fail(res, 409, 'This server has not been set up yet.'); return; }
  var keys = ['ip:' + clientIp(req), 'email:' + String(body.email || '').trim().toLowerCase()];
  var wait = lockedOut(keys);
  if (wait) {
    fail(res, 429, 'Too many failed attempts. Try again in ' + Math.ceil(wait / 60) + ' minutes.');
    return;
  }
  var personId = auth.verify(String(body.email || ''), String(body.password || ''));
  if (!personId) {
    noteFailure(keys);
    fail(res, 401, 'That email address and password do not match.');
    return;
  }
  clearFailures(keys);
  var token = auth.startSession(personId, req.headers['user-agent']);
  send(res, 200, {
    personId: personId,
    mustChangePassword: auth.mustChange(personId),
    seq: db.seq
  }, { 'Set-Cookie': sessionCookie(token, req) });
};

routes['POST /api/logout'] = function (req, res) {
  var s = sessionOf(req);
  if (s) auth.endSession(s.token);
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', req, true) });
};

routes['GET /api/me'] = function (req, res) {
  var s = requireSession(req, res);
  if (!s) return;
  var person = personOf(s.personId);
  if (!person) { fail(res, 403, 'This login is no longer attached to a publisher record.'); return; }
  send(res, 200, {
    personId: s.personId,
    name: person.firstName + ' ' + person.lastName,
    roles: Permit.rolesOf(person),
    congId: person.congId,
    mustChangePassword: auth.mustChange(s.personId),
    seq: db.seq
  });
};

routes['GET /api/state'] = function (req, res) {
  var s = requireSession(req, res);
  if (!s) return;
  var snap = db.snapshot();
  send(res, 200, { doc: snap.doc, seq: snap.seq, personId: s.personId });
};

routes['GET /api/changes'] = function (req, res, body, query) {
  var s = requireSession(req, res);
  if (!s) return;
  var since = query.since == null ? -1 : +query.since;
  var result = db.since(since);
  if (result.full) { send(res, 200, { full: true, seq: db.seq }); return; }
  send(res, 200, { changes: result.changes, seq: result.seq });
};

routes['POST /api/changes'] = function (req, res, body) {
  var s = requireSession(req, res);
  if (!s) return;
  if (!Array.isArray(body.changes)) { fail(res, 400, 'changes must be an array.'); return; }

  var applied = [], rejected = [], newlyAssigned = [];
  body.changes.forEach(function (change) {
    if (!change || !change.c || (change.op !== 'put' && change.op !== 'del')) {
      rejected.push({ id: change && change.id, reason: 'Malformed change.' });
      return;
    }
    var verdict = Permit.permit(db, s.personId, change);
    if (!verdict.ok) {
      rejected.push({ c: change.c, id: change.id, reason: verdict.reason });
      return;
    }
    // remember what it looked like, so we can see who has just been given something
    var before = null;
    if (change.op === 'put' && (change.c === 'weeks' || change.c === 'duties')) {
      var current = db.find(change.c, change.id);
      before = current ? JSON.parse(JSON.stringify(current)) : null;
    }
    var stored = db.apply(change, { personId: s.personId, origin: body.origin || null });
    if (stored) {
      applied.push(stored.seq);
      if (change.c === 'weeks') {
        Notify.newAssignments(before, change.rec).forEach(function (a) { newlyAssigned.push(a); });
      } else if (change.c === 'duties') {
        var dt = dutyName(change.rec);
        var d = Notify.newDuty(before, change.rec, dt);
        if (d) newlyAssigned.push(d);
      }
    }
  });

  if (newlyAssigned.length) queueAssignmentEmails(newlyAssigned, s.personId, req);

  // on disk before the client is told it was accepted
  if (applied.length) db.flush();

  var since = body.since == null ? db.seq : +body.since;
  var result = db.since(since);
  send(res, 200, {
    applied: applied.length,
    rejected: rejected,
    full: !!result.full,
    changes: result.changes || [],
    seq: db.seq
  });
};

function dutyName(duty) {
  if (!duty) return 'Duty';
  var cong = db.find('congregations', duty.congId);
  var types = globalThis.Schema.dutyTypesFor(cong);
  var t = types.filter(function (x) { return x.id === duty.type; })[0];
  return t ? t.name : duty.type;
}

/* One email per person, however many assignments landed at once. */
function queueAssignmentEmails(items, byPersonId, req) {
  var base = baseUrlFrom(req);
  var today = globalThis.U.today();
  var grouped = {};
  items.forEach(function (it) {
    if (!it.personId || it.personId === byPersonId) return;      // no need to email yourself
    if (it.date && it.date < today) return;                      // nothing for the past
    (grouped[it.personId] = grouped[it.personId] || []).push(it);
  });
  Object.keys(grouped).forEach(function (personId) {
    var person = db.find('people', personId);
    if (!person || !person.email) return;
    if (!Notify.wants(person, 'assignment')) return;
    var cong = db.find('congregations', person.congId);
    var list = grouped[personId].map(function (it) {
      var withPerson = it.with && db.find('people', it.with);
      return Object.assign({}, it, {
        withName: withPerson ? withPerson.firstName + ' ' + withPerson.lastName : null
      });
    });
    notify.assignmentEmail({ person: person, cong: cong, items: list, baseUrl: base });
    notify.pop(person, Notify.assignmentPop(list));
  });
  mail.flush();
}

/* ---------- invitations ---------- */

routes['POST /api/invite'] = function (req, res, body) {
  var s = requireSession(req, res);
  if (!s) return;
  var me = personOf(s.personId);
  if (!Permit.can(db, me, 'admin.manage')) { fail(res, 403, 'Administrators only.'); return; }

  var person = personOf(String(body.personId || ''));
  if (!person) { fail(res, 404, 'No such publisher.'); return; }
  var email = String(body.email || person.email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') === -1) { fail(res, 400, 'A valid email address is needed.'); return; }

  // keep the record's email in step, so it is where the elders can see it
  if (person.email !== email) {
    var updated = JSON.parse(JSON.stringify(person));
    updated.email = email;
    db.apply({ c: 'people', id: person.id, op: 'put', rec: updated }, { personId: s.personId });
    db.flush();
    person = personOf(person.id);
  }

  var out = notify.invite({
    person: person,
    cong: db.find('congregations', person.congId),
    email: email,
    invitedBy: s.personId,
    invitedByName: me ? me.firstName + ' ' + me.lastName : 'an elder',
    baseUrl: baseUrlFrom(req)
  });
  mail.flush();
  send(res, 200, {
    ok: true, link: out.link, email: email,
    transport: mail.settings.transport,
    configured: mail.configured() && mail.settings.transport === 'smtp'
  });
};

routes['GET /api/invite/info'] = function (req, res, body, query) {
  var inv = notify.inviteFor(String(query.token || ''));
  if (!inv) { fail(res, 404, 'That invitation is not recognised.'); return; }
  if (inv.expired) { fail(res, 410, inv.reason); return; }
  var person = personOf(inv.personId);
  if (!person) { fail(res, 404, 'That invitation is no longer attached to a publisher.'); return; }
  var cong = db.find('congregations', person.congId);
  send(res, 200, {
    firstName: person.firstName, lastName: person.lastName,
    email: inv.email, congregation: cong ? cong.name : ''
  });
};

routes['POST /api/invite/accept'] = function (req, res, body) {
  var t = String(body.token || '');
  var inv = notify.inviteFor(t);
  if (!inv) { fail(res, 404, 'That invitation is not recognised.'); return; }
  if (inv.expired) { fail(res, 410, inv.reason); return; }
  var person = personOf(inv.personId);
  if (!person) { fail(res, 404, 'That invitation is no longer attached to a publisher.'); return; }
  try {
    auth.setPassword(person.id, inv.email, String(body.password || ''), false);
  } catch (e) { fail(res, 400, e.message); return; }
  notify.acceptInvite(t);
  var sessionToken = auth.startSession(person.id, req.headers['user-agent']);
  send(res, 200, { personId: person.id, seq: db.seq },
    { 'Set-Cookie': sessionCookie(sessionToken, req) });
};

/* ---------- email settings ---------- */

routes['GET /api/mail'] = function (req, res) {
  var s = requireSession(req, res);
  if (!s) return;
  var me = personOf(s.personId);
  if (!Permit.can(db, me, 'admin.manage')) { fail(res, 403, 'Administrators only.'); return; }
  send(res, 200, {
    settings: mail.publicSettings(),
    recent: mail.queue.slice(-25).reverse().map(function (m) {
      return {
        to: m.to, subject: m.subject, kind: m.kind, createdAt: m.createdAt,
        sentAt: m.sentAt, failedAt: m.failedAt, error: m.error, attempts: m.attempts
      };
    })
  });
};

routes['POST /api/mail'] = function (req, res, body) {
  var s = requireSession(req, res);
  if (!s) return;
  var me = personOf(s.personId);
  if (!Permit.can(db, me, 'admin.manage')) { fail(res, 403, 'Administrators only.'); return; }
  send(res, 200, { settings: mail.saveSettings(body.settings || {}) });
};

routes['POST /api/mail/test'] = function (req, res, body) {
  var s = requireSession(req, res);
  if (!s) return;
  var me = personOf(s.personId);
  if (!Permit.can(db, me, 'admin.manage')) { fail(res, 403, 'Administrators only.'); return; }
  var to = String(body.to || (me && me.email) || '').trim();
  if (!to) { fail(res, 400, 'Where should the test go?'); return; }
  var msg = mail.enqueue({
    to: to, toName: me ? me.firstName + ' ' + me.lastName : '',
    subject: 'Shepherd test message',
    text: 'This is a test from Shepherd. If you can read it, the congregation can be emailed.',
    html: '<p>This is a test from Shepherd.</p><p>If you can read it, the congregation can be emailed.</p>',
    kind: 'test', personId: s.personId
  });
  mail.deliver(msg).then(function () {
    msg.sentAt = Date.now();
    send(res, 200, { ok: true, transport: mail.settings.transport });
  }, function (err) {
    msg.attempts += 1;
    msg.error = String(err && err.message || err);
    send(res, 200, { ok: false, error: msg.error });
  });
};

/* ---------- pop-up reminders ---------- */

routes['GET /api/push'] = function (req, res) {
  var s = requireSession(req, res);
  if (!s) return;
  send(res, 200, {
    publicKey: push.publicKey(),
    devices: push.forPerson(s.personId).length,
    total: push.count()
  });
};

routes['POST /api/push/subscribe'] = function (req, res, body) {
  var s = requireSession(req, res);
  if (!s) return;
  try {
    push.subscribe(s.personId, body.subscription, req.headers['user-agent']);
  } catch (e) { fail(res, 400, e.message); return; }
  send(res, 200, { ok: true, devices: push.forPerson(s.personId).length });
};

routes['POST /api/push/unsubscribe'] = function (req, res, body) {
  var s = requireSession(req, res);
  if (!s) return;
  // only your own device — the token is derived from the address, so check it is yours
  var mine = push.forPerson(s.personId).some(function (sub) { return sub.endpoint === body.endpoint; });
  if (!mine) { send(res, 200, { ok: true, devices: push.forPerson(s.personId).length }); return; }
  push.unsubscribe(String(body.endpoint || ''));
  send(res, 200, { ok: true, devices: push.forPerson(s.personId).length });
};

routes['POST /api/push/test'] = function (req, res) {
  var s = requireSession(req, res);
  if (!s) return;
  var person = personOf(s.personId);
  push.toPerson(s.personId, {
    title: 'Shepherd',
    body: 'That is what a reminder looks like. Assignments, cleaning turns and visit deadlines arrive this way.',
    url: './#/home', tag: 'test', kind: 'test'
  }).then(function (out) {
    send(res, 200, Object.assign({ ok: out.sent > 0 }, out,
      out.sent ? {} : { error: push.lastError || 'No device is subscribed on this account yet.' }));
  }, function (err) {
    send(res, 200, { ok: false, error: String(err && err.message || err) });
  });
  void person;
};

/* Sends whatever is due right now rather than waiting for the hour to come
   round — the coordinator's "tell them now", and what the tests use. */
routes['POST /api/reminders/run'] = function (req, res) {
  var s = requireSession(req, res);
  if (!s) return;
  var me = personOf(s.personId);
  if (!Permit.can(db, me, 'cleaning.manage') && !Permit.can(db, me, 'covisit.manage')
      && !Permit.can(db, me, 'admin.manage')) {
    fail(res, 403, 'Only those caring for the rota or the visit can send these.');
    return;
  }
  var before = mail.queue.length;
  hallReminders();
  send(res, 200, { ok: true, queued: mail.queue.length - before });
};

/* ---------- calendar ---------- */

routes['POST /api/calendar/link'] = function (req, res, body) {
  var s = requireSession(req, res);
  if (!s) return;
  var target = String(body.personId || s.personId);
  var me = personOf(s.personId);
  if (target !== s.personId && !Permit.can(db, me, 'admin.manage')) {
    fail(res, 403, 'You can only make a link for yourself.');
    return;
  }
  var t = body.reset ? notify.resetCalendar(target) : notify.calendarToken(target);
  var base = baseUrlFrom(req);
  send(res, 200, {
    url: base + '/calendar/' + t + '.ics',
    webcal: base.replace(/^https?:/, 'webcal:') + '/calendar/' + t + '.ics'
  });
};

function serveCalendar(req, res, pathname) {
  var t = pathname.replace('/calendar/', '').replace(/\.ics$/, '');
  var personId = notify.personForCalendar(t);
  var person = personId && personOf(personId);
  if (!person) { fail(res, 404, 'No such calendar.'); return; }
  var cong = db.find('congregations', person.congId);
  var events = [];
  var today = globalThis.U.today();

  (db.doc.weeks || []).filter(function (w) { return w.congId === person.congId; }).forEach(function (w) {
    ['midweek', 'weekend'].forEach(function (meeting) {
      var block = w[meeting];
      if (!block || block.cancelled || block.date < today) return;
      block.parts.forEach(function (part) {
        var mine = part.assigneeId === person.id || part.assistantId === person.id;
        if (!mine) return;
        var other = part.assigneeId === person.id ? part.assistantId : part.assigneeId;
        var otherPerson = other && db.find('people', other);
        events.push({
          uid: part.id + '-' + person.id,
          title: part.title + (part.assistantId === person.id ? ' (assistant)' : ''),
          date: block.date, time: block.time, minutes: part.minutes || 30,
          location: cong ? cong.hallAddress || cong.name : '',
          description: [
            part.source || '',
            otherPerson ? 'With ' + otherPerson.firstName + ' ' + otherPerson.lastName : '',
            part.notes || ''
          ].filter(Boolean).join('\n')
        });
      });
    });
  });

  (db.doc.duties || []).filter(function (d) {
    return d.congId === person.congId && d.personId === person.id && d.date >= today;
  }).forEach(function (d) {
    var week = (db.doc.weeks || []).filter(function (w) {
      return w.congId === d.congId && (w.midweek.date === d.date || w.weekend.date === d.date);
    })[0];
    var time = week ? (week.midweek.date === d.date ? week.midweek.time : week.weekend.time) : '19:00';
    events.push({
      uid: d.id + '-' + person.id,
      title: dutyName(d),
      date: d.date, time: time, minutes: 90,
      location: cong ? cong.hallAddress || cong.name : '',
      description: 'Duty at the meeting'
    });
  });

  /* the hall cleaning this person is expected at */
  (db.doc.cleaning || []).filter(function (c) {
    if (c.congId !== person.congId || c.date < today) return false;
    if (c.kind === 'general') return true;
    return (c.groupIds || []).indexOf(person.serviceGroupId) !== -1;
  }).forEach(function (c) {
    var week = (db.doc.weeks || []).filter(function (w) {
      return w.congId === c.congId && (w.midweek.date === c.date || w.weekend.date === c.date);
    })[0];
    var time = c.kind === 'general'
      ? (c.time || '09:00')
      : (week ? (week.midweek.date === c.date ? week.midweek.time : week.weekend.time) : '19:00');
    events.push({
      uid: c.id + '-' + person.id,
      title: c.kind === 'general' ? 'General cleaning' : 'Cleaning the hall — ' + cleaningLabel(c),
      date: c.date, time: time, minutes: c.minutes || (c.kind === 'general' ? 180 : 60),
      location: cong ? cong.hallAddress || cong.name : '',
      description: c.kind === 'general'
        ? 'The whole congregation is invited.' + (c.notes ? '\n' + c.notes : '')
        : 'After the ' + (c.meeting === 'midweek' ? 'midweek' : 'weekend') + ' meeting.'
          + (c.notes ? '\n' + c.notes : '')
    });
  });

  /* and what the circuit overseer's visit wants from him, on the day it is
     wanted — so it shows up in his own diary, not only in the app */
  (db.doc.covisits || []).filter(function (v) {
    return v.congId === person.congId && !v.closedAt;
  }).forEach(function (visit) {
    (visit.tasks || []).forEach(function (t) {
      if (t.personId !== person.id || t.doneAt || t.dueOn < today) return;
      events.push({
        uid: t.id + '-' + person.id,
        title: 'CO visit: ' + t.title,
        date: t.dueOn, time: '09:00', minutes: 30,
        location: cong ? cong.name : '',
        description: (t.detail || '') + '\nBefore the circuit overseer arrives on '
          + globalThis.U.fmtDate(visit.from, 'long') + '.'
      });
    });
  });

  var ics = Notify.buildIcs((cong ? cong.name : 'Congregation') + ' — ' + person.firstName, events);
  res.writeHead(200, Object.assign({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="shepherd.ics"',
    'Cache-Control': 'no-cache'
  }, securityHeaders(req)));
  res.end(ics);
}

routes['POST /api/password'] = function (req, res, body) {
  var s = requireSession(req, res);
  if (!s) return;
  var me = personOf(s.personId);
  var target = String(body.personId || s.personId);
  var isSelf = target === s.personId;
  var isAdmin = Permit.rolesOf(me).indexOf('admin') !== -1;
  if (!isSelf && !isAdmin) { fail(res, 403, 'Only an account administrator can set another person’s password.'); return; }

  if (isSelf && !isAdmin) {
    if (!auth.verify(body.email || (auth.creds[s.personId] || {}).email, String(body.current || ''))) {
      fail(res, 403, 'Your current password is not right.');
      return;
    }
  }
  var person = personOf(target);
  if (!person) { fail(res, 404, 'No such publisher.'); return; }
  var email = String(body.email || (auth.creds[target] || {}).email || person.email || '').trim().toLowerCase();
  if (!email) { fail(res, 400, 'An email address is needed for the login.'); return; }

  var password = body.password ? String(body.password) : Auth.randomPassword();
  try {
    auth.setPassword(target, email, password, !isSelf && !!body.mustChange);
  } catch (e) { fail(res, 400, e.message); return; }
  send(res, 200, {
    personId: target, email: email,
    password: body.password ? null : password,      // returned only when generated
    mustChange: !isSelf && !!body.mustChange
  });
};

routes['GET /api/accounts'] = function (req, res) {
  var s = requireSession(req, res);
  if (!s) return;
  var me = personOf(s.personId);
  if (Permit.rolesOf(me).indexOf('admin') === -1) { fail(res, 403, 'Administrators only.'); return; }
  var invites = {};
  (db.doc.people || []).forEach(function (p) {
    var st = notify.inviteStatus(p.id);
    if (st) invites[p.id] = st;
  });
  send(res, 200, { logins: auth.list(), sessions: auth.activeSessions(), invites: invites });
};

routes['POST /api/accounts/remove'] = function (req, res, body) {
  var s = requireSession(req, res);
  if (!s) return;
  var me = personOf(s.personId);
  if (Permit.rolesOf(me).indexOf('admin') === -1) { fail(res, 403, 'Administrators only.'); return; }
  if (String(body.personId) === s.personId) { fail(res, 400, 'You cannot remove your own login.'); return; }
  auth.remove(String(body.personId));
  send(res, 200, { ok: true });
};

/* ---------- request handling ---------- */

function handle(req, res) {
  res.__req = req;                      // so send() can pick the right security headers
  var parsed = url.parse(req.url, true);
  var pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  var key = req.method + ' ' + pathname;

  if (pathname.indexOf('/api/') === 0) {
    var route = routes[key];
    if (!route) { fail(res, 404, 'No such endpoint.'); return; }
    if (req.method === 'POST') {
      readBody(req, function (err, body) {
        if (err) { fail(res, 400, err.message); return; }
        try { route(req, res, body, parsed.query); }
        catch (e) { console.error(e); fail(res, 500, e.message); }
      });
    } else {
      try { route(req, res, null, parsed.query); }
      catch (e) { console.error(e); fail(res, 500, e.message); }
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { fail(res, 405, 'Method not allowed'); return; }

  // a calendar someone's phone subscribes to: the token in the path is the key
  if (pathname.indexOf('/calendar/') === 0 && /\.ics$/.test(pathname)) {
    serveCalendar(req, res, pathname);
    return;
  }
  // the invitation link opens the app, which reads the token from the query
  if (pathname === '/invite') { serveStatic(req, res, '/index.html'); return; }

  serveStatic(req, res, pathname);
}

/* ---------- start ---------- */

var certFile = arg('cert', null), keyFile = arg('key', null);
var server;
if (certFile && keyFile) {
  server = https.createServer({
    cert: fs.readFileSync(String(certFile)),
    key: fs.readFileSync(String(keyFile))
  }, handle);
} else {
  server = http.createServer(handle);
}

server.listen(PORT, HOST, function () {
  var scheme = certFile && keyFile ? 'https' : 'http';
  console.log('Shepherd server ' + VERSION);
  console.log('  data       ' + DATA_DIR);
  console.log('  database   ' + (db.exists() ? 'ready (change ' + db.seq + ')' : 'not set up yet'));
  console.log('  logins     ' + (auth.isEmpty() ? 'none — open the app to set up the first administrator' : auth.list().length));
  console.log('  email      ' + (mail.settings.transport === 'smtp'
    ? 'via ' + mail.settings.host
    : mail.settings.transport === 'off'
      ? 'off'
      : 'not set up — messages are written to ' + path.join(DATA_DIR, 'outbox')));
  console.log('  reminders  ' + (push.count()
    ? push.count() + ' device(s) subscribed to pop-up reminders'
    : 'pop-ups ready — publishers turn them on under “My details”'));
  console.log('  listening  ' + scheme + '://localhost:' + PORT);
  var nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (net) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('  on the LAN ' + scheme + '://' + net.address + ':' + PORT);
      }
    });
  });
  if (scheme === 'http' && HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.log('\n  Plain HTTP on the local network: fine inside a Kingdom Hall or a home');
    console.log('  network. Pass --cert and --key to serve over HTTPS if it is reachable');
    console.log('  from anywhere else.');
  }
});

/* ---------- things that happen on their own ---------- */

/* Anything waiting in the outbox goes out; a failed message is retried a few
   times and then left alone with its reason recorded. */
setInterval(function () {
  if (mail.pending().length) mail.flush();
}, 60 * 1000).unref();

/* Once a week, everyone who wants it gets what they have coming; and around the
   report deadline, whoever has not handed one in gets a nudge. Checked hourly so
   the exact minute the server started does not matter. */
setInterval(digestAndReminders, 60 * 60 * 1000).unref();
setTimeout(digestAndReminders, 30 * 1000).unref();

/* The hall reminders — whose turn it is to clean, and what is due before the
   circuit overseer arrives. Checked every hour; each one goes out once. These do
   not wait for an email account to be set up, because a pop-up on a phone needs
   no mail server at all. */
setInterval(hallReminders, 60 * 60 * 1000).unref();
setTimeout(hallReminders, 45 * 1000).unref();

function digestAndReminders() {
  if (!db.exists() || !mail.configured()) return;
  var now = new Date();
  var today = globalThis.U.today();
  var base = mail.settings.baseUrl || ('http://localhost:' + PORT);

  // weekly digest
  if (now.getDay() === (mail.settings.digestDay == null ? 1 : mail.settings.digestDay)
      && now.getHours() >= (mail.settings.digestHour == null ? 8 : mail.settings.digestHour)
      && mail.settings.lastDigestOn !== today) {
    mail.settings.lastDigestOn = today;
    mail.saveSettings({ lastDigestOn: today });
    sendDigests(base, today);
  }

  // report reminders, on the day they are due
  (db.doc.congregations || []).forEach(function (cong) {
    var due = cong.reportDueDay || 6;
    if (now.getDate() !== due) return;
    var stamp = 'reports-' + today + '-' + cong.id;
    if (mail.settings.lastReminder === stamp) return;
    mail.saveSettings({ lastReminder: stamp });
    sendReportReminders(cong, base);
  });

  mail.flush();
}

/* ---------- cleaning and the circuit overseer's visit ---------- */

function baseUrl() {
  return (mail.settings.baseUrl || ('http://localhost:' + PORT)).replace(/\/$/, '');
}

function activePeopleOf(congId) {
  return (db.doc.people || []).filter(function (p) {
    return p.congId === congId && p.status !== 'inactive'
      && p.status !== 'moved' && p.status !== 'deceased';
  });
}

function cleaningLabel(item) {
  if (item.kind === 'general') return 'The whole congregation';
  var names = (item.groupIds || []).map(function (id) {
    var g = db.find('groups', id);
    return g ? g.name : 'a group';
  });
  return names.length ? names.join(' and ') : 'Cleaning';
}

/* Who is expected: the group whose turn it is, or everybody for a general clean. */
function cleaningPeople(item) {
  var people = activePeopleOf(item.congId);
  if (item.kind === 'general') return people;
  return people.filter(function (p) {
    return (item.groupIds || []).indexOf(p.serviceGroupId) !== -1;
  });
}

/* The brothers who get told whatever their own group is doing. */
function cleaningStewards(congId) {
  return activePeopleOf(congId).filter(function (p) {
    var roles = p.roles || [];
    return roles.indexOf('coordinator') !== -1 || roles.indexOf('cleaning') !== -1;
  });
}

function hallReminders() {
  if (!db.exists()) return;
  var U = globalThis.U, S = globalThis.Schema;
  var today = U.today();
  var hour = new Date().getHours();
  var base = baseUrl();

  (db.doc.congregations || []).forEach(function (cong) {
    var set = S.cleaningFor(cong);
    var lead = +set.remindDaysBefore || 3;
    var items = (db.doc.cleaning || []).filter(function (c) {
      return c.congId === cong.id && c.date >= today && c.date <= U.addDays(today, lead);
    });

    items.forEach(function (item) {
      var days = U.diffDays(today, item.date);
      var label = cleaningLabel(item);

      // the first nudge, the agreed number of days out
      if (days === lead && notify.once('clean-lead-' + item.id)) {
        cleaningPeople(item).forEach(function (person) {
          if (!Notify.wants(person, 'cleaning')) return;
          notify.cleaningEmail({ person: person, cong: cong, item: item, baseUrl: base });
          notify.pop(person, Notify.cleaningPop(item, label));
        });
        // and the brothers who carry it, whichever group is on
        var stewards = cleaningStewards(cong.id);
        stewards.forEach(function (person) {
          notify.cleaningOverviewEmail({
            person: person, cong: cong, baseUrl: base,
            items: [{ date: item.date, label: label, item: item }]
          });
          notify.pop(person, {
            title: item.kind === 'general' ? 'General cleaning ' + U.fmtDate(item.date, 'day')
              : label + ' cleans ' + U.fmtDate(item.date, 'day'),
            body: 'Everyone concerned has been told.',
            url: './#/cleaning', tag: 'cleaning-steward-' + item.id, kind: 'cleaning'
          });
        });
      }

      // and a pop-up on the morning itself
      if (days === 0 && set.remindOnTheDay !== false && hour >= 7
          && notify.once('clean-day-' + item.id)) {
        cleaningPeople(item).forEach(function (person) {
          if (!Notify.wants(person, 'cleaning')) return;
          notify.pop(person, Notify.cleaningPop(item, label));
        });
      }
    });

    /* the circuit overseer's visit: each brother is reminded of his own jobs a
       week out, and again once they are late. */
    (db.doc.covisits || []).filter(function (v) {
      return v.congId === cong.id && !v.closedAt && v.to >= today;
    }).forEach(function (visit) {
      var byPerson = {};
      (visit.tasks || []).forEach(function (t) {
        if (t.doneAt || !t.personId) return;
        var late = t.dueOn < today;
        var soon = !late && t.dueOn <= U.addDays(today, 7);
        if (!late && !soon) return;
        var bucket = (byPerson[t.personId] = byPerson[t.personId] || { due: [], late: [] });
        bucket[late ? 'late' : 'due'].push(t);
      });

      Object.keys(byPerson).forEach(function (personId) {
        var person = db.find('people', personId);
        if (!person || !Notify.wants(person, 'covisit')) return;
        var bucket = byPerson[personId];

        // late work is chased weekly; what is merely due is said once
        if (bucket.late.length) {
          var lateKey = 'co-late-' + visit.id + '-' + personId + '-' + U.weekStart(today);
          if (notify.once(lateKey)) {
            notify.covisitEmail({ person: person, cong: cong, visit: visit,
              tasks: bucket.late, baseUrl: base, tone: 'overdue' });
            notify.pop(person, Notify.covisitPop(visit, bucket.late, true));
          }
        }
        if (bucket.due.length) {
          var dueKey = 'co-due-' + visit.id + '-' + personId + '-' + bucket.due.map(function (t) { return t.id; }).join(',');
          if (notify.once(dueKey)) {
            notify.covisitEmail({ person: person, cong: cong, visit: visit,
              tasks: bucket.due, baseUrl: base, tone: 'due' });
            notify.pop(person, Notify.covisitPop(visit, bucket.due, false));
          }
        }
      });
    });
  });

  mail.flush();
}

function sendDigests(base, today) {
  var horizon = globalThis.U.addDays(today, 8);
  (db.doc.people || []).forEach(function (person) {
    if (!person.email || person.status === 'inactive' || person.status === 'moved') return;
    if (!Notify.wants(person, 'digest')) return;
    var items = [];
    (db.doc.weeks || []).filter(function (w) { return w.congId === person.congId; }).forEach(function (w) {
      ['midweek', 'weekend'].forEach(function (meeting) {
        var block = w[meeting];
        if (!block || block.cancelled || block.date < today || block.date > horizon) return;
        block.parts.forEach(function (part) {
          if (part.assigneeId === person.id || part.assistantId === person.id) {
            items.push({
              title: part.title, date: block.date, time: block.time,
              assistant: part.assistantId === person.id
            });
          }
        });
      });
    });
    (db.doc.duties || []).forEach(function (d) {
      if (d.personId !== person.id || d.date < today || d.date > horizon) return;
      items.push({ title: dutyName(d), date: d.date, assistant: false });
    });
    if (!items.length) return;                 // nothing to say, so say nothing
    items.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    notify.digestEmail({
      person: person, cong: db.find('congregations', person.congId),
      items: items, baseUrl: base
    });
  });
}

function sendReportReminders(cong, base) {
  var period = globalThis.U.prevPeriod(globalThis.U.period(globalThis.U.today()));
  (db.doc.people || []).forEach(function (person) {
    if (person.congId !== cong.id) return;
    if (!person.email || (person.status !== 'active' && person.status !== 'irregular')) return;
    if (!Notify.wants(person, 'report')) return;
    var handed = (db.doc.reports || []).some(function (r) {
      return r.personId === person.id && r.period === period;
    });
    if (handed) return;
    notify.reportReminderEmail({ person: person, cong: cong, period: period, baseUrl: base });
  });
}

function shutdown() {
  console.log('\nSaving…');
  db.flush(true);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
