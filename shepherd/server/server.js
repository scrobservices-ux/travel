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

  var applied = [], rejected = [];
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
    var stored = db.apply(change, { personId: s.personId, origin: body.origin || null });
    if (stored) applied.push(stored.seq);
  });

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
  send(res, 200, { logins: auth.list(), sessions: auth.activeSessions() });
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

function shutdown() {
  console.log('\nSaving…');
  db.flush(true);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
