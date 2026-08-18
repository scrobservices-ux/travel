const { chromium } = require('playwright');

// Use the browser Playwright already has; CHROME_PATH overrides.
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const fs = require('fs');
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  const dir = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
  if (!dir) return undefined;
  const candidates = ['chrome-linux/chrome', 'chrome-linux64/chrome',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe'];
  for (const c of candidates) {
    const full = base + '/' + dir + '/' + c;
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}
const LAUNCH = chromePath() ? { executablePath: chromePath() } : {};
const path = require('path').resolve(__dirname, '..', 'index.html');

const ELDER_VIEWS = ['dashboard', 'meetings', 'board', 'duties', 'cleaning', 'covisit',
  'publishers', 'reports', 'territories', 'shepherding', 'tasks', 'attendance',
  'accounts', 'announcements'];
const PUB_VIEWS = ['home', 'my-assignments', 'meetings', 'my-cleaning', 'announcements',
  'my-report', 'my-territories', 'profile'];
const ADMIN_VIEWS = ['admin', 'admin-congregations', 'admin-users', 'admin-program',
  'admin-email', 'admin-billing', 'admin-data', 'admin-audit'];

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('file://' + path);
  await page.waitForTimeout(500);

  async function visit(view, label) {
    await page.evaluate(v => { location.hash = '#/' + v; }, view);
    await page.waitForTimeout(220);
    const title = await page.evaluate(() => {
      const h = document.querySelector('#content .page-title');
      return h ? h.textContent : '(no page title) ' + document.querySelector('#content').textContent.slice(0, 60);
    });
    console.log(`  ${label}/${view.padEnd(22)} → ${title}`);
  }

  console.log('== elders workspace (Daniel Achebe, coordinator) ==');
  for (const v of ELDER_VIEWS) await visit(v, 'elders');

  // detail routes
  await visit('publishers/p_12', 'elders');
  await visit('territories/terr_6', 'elders');
  await visit('meetings/' + await page.evaluate(() => U.weekStart(U.addDays(U.today(), 7))), 'elders');

  console.log('== publisher workspace ==');
  await page.evaluate(() => { Auth.signInAs('p_20'); });
  await page.waitForTimeout(150);
  for (const v of PUB_VIEWS) await visit(v, 'publisher');

  // publisher must not reach elder-only pages
  await page.evaluate(() => { location.hash = '#/shepherding'; });
  await page.waitForTimeout(200);
  const blocked = await page.evaluate(() => document.querySelector('#content').textContent.includes('Not available to your role'));
  console.log('  publisher blocked from shepherding:', blocked);

  console.log('== admin workspace ==');
  await page.evaluate(() => { Store.update(st => { const p = Store.person('p_1'); if (p.roles.indexOf('admin') === -1) p.roles.push('admin'); }); Auth.signInAs('p_1'); Auth.setWorkspace('admin'); });
  await page.waitForTimeout(150);
  for (const v of ADMIN_VIEWS) await visit(v, 'admin');

  // functional checks
  console.log('== functional checks ==');
  const res = await page.evaluate(() => {
    const out = {};
    location.hash = '#/dashboard';
    const ws = U.weekStart(U.addDays(U.today(), 21));
    const wk = Store.ensureWeek(ws);
    Store.allParts(wk).forEach(r => { r.part.assigneeId = null; r.part.assistantId = null; });
    const plan = Scheduler.planWeek(wk, {});
    out.planned = plan.plan.length;
    out.skipped = plan.skipped.length;
    Scheduler.applyPlan(wk, plan.plan);
    out.filledAfter = Store.allParts(wk).filter(r => r.part.assigneeId).length;
    out.conflicts = Scheduler.conflicts(wk).length;

    const parsed = Program.parseText(Program.SAMPLE);
    out.parsedWeeks = parsed.length;
    out.parsedWeekStart = parsed[0] && parsed[0].weekStart;
    out.parsedMid = parsed[0] && parsed[0].midweekParts.length;
    out.parsedWknd = parsed[0] && parsed[0].weekendParts.length;
    out.parsedTypes = parsed[0] && parsed[0].midweekParts.map(p => p.type).join(',');
    out.bibleReading = parsed[0] && parsed[0].bibleReading;
    out.songs = parsed[0] && JSON.stringify(parsed[0].songs);

    const w2 = Store.ensureWeek(U.weekStart(U.addDays(U.today(), 28)));
    Program.applyParsed(w2, parsed[0]);
    out.appliedParts = w2.midweek.parts.length + ' / ' + w2.weekend.parts.length;

    const dutyPlan = Scheduler.planDuties(Store.upcomingWeeks(3), ['av', 'attendant_main', 'cleaning'], {});
    out.dutiesPlanned = dutyPlan.length;
    Scheduler.applyDutyPlan(dutyPlan);
    out.dutiesStored = Store.duties().length;

    Store.saveReport('p_25', U.prevPeriod(U.period(U.today())), { shared: true, studies: 3, hours: 30 });
    out.reportSummary = JSON.stringify(Store.reportSummary(U.prevPeriod(U.period(U.today()))));
    out.accounts = JSON.stringify(Store.accountsSummary(U.period(U.today())));
    out.csvRoundTrip = Program.parseCSV('week,section,no,title,minutes\n2026-11-03,treasures,1,Test talk,10').length;
    out.jsonRoundTrip = Program.parseJSON(JSON.stringify([Program.weekToJSON(w2)])).length;
    out.exportSize = Store.exportAll().length;
    return out;
  });
  console.log(JSON.stringify(res, null, 2));

  // persistence across reload
  await page.reload();
  await page.waitForTimeout(400);
  const persisted = await page.evaluate(() => Store.duties().length + '|' + Store.state.people.length);
  console.log('after reload duties|people =', persisted);

  await page.evaluate(() => { Auth.signInAs('p_1'); Auth.setWorkspace('elders'); location.hash = '#/meetings'; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/shot-meetings.png' });
  await page.evaluate(() => { location.hash = '#/dashboard'; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shot-dashboard.png' });
  await page.evaluate(() => { Store.update(st => { st.session.theme = 'dark'; }); location.hash = '#/board'; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shot-board-dark.png' });

  console.log('\n== errors ==');
  console.log(errors.length ? errors.join('\n') : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
