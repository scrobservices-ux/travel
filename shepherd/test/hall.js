/* The Kingdom Hall arrangements, in a real browser and against a real server:
 *
 *   the cleaning rota goes round the groups and nobody is missed
 *   the circuit overseer's visit lays itself out backwards from his arrival
 *   an elder can tick off his own job but cannot move anybody else's
 *
 * node test/hall.js */
'use strict';

var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var child = require('child_process');
var { chromium } = require('playwright');

var PORT = 8936;
var BASE = 'http://127.0.0.1:' + PORT;
var DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'shepherd-hall-'));
var APP = 'file://' + path.resolve(__dirname, '..', 'index.html');
var failures = 0;

function ok(name, condition, detail) {
  if (condition) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  var base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  var dir = fs.readdirSync(base).filter(function (d) { return /^chromium-\d+$/.test(d); }).sort().pop();
  if (!dir) return undefined;
  var cands = ['chrome-linux/chrome', 'chrome-linux64/chrome',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe'];
  for (var i = 0; i < cands.length; i++) {
    var full = base + '/' + dir + '/' + cands[i];
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}
var LAUNCH = chromePath() ? { executablePath: chromePath() } : {};

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
        resolve({ status: res.statusCode, body: data, text: text, headers: res.headers,
          cookie: (res.headers['set-cookie'] || [])[0] });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function waitForServer(n) {
  return request('GET', '/api/health').catch(function (e) {
    if (n <= 0) throw e;
    return wait(150).then(function () { return waitForServer(n - 1); });
  });
}
/* everything the server has queued or sent, with its kind and its recipient */
function outbox() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, 'outbox.json'), 'utf8')); }
  catch (e) { return []; }
}
function ofKind(kind) {
  return outbox().filter(function (m) { return m.kind === kind; });
}

