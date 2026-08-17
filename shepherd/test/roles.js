/* Roles & responsibilities: the default arrangement follows how the work is
   normally divided, a congregation can change it, group-scoped grants really do
   narrow what a person sees, and the server enforces the congregation's own
   arrangement rather than a hardcoded one.

   node test/roles.js */
'use strict';

var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var child = require('child_process');

var PORT = 8933;
var BASE = 'http://127.0.0.1:' + PORT;
var DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'shepherd-roles-'));
var failures = 0;

function ok(name, cond, detail) {
  if (cond) console.log('  ✓ ' + name);
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
        var sc = (res.headers['set-cookie'] || [])[0];
        resolve({ status: res.statusCode, body: data, cookie: sc ? sc.split(';')[0] : null });
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

/* ---------- part 1: the arrangement itself, no server needed ---------- */

require('../js/util.js');
require('../js/schema.js');
var S = globalThis.Schema;

console.log('the default arrangement');
function holds(cap, role) { return S.grantFor(S.DEFAULT_MATRIX, cap, role); }

ok('the Life and Ministry overseer prepares the meeting schedule', holds('schedule.edit', 'life_ministry') === 'all');
ok('an elder without that assignment does not', holds('schedule.edit', 'elder') === 'none');
ok('the secretary keeps the publisher records', holds('publishers.edit', 'secretary') === 'all');
ok('the service overseer does not keep them', holds('publishers.edit', 'service') === 'none');
ok('the service overseer cares for territories', holds('territories.manage', 'service') === 'all');
ok('the territory servant does too', holds('territories.manage', 'territory') === 'all');
ok('the accounts servant keeps the accounts', holds('accounts.edit', 'accounts') === 'all');
ok('the secretary can see but not change them',
  holds('accounts.view', 'secretary') === 'all' && holds('accounts.edit', 'secretary') === 'none');
ok('the coordinator holds every area',
  S.CAPABILITIES.filter(function (c) { return holds(c.id, 'coordinator') === 'none'; }).length === 0,
  'missing: ' + S.CAPABILITIES.filter(function (c) { return holds(c.id, 'coordinator') === 'none'; })
    .map(function (c) { return c.id; }).join(', '));
ok('a group overseer collects reports for his own group only', holds('reports.review', 'group_overseer') === 'group');
ok('and sees publisher records for his own group only', holds('publishers.view', 'group_overseer') === 'group');
ok('the secretary sees all of them', holds('publishers.view', 'secretary') === 'all');
ok('a plain publisher holds nothing beyond viewing and their own report',
  S.CAPABILITIES.filter(function (c) { return holds(c.id, 'publisher') !== 'none'; })
    .every(function (c) { return /\.view$|\.submit$/.test(c.id); }));

console.log('\na congregation changing it');
var cong = { roleMatrix: JSON.parse(JSON.stringify(S.DEFAULT_MATRIX)) };
cong.roleMatrix['schedule.edit'].elder = 'all';
delete cong.roleMatrix['publishers.edit'].secretary;
var m = S.matrixFor(cong);
ok('a congregation can let every elder prepare the schedule', S.grantFor(m, 'schedule.edit', 'elder') === 'all');
ok('and can take something away from the secretary', S.grantFor(m, 'publishers.edit', 'secretary') === 'none');
ok('a congregation with no arrangement of its own gets the default',
  S.matrixFor({}) === S.DEFAULT_MATRIX);

/* ---------- part 2: the server enforcing it ---------- */

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
  console.log('\nthe server enforcing it');

  var setup = await request('POST', '/api/setup', {
    email: 'coordinator@example.org', password: 'coordinator-pass', demo: true
  });
  var admin = setup.cookie;

  // p_5 (Andrew Tanaka) is a group overseer in Group 1; p_9 (Philip Osei) is in Group 1 too.
  var doc = (await request('GET', '/api/state', null, admin)).body.doc;
  var overseer = doc.people.filter(function (p) { return p.id === 'p_5'; })[0];
  var sameGroup = doc.people.filter(function (p) {
    return p.serviceGroupId === overseer.serviceGroupId && p.id !== overseer.id;
  })[0];
  var otherGroup = doc.people.filter(function (p) {
    return p.serviceGroupId !== overseer.serviceGroupId;
  })[0];

  // give the group overseer a login, and take the elder role off so only the
  // group-scoped grant remains
  var stripped = JSON.parse(JSON.stringify(overseer));
  stripped.roles = ['group_overseer', 'publisher'];
  var seq = (await request('GET', '/api/state', null, admin)).body.seq;
  await request('POST', '/api/changes',
    { since: seq, changes: [{ c: 'people', id: overseer.id, op: 'put', rec: stripped }] }, admin);
  var made = await request('POST', '/api/password',
    { personId: overseer.id, email: 'overseer@example.org' }, admin);
  var login = await request('POST', '/api/login', { email: 'overseer@example.org', password: made.body.password });
  var go = login.cookie;
  ok('the group overseer can sign in', login.status === 200);

  seq = (await request('GET', '/api/state', null, admin)).body.seq;

  function reportFor(person, id) {
    return { id: id, congId: person.congId, personId: person.id, period: '2026-05', shared: true,
      studies: 1, hours: null, credit: 0, comments: '', submittedAt: Date.now(),
      submittedBy: person.id, acceptedAt: null };
  }

  var own = await request('POST', '/api/changes', { since: seq, changes: [
    { c: 'reports', id: 'rep_own_group', op: 'put', rec: reportFor(sameGroup, 'rep_own_group') }
  ] }, go);
  ok('he can record a report for his own group', own.body.applied === 1,
    JSON.stringify(own.body.rejected));

  var other = await request('POST', '/api/changes', { since: seq, changes: [
    { c: 'reports', id: 'rep_other_group', op: 'put', rec: reportFor(otherGroup, 'rep_other_group') }
  ] }, go);
  ok('but not for another group', other.body.applied === 0 && /service group/.test((other.body.rejected[0] || {}).reason || ''),
    JSON.stringify(other.body.rejected));

  var task = { id: 'task_go', congId: overseer.congId, title: 'Not his to raise', detail: '',
    category: 'Other', status: 'backlog', priority: 'low', dueOn: null, assigneeIds: [],
    createdBy: overseer.id, createdAt: Date.now(), comments: [] };
  var t = await request('POST', '/api/changes',
    { since: seq, changes: [{ c: 'tasks', id: task.id, op: 'put', rec: task }] }, go);
  ok('and cannot raise elders’ tasks by default', t.body.applied === 0);

  // now the congregation decides group overseers may raise tasks
  var congRec = JSON.parse(JSON.stringify(doc.congregations.filter(function (c) { return c.id === overseer.congId; })[0]));
  congRec.roleMatrix = JSON.parse(JSON.stringify(S.DEFAULT_MATRIX));
  congRec.roleMatrix['tasks.edit'].group_overseer = 'all';
  var save = await request('POST', '/api/changes',
    { since: seq, changes: [{ c: 'congregations', id: congRec.id, op: 'put', rec: congRec }] }, admin);
  ok('an administrator can save a new arrangement', save.body.applied === 1,
    JSON.stringify(save.body.rejected));

  seq = (await request('GET', '/api/state', null, admin)).body.seq;
  var t2 = await request('POST', '/api/changes',
    { since: seq, changes: [{ c: 'tasks', id: 'task_go2', op: 'put', rec: Object.assign({}, task, { id: 'task_go2' }) }] }, go);
  ok('the server immediately honours it', t2.body.applied === 1, JSON.stringify(t2.body.rejected));

  // ...and taking it away again closes it
  congRec.roleMatrix['tasks.edit'].group_overseer = undefined;
  delete congRec.roleMatrix['tasks.edit'].group_overseer;
  seq = (await request('GET', '/api/state', null, admin)).body.seq;
  await request('POST', '/api/changes',
    { since: seq, changes: [{ c: 'congregations', id: congRec.id, op: 'put', rec: congRec }] }, admin);
  seq = (await request('GET', '/api/state', null, admin)).body.seq;
  var t3 = await request('POST', '/api/changes',
    { since: seq, changes: [{ c: 'tasks', id: 'task_go3', op: 'put', rec: Object.assign({}, task, { id: 'task_go3' }) }] }, go);
  ok('and taking it away closes it again', t3.body.applied === 0);

  var congAttempt = JSON.parse(JSON.stringify(congRec));
  congAttempt.roleMatrix['admin.manage'] = { group_overseer: 'all' };
  seq = (await request('GET', '/api/state', null, admin)).body.seq;
  var sneaky = await request('POST', '/api/changes',
    { since: seq, changes: [{ c: 'congregations', id: congRec.id, op: 'put', rec: congAttempt }] }, go);
  ok('a group overseer cannot rewrite the arrangement himself', sneaky.body.applied === 0);

  console.log('\n' + (failures ? failures + ' FAILED' : 'all role checks passed'));
  stop(failures ? 1 : 0);
})().catch(function (e) {
  console.error(e);
  stop(1);
});
