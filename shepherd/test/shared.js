/* Two browsers, one server: does a change made by an elder reach a publisher,
   and does the app still work when the server goes away?

   node test/shared.js */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var child = require('child_process');
var { chromium } = require('playwright');

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  var base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  var dir = fs.readdirSync(base).filter(function (d) { return /^chromium-\d+$/.test(d); }).sort().pop();
  if (!dir) return undefined;
  var candidates = ['chrome-linux/chrome', 'chrome-linux64/chrome',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe'];
  for (var i = 0; i < candidates.length; i++) {
    var full = base + '/' + dir + '/' + candidates[i];
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}
var LAUNCH = chromePath() ? { executablePath: chromePath() } : {};

var PORT = 8932;
var BASE = 'http://127.0.0.1:' + PORT;
var DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'shepherd-shared-'));
var failures = 0;
function ok(name, cond, detail) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

var server = child.spawn(process.execPath,
  [path.join(__dirname, '..', 'server', 'server.js'), '--port', String(PORT), '--host', '127.0.0.1', '--data', DATA],
  { stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', function (d) { process.stderr.write('[server] ' + d); });

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  await wait(900);
  var browser = await chromium.launch(LAUNCH);
  var errors = [];

  async function newTab(label) {
    var ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    var page = await ctx.newPage();
    page.on('pageerror', function (e) { errors.push(label + ' PAGEERROR ' + e.message); });
    page.on('console', function (m) {
      if (m.type() !== 'error') return;
      // The browser logs the 401 before sign-in and the refused connections while
      // the server is deliberately stopped. Both are handled paths this test asserts on.
      if (/Failed to load resource/.test(m.text())) return;
      errors.push(label + ' CONSOLE ' + m.text());
    });
    return page;
  }

  // ---- first run through the UI ----
  console.log('first run');
  var elder = await newTab('elder');
  await elder.goto(BASE);
  await elder.waitForTimeout(700);
  ok('the setup screen appears', (await elder.locator('.page-title').textContent()).indexOf('Set up') !== -1);

  await elder.locator('input[type=email]').fill('coordinator@example.org');
  await elder.locator('input[type=password]').fill('coordinator-pass-1');
  await elder.locator('.checkline input').check();              // load the demo congregation
  await elder.getByRole('button', { name: 'Create the account' }).click();
  await elder.waitForTimeout(1200);
  ok('it lands in the app after setup',
    (await elder.locator('.page-title').textContent()).indexOf('Riverside') !== -1);
  ok('the header shows it is shared',
    (await elder.locator('.topnav').textContent()).indexOf('Shared') !== -1);

  // ---- create a login for a publisher, through the UI ----
  console.log('\ncreating a publisher login');
  var password = await elder.evaluate(async () => {
    const out = await Sync.api('POST', 'api/password',
      { personId: 'p_20', email: 'ruth@example.org', mustChange: false });
    return out.password;
  });
  ok('a one-time password is issued', !!password && password.length > 8);

  var publisher = await newTab('publisher');
  await publisher.goto(BASE);
  await publisher.waitForTimeout(700);
  ok('a second browser is asked to sign in',
    (await publisher.locator('.page-title').textContent()).indexOf('Sign in') !== -1);
  await publisher.locator('input[type=email]').fill('ruth@example.org');
  await publisher.locator('input[type=password]').fill(password);
  await publisher.getByRole('button', { name: 'Sign in' }).click();
  await publisher.waitForTimeout(1200);
  ok('the publisher lands in their own workspace',
    (await publisher.locator('.page-title').textContent()).indexOf('Ruth') !== -1,
    await publisher.locator('.page-title').textContent());
  ok('and sees the shared congregation',
    await publisher.evaluate(() => Store.people().length) === 36);

  // ---- elder assigns, publisher sees it ----
  console.log('\nan assignment travels between the two');
  var partTitle = await elder.evaluate(() => {
    const ws = U.weekStart(U.addDays(U.today(), 14));
    const wk = Store.ensureWeek(ws);
    const part = wk.midweek.parts.filter(p => p.type === 'bible_reading')[0];
    Store.setAssignment(part.id, 'assigneeId', 'p_20');
    return part.title + '|' + ws;
  });
  await wait(7000);       // one poll interval plus slack
  var seen = await publisher.evaluate(() => Store.assignmentsFor('p_20', {})
    .map(r => r.part && r.part.title).filter(Boolean));
  ok('the publisher sees the new assignment without reloading',
    seen.indexOf(partTitle.split('|')[0]) !== -1, JSON.stringify(seen));

  // ---- publisher confirms, elder sees it ----
  await publisher.evaluate(() => { location.hash = '#/my-assignments'; });
  await publisher.waitForTimeout(400);
  var confirmBtn = publisher.getByRole('button', { name: 'Confirm' }).first();
  if (await confirmBtn.count()) await confirmBtn.click();
  await wait(7000);
  var status = await elder.evaluate((info) => {
    const wk = Store.week(info.split('|')[1]);
    const part = wk.midweek.parts.filter(p => p.type === 'bible_reading')[0];
    return part.status;
  }, partTitle);
  ok('the elder sees the confirmation come back', status === 'confirmed', 'status=' + status);

  // ---- the publisher cannot reach elder-only pages or data ----
  console.log('\nboundaries');
  await publisher.evaluate(() => { location.hash = '#/shepherding'; });
  await publisher.waitForTimeout(400);
  ok('elder-only pages stay closed to the publisher',
    (await publisher.locator('#content').textContent()).indexOf('Not available to your role') !== -1);

  var refused = await publisher.evaluate(async () => {
    const task = { id: 'task_hack', congId: Store.congId(), title: 'Should not exist', detail: '',
      category: 'Other', status: 'backlog', priority: 'low', dueOn: null, assigneeIds: [],
      createdBy: 'p_20', createdAt: Date.now(), comments: [] };
    const out = await Sync.api('POST', 'api/changes',
      { changes: [{ c: 'tasks', id: task.id, op: 'put', rec: task }], since: Sync.seq });
    return out.rejected.length;
  });
  ok('the server refuses a write the publisher’s role does not allow', refused === 1);

  // ---- offline behaviour ----
  console.log('\nwhen the server goes away');
  server.kill('SIGTERM');
  await wait(1200);
  var offlineOk = await elder.evaluate(() => {
    const t = { id: 'task_offline', congId: Store.congId(), title: 'Written while offline', detail: '',
      category: 'Maintenance', status: 'backlog', priority: 'medium', dueOn: null,
      assigneeIds: [], createdBy: 'p_1', createdAt: Date.now(), comments: [] };
    Store.update({ action: 'task.created', summary: t.title }, st => { st.tasks.push(t); });
    return Store.tasks().some(x => x.id === 'task_offline');
  });
  ok('the app keeps working and saves locally', offlineOk);
  await wait(2500);
  var queued = await elder.evaluate(() => ({ status: Sync.status, pending: Sync.pendingCount() }));
  ok('the change is queued and the header says offline',
    queued.pending >= 1 && queued.status === 'offline', JSON.stringify(queued));

  // ---- back online: the queue drains ----
  console.log('\nwhen it comes back');
  server = child.spawn(process.execPath,
    [path.join(__dirname, '..', 'server', 'server.js'), '--port', String(PORT), '--host', '127.0.0.1', '--data', DATA],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  await wait(1500);
  await elder.evaluate(() => Sync.push());
  await wait(2000);
  var drained = await elder.evaluate(() => ({ status: Sync.status, pending: Sync.pendingCount() }));
  ok('the queue drains once the server is back',
    drained.pending === 0 && drained.status === 'synced', JSON.stringify(drained));
  await wait(6500);
  ok('and the other browser receives what was written offline',
    await publisher.evaluate(() => Store.tasks().some(t => t.id === 'task_offline')));

  var onDisk = JSON.parse(fs.readFileSync(path.join(DATA, 'shepherd.json'), 'utf8'));
  ok('the server survived the restart with its data',
    onDisk.tasks.some(function (t) { return t.id === 'task_offline'; }));

  await elder.screenshot({ path: '/tmp/shot-shared-elder.png' });
  await publisher.screenshot({ path: '/tmp/shot-shared-publisher.png' });

  console.log('\nbrowser errors: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'none'));
  if (errors.length) failures += errors.length;
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall shared-mode checks passed');

  await browser.close();
  server.kill('SIGTERM');
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(failures ? 1 : 0);
})().catch(function (e) {
  console.error(e);
  server.kill('SIGTERM');
  process.exit(1);
});