var server = child.spawn(process.execPath,
  [path.join(__dirname, '..', 'server', 'server.js'), '--port', String(PORT), '--host', '127.0.0.1', '--data', DATA],
  { stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', function (d) { process.stderr.write('[server] ' + d); });

var browser = null;
async function stop(code) {
  if (browser) await browser.close().catch(function () { });
  server.kill('SIGTERM');
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(code);
}

(async function () {
  browser = await chromium.launch(LAUNCH);

  /* ================= the rota, in the browser ================= */
  console.log('the cleaning rota');
  var page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  var errors = [];
  page.on('pageerror', function (e) { errors.push('PAGEERROR: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto(APP);
  await page.waitForTimeout(500);

  // start from an empty rota so the rotation can be watched from the beginning
  var rota = await page.evaluate(function () {
    Store.update(function (st) { st.cleaning = []; });
    var plan = Clean.plan(U.weekStart(U.today()), 12);
    return {
      count: plan.items.length,
      groups: Store.groups().length,
      order: plan.items.filter(function (i) { return i.kind === 'group'; })
        .map(function (i) { return (Store.group(i.groupIds[0]) || {}).name; }),
      kinds: plan.items.map(function (i) { return i.kind; }),
      dates: plan.items.map(function (i) { return i.date; })
    };
  });
  ok('a plan is produced for every meeting in the stretch', rota.count >= 12, rota.count + ' dates');
  ok('the groups come round in order, over and over',
    rota.order.slice(0, rota.groups * 2).join('|') ===
      rota.order.slice(0, rota.groups).concat(rota.order.slice(0, rota.groups)).join('|'),
    rota.order.slice(0, 8).join(' → '));
  ok('every group gets a turn', new Set(rota.order.slice(0, rota.groups)).size === rota.groups,
    JSON.stringify(rota.order.slice(0, rota.groups)));
  ok('the monthly general cleaning is in there too',
    rota.kinds.indexOf('general') !== -1, JSON.stringify(rota.kinds.slice(0, 6)));
  ok('the dates come out in order',
    rota.dates.join() === rota.dates.slice().sort().join());

  // apply it, then check the rotation carries on from a manual swap
  var carry = await page.evaluate(function () {
    // a body of elders puts one turn in by hand, last week, for the third group
    var groups = Clean.groupsInOrder();
    Store.update(function (st) {
      st.cleaning = [{
        id: 'cln_manual', congId: Store.congId(), date: U.addDays(U.today(), -3),
        kind: 'group', groupIds: [groups[2].id], meeting: 'weekend', time: '10:00',
        notes: 'swapped', doneAt: null, doneBy: null
      }];
    });
    var plan = Clean.plan(U.weekStart(U.today()), 8);
    var firstProposed = plan.items.filter(function (i) { return i.kind === 'group'; })[0];
    Store.update(function (st) { plan.items.forEach(function (i) { st.cleaning.push(i); }); });
    return {
      manual: groups[2].name,
      nextAfterSwap: (Store.group(firstProposed.groupIds[0]) || {}).name,
      expected: groups[3 % groups.length].name,
      skipped: Clean.plan(U.weekStart(U.today()), 8).skipped.length
    };
  });
  ok('a turn set by hand sticks, and the rotation carries on from it',
    carry.nextAfterSwap === carry.expected,
    'by hand ' + carry.manual + ', next proposed ' + carry.nextAfterSwap + ' (expected ' + carry.expected + ')');
  ok('re-running the fill does not double-book a date', carry.skipped > 0, String(carry.skipped));

  // what a publisher sees
  var pub = await page.evaluate(function () {
    var ruth = Store.person('p_20');
    var mine = Clean.forPerson(ruth, U.today(), U.addDays(U.today(), 200));
    var group = Store.group(ruth.serviceGroupId);
    return {
      mine: mine.length,
      allMineAreMineOrGeneral: mine.every(function (c) {
        return c.kind === 'general' || c.groupIds.indexOf(ruth.serviceGroupId) !== -1;
      }),
      group: group ? group.name : null,
      generalIncluded: mine.some(function (c) { return c.kind === 'general'; })
    };
  });
  ok('a publisher sees her own group’s turns', pub.mine > 0 && pub.allMineAreMineOrGeneral, JSON.stringify(pub));
  ok('and the general cleaning, which is for everyone', pub.generalIncluded);

  ok('nothing threw in the browser', errors.length === 0, errors.slice(0, 2).join(' | '));

  /* ================= the circuit overseer's visit ================= */
  console.log('\nthe circuit overseer’s visit');
  var co = await page.evaluate(function () {
    var from = U.addDays(U.weekStart(U.today()), 56);
    var visit = CO.build({ from: from, coName: 'Brother Marcus Bello' });
    var byWeeks = {};
    visit.tasks.forEach(function (t) { byWeeks[t.weeksBefore] = (byWeeks[t.weeksBefore] || 0) + 1; });
    return {
      from: from,
      tasks: visit.tasks.length,
      dated: visit.tasks.every(function (t) { return !!t.dueOn; }),
      eightWeeksOut: visit.tasks.filter(function (t) { return t.weeksBefore === 8; })
        .every(function (t) { return t.dueOn === U.addDays(from, -56); }),
      afterwards: visit.tasks.filter(function (t) { return t.weeksBefore < 0; }).length,
      named: visit.tasks.filter(function (t) { return !!t.personId; }).length,
      roles: visit.tasks.map(function (t) { return t.role; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length,
      stages: CO.stages(visit).map(function (s) { return s.name + ':' + s.tasks.length; })
    };
  });
  ok('the whole checklist is laid out', co.tasks >= 15, co.tasks + ' jobs');
  ok('every job has a day it is wanted by', co.dated);
  ok('the earliest are dated eight weeks back from his arrival', co.eightWeeksOut);
  ok('and some fall after he has gone', co.afterwards > 0, String(co.afterwards));
  ok('each job goes to whoever holds that responsibility', co.named === co.tasks,
    co.named + ' of ' + co.tasks + ' have a name — a role nobody holds is left blank and flagged');
  ok('the work is spread over several brothers, not one', co.roles >= 6, co.roles + ' different roles');
  ok('and it reads as a timeline', co.stages.length >= 4, co.stages.join(' · '));

  var moved = await page.evaluate(function () {
    var from = U.addDays(U.weekStart(U.today()), 56);
    var visit = CO.build({ from: from });
    var doneTask = visit.tasks[0];
    doneTask.doneAt = Date.now();
    var doneDue = doneTask.dueOn;
    var openTask = visit.tasks[1];
    var openDue = openTask.dueOn;
    CO.reschedule(visit, U.addDays(from, 14), U.addDays(from, 19));
    return {
      doneKept: visit.tasks[0].dueOn === doneDue,
      openMoved: visit.tasks[1].dueOn === U.addDays(openDue, 14),
      progress: CO.progress(visit)
    };
  });
  ok('when the dates move, what is still to do moves with them', moved.openMoved);
  ok('but a job already done keeps the day it was done by', moved.doneKept);
  ok('progress is counted', moved.progress.total > 0 && moved.progress.done === 1,
    JSON.stringify({ done: moved.progress.done, total: moved.progress.total }));

  await page.close();

  /* ================= against the server ================= */
  console.log('\nwhat the server allows');
  await waitForServer(40);
  var setup = await request('POST', '/api/setup', {
    email: 'coordinator@example.org', password: 'first-password-1',
    firstName: 'Daniel', lastName: 'Achebe', demo: true
  });
  var admin = setup.cookie ? setup.cookie.split(';')[0] : null;
  ok('the server is set up', setup.status === 200 && !!admin);

  var doc = (await request('GET', '/api/state', null, admin)).body.doc;
  ok('the demo congregation has a rota', (doc.cleaning || []).length > 0, (doc.cleaning || []).length + ' dates');
  ok('and a visit being prepared', (doc.covisits || []).length === 1);
  var visit = doc.covisits[0];

  // an ordinary publisher: give Ruth a login
  var made = await request('POST', '/api/password',
    { personId: 'p_20', email: 'ruth@example.org', mustChange: false }, admin);
  var ruthCookie = (await request('POST', '/api/login',
    { email: 'ruth@example.org', password: made.body.password })).cookie;

  var item = { id: 'cln_new_1', congId: 'cong_riverside', date: '2027-01-09', kind: 'general',
    groupIds: [], meeting: null, time: '09:00', minutes: 180, notes: '', doneAt: null, doneBy: null };
  ok('the coordinator can put a cleaning date up',
    (await request('POST', '/api/changes',
      { changes: [{ c: 'cleaning', id: item.id, op: 'put', rec: item }] }, admin)).body.applied === 1);
  ok('a publisher cannot',
    (await request('POST', '/api/changes',
      { changes: [{ c: 'cleaning', id: 'cln_bad', op: 'put', rec: Object.assign({}, item, { id: 'cln_bad' }) }] },
      ruthCookie)).body.applied === 0);

  // an elder ticking off his own job
  var elder = doc.people.filter(function (p) { return p.id === 'p_2'; })[0];   // the secretary
  var madeElder = await request('POST', '/api/password',
    { personId: elder.id, email: 'secretary@example.org', mustChange: false }, admin);
  var secretary = (await request('POST', '/api/login',
    { email: 'secretary@example.org', password: madeElder.body.password })).cookie;

  var his = visit.tasks.filter(function (t) { return t.personId === elder.id && !t.doneAt; })[0];
  ok('the secretary has jobs of his own on the list', !!his, JSON.stringify(visit.tasks.slice(0, 1)));

  var tick = JSON.parse(JSON.stringify(visit));
  tick.tasks.filter(function (t) { return t.id === his.id; })[0].doneAt = Date.now();
  tick.tasks.filter(function (t) { return t.id === his.id; })[0].doneBy = elder.id;
  var tickRes = await request('POST', '/api/changes',
    { changes: [{ c: 'covisits', id: visit.id, op: 'put', rec: tick }] }, secretary);
  ok('he can tick off his own job', tickRes.body.applied === 1, JSON.stringify(tickRes.body.rejected));

  var fresh = (await request('GET', '/api/state', null, admin)).body.doc.covisits[0];
  var someoneElse = fresh.tasks.filter(function (t) { return t.personId && t.personId !== elder.id && !t.doneAt; })[0];
  var steal = JSON.parse(JSON.stringify(fresh));
  steal.tasks.filter(function (t) { return t.id === someoneElse.id; })[0].doneAt = Date.now();
  ok('but not somebody else’s',
    (await request('POST', '/api/changes',
      { changes: [{ c: 'covisits', id: fresh.id, op: 'put', rec: steal }] }, secretary)).body.applied === 0);

  var reDate = JSON.parse(JSON.stringify(fresh));
  reDate.from = '2027-03-01';
  ok('nor move the visit itself',
    (await request('POST', '/api/changes',
      { changes: [{ c: 'covisits', id: fresh.id, op: 'put', rec: reDate }] }, secretary)).body.applied === 0);

  var reassign = JSON.parse(JSON.stringify(fresh));
  reassign.tasks.filter(function (t) { return t.id === someoneElse.id; })[0].personId = elder.id;
  ok('nor take a job off another brother',
    (await request('POST', '/api/changes',
      { changes: [{ c: 'covisits', id: fresh.id, op: 'put', rec: reassign }] }, secretary)).body.applied === 0);

  var pubTick = JSON.parse(JSON.stringify(fresh));
  pubTick.tasks[3].doneAt = Date.now();
  ok('and a publisher cannot touch the visit at all',
    (await request('POST', '/api/changes',
      { changes: [{ c: 'covisits', id: fresh.id, op: 'put', rec: pubTick }] }, ruthCookie)).body.applied === 0);

  /* ================= the reminders themselves ================= */
  console.log('\nreminders');

  var state = (await request('GET', '/api/state', null, admin)).body.doc;
  var iso = function (d) { return new Date(Date.now() + d * 86400000).toISOString().slice(0, 10); };
  var ruthRec = state.people.filter(function (p) { return p.id === 'p_20'; })[0];
  var elderRec = state.people.filter(function (p) { return p.id === elder.id; })[0];
  var groupMates = state.people.filter(function (p) {
    return p.serviceGroupId === ruthRec.serviceGroupId && p.status === 'active';
  });

  var turn = {
    id: 'cln_remind', congId: 'cong_riverside', date: iso(3), kind: 'group',
    groupIds: [ruthRec.serviceGroupId], meeting: 'weekend', time: '10:00',
    notes: 'Windows this time.', doneAt: null, doneBy: null
  };
  ok('a turn can be put three days out',
    (await request('POST', '/api/changes',
      { changes: [{ c: 'cleaning', id: turn.id, op: 'put', rec: turn }] }, admin)).body.applied === 1);

  var run = await request('POST', '/api/reminders/run', {}, admin);
  ok('the reminders can be sent on demand', run.status === 200, JSON.stringify(run.body));
  await wait(700);

  var cleaningMails = ofKind('cleaning');
  var told = cleaningMails.map(function (m) { return m.to; });
  ok('everyone in the group whose turn it is is told',
    groupMates.filter(function (p) { return p.email; })
      .every(function (p) { return told.indexOf(p.email) !== -1; }),
    told.length + ' told, ' + groupMates.length + ' in the group');
  ok('the publisher herself among them', told.indexOf(ruthRec.email) !== -1, ruthRec.email);
  ok('the message says when and after which meeting',
    cleaningMails.some(function (m) { return /after the weekend meeting/i.test(m.text); }));
  ok('and passes on the note',
    cleaningMails.some(function (m) { return /Windows this time/.test(m.text); }));
  ok('the coordinator is told too, whichever group is on',
    cleaningMails.some(function (m) { return /coordinator@example\.org/.test(m.to) && /coming up/i.test(m.subject); }),
    cleaningMails.map(function (m) { return m.subject; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' | '));
  ok('and so is the cleaning servant',
    cleaningMails.some(function (m) {
      var timothy = state.people.filter(function (p) { return (p.roles || []).indexOf('cleaning') !== -1; })[0];
      return timothy && m.to === timothy.email && /coming up/i.test(m.subject);
    }));

  var before = outbox().length;
  await request('POST', '/api/reminders/run', {}, admin);
  await wait(500);
  ok('running it twice does not tell anybody twice', outbox().length === before,
    outbox().length + ' vs ' + before);

  // somebody who turned cleaning messages off
  var quiet = JSON.parse(JSON.stringify(state.people.filter(function (p) { return p.id === 'p_21'; })[0]));
  quiet.notify = { cleaning: false };
  quiet.serviceGroupId = ruthRec.serviceGroupId;
  await request('POST', '/api/changes', { changes: [{ c: 'people', id: 'p_21', op: 'put', rec: quiet }] }, admin);
  var turn2 = Object.assign({}, turn, { id: 'cln_remind_2', meeting: 'midweek' });
  await request('POST', '/api/changes',
    { changes: [{ c: 'cleaning', id: turn2.id, op: 'put', rec: turn2 }] }, admin);
  before = outbox().length;
  await request('POST', '/api/reminders/run', {}, admin);
  await wait(700);
  var second = outbox().slice(before);
  ok('a second turn tells the group again', second.length > 0, second.length + ' messages');
  ok('but not the brother who asked not to be told',
    !second.some(function (m) { return m.to === quiet.email; }),
    quiet.email + ' — ' + second.map(function (m) { return m.to; }).join(', '));

  // the circuit overseer's jobs falling due
  var docNow = (await request('GET', '/api/state', null, admin)).body.doc;
  var v = JSON.parse(JSON.stringify(docNow.covisits[0]));
  v.tasks.forEach(function (t) { t.doneAt = null; t.doneBy = null; });
  v.tasks[0].personId = elder.id;
  v.tasks[0].dueOn = iso(3);           // due this week
  v.tasks[1].personId = elder.id;
  v.tasks[1].dueOn = iso(-4);          // and one already late
  v.from = iso(20); v.to = iso(25);
  await request('POST', '/api/changes', { changes: [{ c: 'covisits', id: v.id, op: 'put', rec: v }] }, admin);

  await request('POST', '/api/reminders/run', {}, admin);
  await wait(800);
  var coMails = ofKind('covisit');
  ok('the brother is reminded of what is due this week',
    coMails.some(function (m) { return /Your part of the circuit overseer/i.test(m.subject); }),
    coMails.map(function (m) { return m.subject; }).join(' | '));
  ok('and chased about what is already late',
    coMails.some(function (m) { return /Still to do/i.test(m.subject); }));
  ok('his two go to him and no one else',
    coMails.filter(function (m) { return m.to === elderRec.email; }).length === 2,
    coMails.filter(function (m) { return m.to === elderRec.email; }).map(function (m) { return m.subject; }).join(' | '));
  ok('the message names the job and the day it is wanted',
    coMails.some(function (m) { return m.text.indexOf(v.tasks[0].title) !== -1; }));
  // the other brothers are written to as well — they have jobs of their own now
  // due — but nobody is written to who has nothing outstanding
  var owing = {};
  v.tasks.forEach(function (t) {
    if (t.doneAt || !t.personId) return;
    if (t.dueOn <= iso(7)) owing[t.personId] = true;
  });
  var owedEmails = Object.keys(owing).map(function (id) {
    return (docNow.people.filter(function (p) { return p.id === id; })[0] || {}).email;
  }).filter(Boolean);
  ok('everyone written to has something of his own outstanding',
    coMails.every(function (m) { return owedEmails.indexOf(m.to) !== -1; }),
    coMails.map(function (m) { return m.to; }).filter(function (e) { return owedEmails.indexOf(e) === -1; }).join(', '));
  ok('and each is told only about his own jobs',
    coMails.every(function (m) {
      var person = docNow.people.filter(function (p) { return p.email === m.to; })[0];
      if (!person) return false;
      var others = v.tasks.filter(function (t) { return t.personId && t.personId !== person.id; });
      return !others.some(function (t) { return m.text.indexOf(t.title) !== -1; });
    }));

  /* waking the reminders from outside, for hosting that sleeps */
  var keyRes = await request('GET', '/api/reminders/cron-key', null, admin);
  ok('an administrator can fetch the key for a scheduled job',
    keyRes.status === 200 && !!keyRes.body.key, JSON.stringify(keyRes.body).slice(0, 60));
  ok('a publisher cannot',
    (await request('GET', '/api/reminders/cron-key', null, ruthCookie)).status === 403);
  ok('the scheduled address is refused without the key',
    (await request('GET', '/api/reminders/cron')).status === 403);
  ok('and with the wrong one',
    (await request('GET', '/api/reminders/cron?key=' + 'x'.repeat(32))).status === 403);
  var cronRun = await request('GET', '/api/reminders/cron?key=' + encodeURIComponent(keyRes.body.key));
  ok('but works with it, without anybody signing in',
    cronRun.status === 200 && /shepherd:/.test(cronRun.text), cronRun.text);
  var keyFile = fs.statSync(path.join(DATA, 'cron-key'));
  ok('the key is kept where only the server can read it', (keyFile.mode & 0o077) === 0);

  /* the calendar feed carries the hall arrangements too */
  console.log('\nin the phone calendar');
  var link = await request('POST', '/api/calendar/link', {}, ruthCookie);
  var feed = await request('GET', link.body.url.replace(BASE, ''));
  ok('her cleaning turn is in her calendar feed',
    /SUMMARY:Cleaning the hall/.test(feed.text) || /SUMMARY:General cleaning/.test(feed.text),
    feed.text.split('\r\n').filter(function (l) { return l.indexOf('SUMMARY') === 0; }).join(' | ').slice(0, 200));

  var elderLink = await request('POST', '/api/calendar/link', {}, secretary);
  var elderFeed = await request('GET', elderLink.body.url.replace(BASE, ''));
  ok('an elder’s visit deadlines are in his',
    /SUMMARY:CO visit: /.test(elderFeed.text),
    elderFeed.text.split('\r\n').filter(function (l) { return l.indexOf('SUMMARY') === 0; }).slice(0, 3).join(' | '));
  ok('the feed is still a well-formed calendar',
    elderFeed.text.indexOf('BEGIN:VCALENDAR') === 0 && /END:VCALENDAR\r\n$/.test(elderFeed.text)
      && elderFeed.text.split('\r\n').every(function (l) { return Buffer.byteLength(l) <= 75; }));

  console.log('\n' + (failures ? failures + ' failed' : 'all good'));
  await stop(failures ? 1 : 0);
})().catch(function (e) { console.error(e); stop(1); });
