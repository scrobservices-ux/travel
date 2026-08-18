/* The invitation and notification chain, end to end against a real server:

     an administrator invites a publisher by email
       → the publisher opens the link, chooses a password, and is signed in
       → an assignment against their name sends them one message
       → their phone can subscribe to a calendar of what they have on

   Email uses the built-in "file" transport, so messages land in data/outbox as
   .eml files and can be read back here without sending anything anywhere.

   node test/notify.js */
'use strict';

var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var child = require('child_process');

var PORT = 8934;
var BASE = 'http://127.0.0.1:' + PORT;
var DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'shepherd-notify-'));
var failures = 0;

function ok(name, condition, detail) {
  if (condition) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

function request(method, endpoint, body, cookie) {
  return new Promise(function (resolve, reject) {
    var payload = body == null ? null : Buffer.from(JSON.stringify(body));
    var req = http.request(BASE + endpoint, {
      method: method,
      headers: Object.assign(
        payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {},
        cookie ? { Cookie: cookie } : {})
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var text = Buffer.concat(chunks).toString('utf8');
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        var setCookie = (res.headers['set-cookie'] || [])[0];
        resolve({
          status: res.statusCode, body: data, text: text, headers: res.headers,
          cookie: setCookie ? setCookie.split(';')[0] : null
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function waitForServer(tries) {
  return request('GET', '/api/health').catch(function (e) {
    if (tries <= 0) throw e;
    return wait(150).then(function () { return waitForServer(tries - 1); });
  });
}

/* ---------- reading the outbox ---------- */

function outbox() {
  var dir = path.join(DATA, 'outbox');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().map(function (f) {
    var raw = fs.readFileSync(path.join(dir, f), 'utf8');
    var headerEnd = raw.indexOf('\r\n\r\n');
    var headers = raw.slice(0, headerEnd);
    // bodies are base64 so accents survive; decode every part to search them
    var body = raw.slice(headerEnd).split(/\r\n/).filter(function (line) {
      return /^[A-Za-z0-9+/=]+$/.test(line) && line.length > 20;
    }).map(function (line) {
      return Buffer.from(line, 'base64').toString('utf8');
    }).join('');
    var to = /^To: (.*)$/m.exec(headers);
    var subject = /^Subject: (.*)$/m.exec(headers);
    return { file: f, headers: headers, body: body, to: to ? to[1] : '', subject: subject ? subject[1] : '' };
  });
}

/* Waits for the spooler, which writes after the reply has already gone out. */
function waitForMail(count, tries) {
  if (outbox().length >= count) return Promise.resolve(outbox());
  if (tries <= 0) return Promise.resolve(outbox());
  return wait(120).then(function () { return waitForMail(count, tries - 1); });
}

var server = child.spawn(process.execPath,
  [path.join(__dirname, '..', 'server', 'server.js'), '--port', String(PORT), '--host', '127.0.0.1', '--data', DATA],
  { stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', function (d) { process.stderr.write('[server] ' + d); });

function stop(code) {
  server.kill('SIGTERM');
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(code);
}

(async function () {
  await waitForServer(40);
  console.log('server up on ' + BASE + '\n');

  var setup = await request('POST', '/api/setup', {
    email: 'coordinator@example.org', password: 'first-password-1',
    firstName: 'Daniel', lastName: 'Achebe', demo: true
  });
  var admin = setup.cookie;
  ok('the first elder is set up', setup.status === 200 && !!admin, JSON.stringify(setup.body));

  // ---------- inviting ----------
  console.log('\ninviting a publisher');

  var bad = await request('POST', '/api/invite', { personId: 'p_20', email: 'not-an-address' }, admin);
  ok('an address that is not one is refused', bad.status === 400, JSON.stringify(bad.body));

  var invite = await request('POST', '/api/invite', { personId: 'p_20', email: 'Ruth@Example.org' }, admin);
  ok('the invitation is issued', invite.status === 200 && !!invite.body.link, JSON.stringify(invite.body));
  ok('the address is stored in lower case', invite.body.email === 'ruth@example.org');

  var box = await waitForMail(1, 25);
  ok('an email is written to the outbox', box.length === 1, box.length + ' messages');
  ok('it is addressed to the publisher', box[0] && /ruth@example\.org/.test(box[0].to), box[0] && box[0].to);
  ok('it names the congregation', box[0] && /Riverside/i.test(box[0].body + box[0].subject));

  var token = /token=([^&"'\s<]+)/.exec(invite.body.link);
  ok('the link carries a token', !!token, invite.body.link);
  token = token && token[1];
  ok('the same link is in the email', box[0] && box[0].body.indexOf(token) !== -1);

  var state = await request('GET', '/api/state', null, admin);
  var ruthRec = state.body.doc.people.filter(function (p) { return p.id === 'p_20'; })[0];
  ok('the publisher’s record now holds that address', ruthRec.email === 'ruth@example.org', ruthRec.email);

  // ---------- accepting ----------
  console.log('\naccepting the invitation');

  var info = await request('GET', '/api/invite/info?token=' + encodeURIComponent(token));
  ok('the acceptance page can be opened without signing in',
    info.status === 200 && info.body.firstName === 'Ruth', JSON.stringify(info.body));
  ok('and it says which congregation it is for', /Riverside/i.test(info.body.congregation || ''));

  var madeUp = await request('GET', '/api/invite/info?token=' + 'x'.repeat(32));
  ok('an invented token is not recognised', madeUp.status === 404);

  var tooShort = await request('POST', '/api/invite/accept', { token: token, password: 'short' });
  ok('a short password is refused', tooShort.status === 400, JSON.stringify(tooShort.body));

  var accept = await request('POST', '/api/invite/accept', { token: token, password: 'ruth-own-password' });
  ok('accepting works and signs the publisher in',
    accept.status === 200 && accept.body.personId === 'p_20' && !!accept.cookie, JSON.stringify(accept.body));
  var publisher = accept.cookie;

  var me = await request('GET', '/api/me', null, publisher);
  ok('they land as themselves', me.body.personId === 'p_20');
  ok('with the publisher role and nothing more',
    me.body.roles.indexOf('publisher') !== -1 && me.body.roles.indexOf('elder') === -1,
    JSON.stringify(me.body.roles));
  ok('and are not asked to change the password they just chose', me.body.mustChangePassword !== true);

  ok('the token cannot be used twice',
    [404, 410].indexOf((await request('POST', '/api/invite/accept',
      { token: token, password: 'another-password' })).status) !== -1);

  var signIn = await request('POST', '/api/login', { email: 'ruth@example.org', password: 'ruth-own-password' });
  ok('they can sign in again with their own password', signIn.status === 200);
  publisher = signIn.cookie;

  ok('a publisher cannot invite anyone',
    (await request('POST', '/api/invite', { personId: 'p_21', email: 'a@b.org' }, publisher)).status === 403);

  var accounts = await request('GET', '/api/accounts', null, admin);
  var row = (accounts.body.logins || []).filter(function (a) { return a.personId === 'p_20'; })[0];
  ok('the accounts list shows the publisher has a login', !!row && !!row.email, JSON.stringify(row));
  ok('and that the invitation was taken up',
    accounts.body.invites && accounts.body.invites.p_20 && accounts.body.invites.p_20.state === 'accepted',
    JSON.stringify(accounts.body.invites));

  // ---------- an assignment sends a message ----------
  console.log('\nbeing given something');

  var doc = (await request('GET', '/api/state', null, admin)).body.doc;
  var today = new Date().toISOString().slice(0, 10);
  var week = doc.weeks.filter(function (w) { return w.midweek.date > today && !w.midweek.cancelled; })[2];
  ok('there is a future week to work with', !!week);

  var before = outbox().length;
  var edited = JSON.parse(JSON.stringify(week));
  var part = edited.midweek.parts.filter(function (p) { return !p.assigneeId; })[0] || edited.midweek.parts[1];
  part.assigneeId = 'p_20';
  part.status = 'proposed';
  var push = await request('POST', '/api/changes',
    { since: doc ? undefined : 0, changes: [{ c: 'weeks', id: edited.id, op: 'put', rec: edited }] }, admin);
  ok('the elder can put her name against a part', push.body.applied === 1, JSON.stringify(push.body.rejected));

  box = await waitForMail(before + 1, 25);
  var note = box[box.length - 1];
  ok('she is emailed about it', box.length === before + 1 && /ruth@example\.org/.test(note.to),
    box.length + ' messages, last to ' + (note && note.to));
  ok('the message names the part', note && note.body.indexOf(part.title) !== -1, note && note.subject);
  ok('and the date it falls on', note && note.body.indexOf(String(+edited.midweek.date.slice(8, 10))) !== -1);

  // the same push again changes nothing, so nothing is sent
  before = outbox().length;
  await request('POST', '/api/changes',
    { changes: [{ c: 'weeks', id: edited.id, op: 'put', rec: edited }] }, admin);
  await wait(350);
  ok('putting the identical week back sends nothing more', outbox().length === before, outbox().length + ' vs ' + before);

  // a publisher confirming their own part must not email themselves
  before = outbox().length;
  var confirmDoc = (await request('GET', '/api/state', null, publisher)).body.doc;
  var mineWeek = JSON.parse(JSON.stringify(confirmDoc.weeks.filter(function (w) { return w.id === edited.id; })[0]));
  mineWeek.midweek.parts.filter(function (p) { return p.assigneeId === 'p_20'; }).forEach(function (p) {
    p.status = 'confirmed';
  });
  await request('POST', '/api/changes',
    { changes: [{ c: 'weeks', id: mineWeek.id, op: 'put', rec: mineWeek }] }, publisher);
  await wait(350);
  ok('confirming her own part emails nobody', outbox().length === before, outbox().length + ' vs ' + before);

  // someone who has turned assignment messages off is left alone
  console.log('\nwhat someone asked not to receive');
  var people = (await request('GET', '/api/state', null, admin)).body.doc.people;
  var quiet = JSON.parse(JSON.stringify(people.filter(function (p) { return p.id === 'p_20'; })[0]));
  quiet.notify = { assignments: false, digest: true, reports: true };
  await request('POST', '/api/changes',
    { changes: [{ c: 'people', id: 'p_20', op: 'put', rec: quiet }] }, admin);

  before = outbox().length;
  var doc2 = (await request('GET', '/api/state', null, admin)).body.doc;
  var week2 = JSON.parse(JSON.stringify(doc2.weeks.filter(function (w) { return w.midweek.date > today; })[4]));
  var part2 = week2.midweek.parts.filter(function (p) { return !p.assigneeId; })[0] || week2.midweek.parts[2];
  part2.assigneeId = 'p_20';
  await request('POST', '/api/changes',
    { changes: [{ c: 'weeks', id: week2.id, op: 'put', rec: week2 }] }, admin);
  await wait(400);
  ok('nothing is sent to her', outbox().length === before, outbox().length + ' vs ' + before);

  // and a duty does reach someone who has not turned them off
  before = outbox().length;
  var invite2 = await request('POST', '/api/invite', { personId: 'p_21', email: 'peter@example.org' }, admin);
  ok('a second publisher is invited', invite2.status === 200);
  await waitForMail(before + 1, 25);
  before = outbox().length;

  var duty = {
    id: 'duty_test_1', congId: 'cong_riverside', date: week.midweek.date,
    type: 'attendant_main', personId: 'p_21', notes: ''
  };
  var dutyPush = await request('POST', '/api/changes',
    { changes: [{ c: 'duties', id: duty.id, op: 'put', rec: duty }] }, admin);
  ok('a duty can be given', dutyPush.body.applied === 1, JSON.stringify(dutyPush.body.rejected));
  box = await waitForMail(before + 1, 25);
  ok('and it is emailed too', box.length === before + 1 && /peter@example\.org/.test(box[box.length - 1].to),
    box.length + ' vs ' + before);

  // ---------- the calendar ----------
  console.log('\ncalendar subscription');

  var link = await request('POST', '/api/calendar/link', {}, publisher);
  ok('a publisher can make their own calendar link', link.status === 200 && /\/calendar\/.+\.ics$/.test(link.body.url || ''),
    JSON.stringify(link.body));
  ok('and a webcal:// version for phones', /^webcal:/.test(link.body.webcal || ''));

  var feedPath = link.body.url.replace(BASE, '');
  var feed = await request('GET', feedPath);
  ok('the feed is served without a cookie, on the token alone', feed.status === 200, String(feed.status));
  ok('it is a calendar', /text\/calendar/.test(feed.headers['content-type'] || ''), feed.headers['content-type']);
  ok('it holds her part', feed.text.indexOf('BEGIN:VEVENT') !== -1 && feed.text.indexOf(part.title.slice(0, 20)) !== -1);
  ok('it is properly terminated', /END:VCALENDAR\r\n$/.test(feed.text));
  ok('no line is longer than iCalendar allows',
    feed.text.split('\r\n').every(function (l) { return Buffer.byteLength(l, 'utf8') <= 75; }),
    (feed.text.split('\r\n').filter(function (l) { return Buffer.byteLength(l) > 75; })[0] || '').slice(0, 90));

  var wrongToken = await request('GET', '/calendar/' + 'z'.repeat(32) + '.ics');
  ok('a made-up calendar address gives nothing away', wrongToken.status === 404);

  ok('one publisher cannot make a link for another',
    (await request('POST', '/api/calendar/link', { personId: 'p_21' }, publisher)).status === 403);

  var reset = await request('POST', '/api/calendar/link', { reset: true }, publisher);
  ok('the link can be replaced if it gets out', reset.body.url !== link.body.url);
  ok('and the old one stops working', (await request('GET', feedPath)).status === 404);

  // ---------- email settings ----------
  console.log('\nemail settings');

  var mailGet = await request('GET', '/api/mail', null, admin);
  ok('an administrator can read the settings', mailGet.status === 200, JSON.stringify(mailGet.body).slice(0, 120));
  ok('a publisher cannot', (await request('GET', '/api/mail', null, publisher)).status === 403);
  ok('nor change them',
    (await request('POST', '/api/mail', { settings: { transport: 'off' } }, publisher)).status === 403);

  var saved = await request('POST', '/api/mail', { settings: {
    transport: 'smtp', host: 'smtp.example.org', port: '465', secure: true,
    user: 'hall@example.org', pass: 'app-password-here', from: 'hall@example.org'
  } }, admin);
  ok('settings save', saved.status === 200 && saved.body.settings.host === 'smtp.example.org');
  ok('the port is stored as a number', saved.body.settings.port === 465, typeof saved.body.settings.port);
  ok('the password is never handed back',
    JSON.stringify(saved.body).indexOf('app-password-here') === -1 && saved.body.settings.hasPassword === true);

  var kept = await request('POST', '/api/mail', { settings: { host: 'smtp2.example.org', pass: '' } }, admin);
  ok('saving with the password box left blank keeps the old one', kept.body.settings.hasPassword === true);
  ok('while the rest still changes', kept.body.settings.host === 'smtp2.example.org');

  var onDisk = JSON.parse(fs.readFileSync(path.join(DATA, 'mail.json'), 'utf8'));
  ok('it is stored where only the server can read it',
    (fs.statSync(path.join(DATA, 'mail.json')).mode & 0o077) === 0);
  ok('and it really is the password we set', onDisk.pass === 'app-password-here');

  // put it back so nothing tries to reach a real server
  await request('POST', '/api/mail', { settings: { transport: 'file' } }, admin);

  // ---------- the messages themselves ----------
  console.log('\nthe weekly digest and the report reminder');
  var NotifyMod = require(path.join(__dirname, '..', 'server', 'notify.js'));
  var sent = [];
  var fakeMail = { enqueue: function (m) { sent.push(m); return m; } };
  var notify = new NotifyMod(fs.mkdtempSync(path.join(DATA, 'unit-')), fakeMail);
  var ruth = { id: 'p_20', firstName: 'Ruth', lastName: 'Adeyemi', email: 'ruth@example.org' };
  var cong = { id: 'c1', name: 'Riverside Congregation' };

  notify.digestEmail({
    person: ruth, cong: cong, baseUrl: 'https://hall.example.org',
    items: [
      { title: 'Starting a Conversation', date: '2026-09-03', time: '19:00', assistant: false },
      { title: 'Attendant — main door', date: '2026-09-06', assistant: false }
    ]
  });
  var digest = sent[sent.length - 1];
  ok('the digest goes to the right person', digest.to === 'ruth@example.org', digest.to);
  ok('it lists both things', digest.text.indexOf('Starting a Conversation') !== -1
    && digest.text.indexOf('Attendant') !== -1);
  ok('it links to their own page', digest.text.indexOf('https://hall.example.org/#/my-assignments') !== -1);
  ok('the HTML version escapes anything odd in a name',
    (function () {
      sent.length = 0;
      notify.digestEmail({
        person: { id: 'p_x', firstName: '<script>alert(1)</script>', email: 'x@example.org' },
        cong: cong, baseUrl: 'https://hall.example.org',
        items: [{ title: 'Bible reading', date: '2026-09-03', assistant: false }]
      });
      return sent[0].html.indexOf('<script>') === -1;
    })(), sent[0] && sent[0].html.slice(0, 120));

  sent.length = 0;
  notify.reportReminderEmail({ person: ruth, cong: cong, period: '2026-08', baseUrl: 'https://hall.example.org' });
  ok('the report reminder names the month', /August/.test(sent[0].text), sent[0].text.slice(0, 80));
  ok('and links to the report page', sent[0].text.indexOf('/#/my-report') !== -1);
  ok('every message says what it is, so the outbox can be read',
    ['digest', 'report'].indexOf(sent[0].kind) !== -1, sent[0].kind);

  // ---------- the calendar file itself ----------
  console.log('\nthe calendar file');
  var ics = NotifyMod.buildIcs('Riverside — Ruth', [{
    uid: 'x1', title: 'Starting a conversation; a line long enough that it has to be folded across two lines',
    date: '2026-09-03', time: '19:00', minutes: 15,
    location: 'Kingdom Hall, 14 River Road', description: 'With Grace Mensah\nHousehold; note the comma, and semicolon;'
  }]);
  var unfolded = ics.replace(/\r\n /g, '');
  ok('it declares itself a calendar', ics.indexOf('BEGIN:VCALENDAR') === 0);
  ok('the event has a start and an end', /DTSTART:20260903T190000/.test(ics) && /DTEND:20260903T191500/.test(ics));
  ok('commas and semicolons are escaped', /note the comma\\, and semicolon\\;/.test(unfolded), unfolded.slice(0, 400));
  ok('newlines inside the note survive', /\\nHousehold/.test(unfolded));
  ok('a reminder is set', ics.indexOf('BEGIN:VALARM') !== -1);
  ok('every line, the reminder included, is folded to the octet limit',
    ics.split('\r\n').every(function (l) { return Buffer.byteLength(l, 'utf8') <= 75; }),
    (ics.split('\r\n').filter(function (l) { return Buffer.byteLength(l) > 75; })[0] || '').slice(0, 90));
  ok('and it unfolds back to the original text',
    unfolded.indexOf('folded across two lines') !== -1);

  console.log('\n' + (failures ? failures + ' failed' : 'all good'));
  stop(failures ? 1 : 0);
})().catch(function (e) { console.error(e); stop(1); });
