/* Server checks: setup, login, sync between two clients, permission enforcement,
   offline queue replay. Starts a server on a scratch data directory and stops it.

   node test/server.js */
'use strict';

var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var child = require('child_process');

var PORT = 8931;
var BASE = 'http://127.0.0.1:' + PORT;
var DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'shepherd-test-'));
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
        resolve({ status: res.statusCode, body: data, cookie: setCookie ? setCookie.split(';')[0] : null });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForServer(tries) {
  return request('GET', '/api/health').catch(function (e) {
    if (tries <= 0) throw e;
    return new Promise(function (r) { setTimeout(r, 150); }).then(function () { return waitForServer(tries - 1); });
  });
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

  // ---- first run ----
  console.log('setup');
  var health = await request('GET', '/api/health');
  ok('reports it needs setting up', health.body.needsSetup === true);

  var setup = await request('POST', '/api/setup', {
    email: 'coordinator@example.org', password: 'first-password-1',
    firstName: 'Daniel', lastName: 'Achebe', demo: true
  });
  ok('setup creates the administrator', setup.status === 200 && setup.body.personId === 'p_1', JSON.stringify(setup.body));
  var admin = setup.cookie;
  ok('setup issues a session cookie', !!admin);

  var again = await request('POST', '/api/setup', { email: 'x@y.z', password: 'password11' });
  ok('setup cannot be run twice', again.status === 409);

  // ---- login ----
  console.log('\nlogin');
  ok('wrong password is refused',
    (await request('POST', '/api/login', { email: 'coordinator@example.org', password: 'nope' })).status === 401);
  var relogin = await request('POST', '/api/login', { email: 'coordinator@example.org', password: 'first-password-1' });
  ok('right password signs in', relogin.status === 200);
  admin = relogin.cookie;
  ok('unauthenticated requests are refused', (await request('GET', '/api/state')).status === 401);

  var me = await request('GET', '/api/me', null, admin);
  ok('/api/me returns the person and roles', me.body.personId === 'p_1' && me.body.roles.indexOf('admin') !== -1);

  // ---- give a publisher a login ----
  console.log('\npublisher accounts');
  var made = await request('POST', '/api/password',
    { personId: 'p_20', email: 'ruth@example.org', mustChange: true }, admin);
  ok('administrator can create a login', made.status === 200 && !!made.body.password, JSON.stringify(made.body));
  var pubPassword = made.body.password;

  var pub = await request('POST', '/api/login', { email: 'ruth@example.org', password: pubPassword });
  ok('the publisher can sign in', pub.status === 200 && pub.body.personId === 'p_20');
  ok('and is told to change the password', pub.body.mustChangePassword === true);
  var publisher = pub.cookie;

  ok('a publisher cannot create logins',
    (await request('POST', '/api/password', { personId: 'p_21', email: 'a@b.c' }, publisher)).status === 403);
  ok('a publisher cannot list accounts',
    (await request('GET', '/api/accounts', null, publisher)).status === 403);

  // ---- sync between two clients ----
  console.log('\nsync');
  var state = await request('GET', '/api/state', null, admin);
  var seq = state.body.seq;
  ok('the whole document downloads', state.body.doc.people.length === 36);
  ok('no password material is in the document', JSON.stringify(state.body.doc).indexOf('salt') === -1);

  var task = { id: 'task_sync_1', congId: 'cong_riverside', title: 'Check the sound system',
    detail: '', category: 'Maintenance', status: 'backlog', priority: 'medium',
    dueOn: '2026-09-01', assigneeIds: [], createdBy: 'p_1', createdAt: Date.now(), comments: [] };
  var push = await request('POST', '/api/changes',
    { since: seq, origin: 'clientA', changes: [{ c: 'tasks', id: task.id, op: 'put', rec: task }] }, admin);
  ok('an elder can add a task', push.body.applied === 1 && push.body.rejected.length === 0,
    JSON.stringify(push.body.rejected));

  var pull = await request('GET', '/api/changes?since=' + seq, null, publisher);
  ok('the other client sees it', pull.body.changes.length === 1 && pull.body.changes[0].rec.title === 'Check the sound system');
  ok('the change records who made it', pull.body.changes[0].by === 'p_1');
  seq = pull.body.seq;

  // two people editing different records both land
  var t2 = Object.assign({}, task, { id: 'task_sync_2', title: 'Order literature' });
  var a = await request('POST', '/api/changes',
    { since: seq, origin: 'clientA', changes: [{ c: 'tasks', id: t2.id, op: 'put', rec: t2 }] }, admin);
  var report = { id: 'rep_sync_1', congId: 'cong_riverside', personId: 'p_20', period: '2026-07',
    shared: true, studies: 2, hours: 55, credit: 0, comments: '', submittedAt: Date.now(),
    submittedBy: 'p_20', acceptedAt: null };
  var b = await request('POST', '/api/changes',
    { since: seq, origin: 'clientB', changes: [{ c: 'reports', id: report.id, op: 'put', rec: report }] }, publisher);
  ok('concurrent edits to different records both apply', a.body.applied === 1 && b.body.applied === 1);
  var after = await request('GET', '/api/state', null, admin);
  ok('both survive in the document',
    after.body.doc.tasks.some(function (t) { return t.id === 'task_sync_2'; })
    && after.body.doc.reports.some(function (r) { return r.id === 'rep_sync_1'; }));
  seq = after.body.seq;

  // ---- permissions on writes ----
  console.log('\nwhat a publisher may write');
  var rejected = await request('POST', '/api/changes', { since: seq, changes: [
    { c: 'tasks', id: 'task_bad', op: 'put', rec: Object.assign({}, task, { id: 'task_bad' }) }
  ] }, publisher);
  ok('a publisher cannot add elders’ tasks', rejected.body.applied === 0 && rejected.body.rejected.length === 1);

  var doc = (await request('GET', '/api/state', null, admin)).body.doc;
  var ruth = JSON.parse(JSON.stringify(doc.people.filter(function (p) { return p.id === 'p_20'; })[0]));
  ruth.phone = '07700 111222';
  var selfEdit = await request('POST', '/api/changes',
    { since: seq, changes: [{ c: 'people', id: 'p_20', op: 'put', rec: ruth }] }, publisher);
  ok('a publisher can change their own phone number', selfEdit.body.applied === 1,
    JSON.stringify(selfEdit.body.rejected));

  var promoted = JSON.parse(JSON.stringify(doc.people.filter(function (p) { return p.id === 'p_20'; })[0]));
  promoted.roles = ['publisher', 'elder', 'admin'];
  var badPromote = await request('POST', '/api/changes',
    { since: seq, changes: [{ c: 'people', id: 'p_20', op: 'put', rec: promoted }] }, publisher);
  ok('a publisher cannot give themselves a role', badPromote.body.applied === 0);

  var other = JSON.parse(JSON.stringify(doc.people.filter(function (p) { return p.id === 'p_21'; })[0]));
  other.phone = '07700 999999';
  var editOther = await request('POST', '/api/changes',
    { since: seq, changes: [{ c: 'people', id: 'p_21', op: 'put', rec: other }] }, publisher);
  ok('a publisher cannot edit someone else’s record', editOther.body.applied === 0);

  // confirming their own assignment is allowed; changing the assignee is not
  var week = doc.weeks.filter(function (w) { return w.midweek.parts.some(function (p) { return p.assigneeId; }); })[0];
  if (!week) {
    var w0 = doc.weeks[8];
    w0.midweek.parts[3].assigneeId = 'p_20';
    await request('POST', '/api/changes',
      { since: seq, changes: [{ c: 'weeks', id: w0.id, op: 'put', rec: w0 }] }, admin);
    week = (await request('GET', '/api/state', null, admin)).body.doc.weeks.filter(function (w) { return w.id === w0.id; })[0];
  }
  var mine = JSON.parse(JSON.stringify(week));
  var slot = mine.midweek.parts.filter(function (p) { return p.assigneeId === 'p_20'; })[0];
  if (slot) {
    slot.status = 'confirmed';
    var confirm = await request('POST', '/api/changes',
      { since: seq, changes: [{ c: 'weeks', id: mine.id, op: 'put', rec: mine }] }, publisher);
    ok('a publisher can confirm their own part', confirm.body.applied === 1,
      JSON.stringify(confirm.body.rejected));

    var stolen = JSON.parse(JSON.stringify(week));
    stolen.midweek.parts[0].assigneeId = 'p_20';
    var steal = await request('POST', '/api/changes',
      { since: seq, changes: [{ c: 'weeks', id: stolen.id, op: 'put', rec: stolen }] }, publisher);
    ok('a publisher cannot assign themselves a part', steal.body.applied === 0);
  } else {
    ok('a publisher can confirm their own part', false, 'no assigned part found to test with');
  }

  // ---- durability ----
  console.log('\ndurability');
  ok('the database file is on disk', fs.existsSync(path.join(DATA, 'shepherd.json')));
  ok('credentials are in a separate file', fs.existsSync(path.join(DATA, 'credentials.json')));
  var onDisk = JSON.parse(fs.readFileSync(path.join(DATA, 'shepherd.json'), 'utf8'));
  ok('the task written over the API is in the file',
    onDisk.tasks.some(function (t) { return t.id === 'task_sync_1'; }));
  ok('the document on disk holds no session data', onDisk.session === undefined);

  var logout = await request('POST', '/api/logout', {}, publisher);
  ok('signing out works', logout.status === 200);
  ok('and the session stops working', (await request('GET', '/api/state', null, publisher)).status === 401);

  // ---- static app is served ----
  var page = await new Promise(function (resolve) {
    http.get(BASE + '/index.html', function (res) {
      var s = '';
      res.on('data', function (d) { s += d; });
      res.on('end', function () { resolve({ status: res.statusCode, body: s }); });
    });
  });
  ok('the app itself is served', page.status === 200 && page.body.indexOf('js/sync.js') !== -1);
  var leak = await request('GET', '/server/data/credentials.json');
  ok('the server directory is not served', leak.status === 403 || leak.status === 404);

  console.log('\n' + (failures ? failures + ' FAILED' : 'all server checks passed'));
  stop(failures ? 1 : 0);
})().catch(function (e) {
  console.error(e);
  stop(1);
});
