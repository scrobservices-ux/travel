/* The scheduling engine: does it spread the work so nobody is left out, does it
   obey away dates and each person's own availability, does it pair demonstration
   partners sensibly, and does it keep the rotation level across many weeks?

   node test/scheduling.js */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  const dir = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
  if (!dir) return undefined;
  for (const c of ['chrome-linux/chrome', 'chrome-linux64/chrome',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
    const full = base + '/' + dir + '/' + c;
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}
const LAUNCH = chromePath() ? { executablePath: chromePath() } : {};
const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');

let failures = 0;
function ok(name, cond, detail) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });

  async function fresh() {
    await page.goto(APP);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(400);
  }

  // ---------- spreading the work ----------
  console.log('spreading the work over twelve weeks');
  await fresh();
  const spread = await page.evaluate(() => {
    const weeks = [];
    for (let i = 1; i <= 12; i++) weeks.push(Store.ensureWeek(U.weekStart(U.addDays(U.today(), i * 7))));
    const plan = Scheduler.planRange(weeks, {});
    Scheduler.applyRangePlan(weeks, plan.plan);
    Scheduler.applyDutyPlan(Scheduler.planDuties(weeks, ['av', 'attendant_main', 'mic1', 'parking', 'security'], {}));

    const counts = Scheduler.workload(U.weekStart(U.today()), U.addDays(U.weekStart(U.today()), 84));
    const active = Store.activePeople();
    const withNothing = active.filter(p => !counts[p.id]);
    const values = active.map(p => counts[p.id] || 0);
    return {
      planned: plan.plan.length,
      skipped: plan.skipped.length,
      clashes: weeks.reduce((n, w) => n + Scheduler.conflicts(w).length, 0),
      active: active.length,
      used: active.length - withNothing.length,
      withNothing: withNothing.map(p => Store.name(p.id)),
      min: Math.min(...values), max: Math.max(...values),
      // compare like with like: what someone can be given depends entirely on what
      // they are marked for, so group people by that before judging the spread
      onDutyRota: active.filter(p => p.appointment === 'none'
        && (p.qualifications || []).some(q => ['av', 'attendant', 'mic', 'parking', 'security'].includes(q)))
        .map(p => counts[p.id] || 0),
      sisters: active.filter(p => p.gender === 'f').map(p => counts[p.id] || 0),
      thin: Scheduler.thinPools(4).map(t => t.name + ' (' + t.count + ')')
    };
  });
  ok('every slot is filled', spread.skipped === 0, spread.skipped + ' left over');
  ok('no clashes anywhere in the run', spread.clashes === 0, spread.clashes + ' clashes');
  ok('nobody who can serve is left out', spread.withNothing.length === 0,
    'left out: ' + spread.withNothing.join(', '));
  const dMin = Math.min(...spread.onDutyRota), dMax = Math.max(...spread.onDutyRota);
  ok('publishers on the duty rota carry a comparable amount', dMax - dMin <= 3,
    'from ' + dMin + ' to ' + dMax);
  const sMin = Math.min(...spread.sisters), sMax = Math.max(...spread.sisters);
  ok('sisters carry a comparable amount', sMax - sMin <= 2, 'from ' + sMin + ' to ' + sMax);
  ok('and it names the thin pools that cause the rest of the gap', spread.thin.length > 0,
    'nothing flagged');
  console.log(`    ${spread.planned} assignments · ${spread.used}/${spread.active} publishers used`);
  console.log(`    duty-rota brothers ${dMin}–${dMax} · sisters ${sMin}–${sMax}`);
  console.log('    thin pools: ' + spread.thin.join(', '));

  // ---------- away dates ----------
  console.log('\naway dates');
  await fresh();
  const away = await page.evaluate(() => {
    const p = Store.person('p_7');                       // Michael Adeyemi, widely qualified
    const from = U.addDays(U.today(), 7), to = U.addDays(U.today(), 28);
    Store.update(st => { p.unavailable = [{ from, to, note: 'Away for work' }]; });
    const weeks = [];
    for (let i = 1; i <= 4; i++) weeks.push(Store.ensureWeek(U.weekStart(U.addDays(U.today(), i * 7))));
    const plan = Scheduler.planRange(weeks, {});
    Scheduler.applyRangePlan(weeks, plan.plan);
    const during = Store.assignmentsFor('p_7', {}).filter(r => r.date >= from && r.date <= to);
    const after = Store.assignmentsFor('p_7', {}).filter(r => r.date > to);
    return { during: during.length, after: after.length, window: from + '..' + to };
  });
  ok('nothing is scheduled while a person is away', away.during === 0, away.during + ' during ' + away.window);
  ok('and they are used again once they are back', away.after > 0);

  // ---------- personal availability ----------
  console.log('\nwhat each person can manage');
  await fresh();
  const avail = await page.evaluate(() => {
    Store.update(st => {
      Store.person('p_8').availability = { midweek: false, weekend: true, duties: true, maxPerMonth: null };
      Store.person('p_9').availability = { midweek: true, weekend: true, duties: true, maxPerMonth: 1 };
      Store.person('p_10').availability = { midweek: true, weekend: true, duties: false, maxPerMonth: null };
    });
    const weeks = [];
    for (let i = 1; i <= 8; i++) weeks.push(Store.ensureWeek(U.weekStart(U.addDays(U.today(), i * 7))));
    const plan = Scheduler.planRange(weeks, {});
    Scheduler.applyRangePlan(weeks, plan.plan);
    Scheduler.applyDutyPlan(Scheduler.planDuties(weeks, ['av', 'attendant_main', 'mic1'], {}));

    const mid = Store.assignmentsFor('p_8', {}).filter(r => r.meeting === 'midweek').length;
    const wknd = Store.assignmentsFor('p_8', {}).filter(r => r.meeting === 'weekend').length;

    const byMonth = {};
    Store.assignmentsFor('p_9', {}).forEach(r => {
      byMonth[U.period(r.date)] = (byMonth[U.period(r.date)] || 0) + 1;
    });
    const worstMonth = Math.max(0, ...Object.values(byMonth));

    const duties = Store.duties().filter(d => d.personId === 'p_10').length;
    return { mid, wknd, worstMonth, duties };
  });
  ok('a brother not available midweek gets no midweek parts', avail.mid === 0, avail.mid + ' midweek');
  ok('but is still used at the weekend', avail.wknd > 0);
  ok('a monthly limit of one is respected', avail.worstMonth <= 1, 'worst month had ' + avail.worstMonth);
  ok('someone off the duty rota gets no duties', avail.duties === 0, avail.duties + ' duties');

  // ---------- demonstration partners ----------
  console.log('\ndemonstration partners');
  await fresh();
  const pairs = await page.evaluate(() => {
    // the demo congregation has no two sisters in one household; make one, the way
    // a mother and daughter would appear on a real roll
    Store.update(st => {
      const mother = Store.activePeople().find(p => p.gender === 'f' && (p.qualifications || []).includes('student'));
      const daughter = Store.activePeople().find(p => p.gender === 'f' && p.id !== mother.id
        && (p.qualifications || []).includes('assistant'));
      daughter.lastName = mother.lastName;
      daughter.address = mother.address;
    });
    const weeks = [];
    for (let i = 1; i <= 12; i++) weeks.push(Store.ensureWeek(U.weekStart(U.addDays(U.today(), i * 7))));
    const plan = Scheduler.planRange(weeks, {});
    Scheduler.applyRangePlan(weeks, plan.plan);

    let total = 0, mismatched = 0, sameHousehold = 0;
    weeks.forEach(w => w.midweek.parts.forEach(p => {
      if (p.type !== 'student' || !p.assigneeId || !p.assistantId) return;
      total++;
      const a = Store.person(p.assigneeId), b = Store.person(p.assistantId);
      if (a.gender !== b.gender) mismatched++;
      if (a.lastName === b.lastName) sameHousehold++;
    }));
    // and the conflict detector should notice a bad pairing put in by hand
    const w = weeks[0];
    const demo = w.midweek.parts.filter(p => p.type === 'student')[0];
    const sister = Store.activePeople().find(p => p.gender === 'f' && (p.qualifications || []).includes('assistant'));
    const brother = Store.activePeople().find(p => p.gender === 'm' && (p.qualifications || []).includes('student'));
    Store.update(st => { demo.assigneeId = brother.id; demo.assistantId = sister.id; });
    const flagged = Scheduler.conflicts(w).some(c => c.kind === 'pairing');
    return { total, mismatched, sameHousehold, flagged };
  });
  ok('demonstration partners are the same sex', pairs.mismatched === 0,
    pairs.mismatched + ' of ' + pairs.total + ' mismatched');
  ok('and a household partner is preferred where there is one', pairs.sameHousehold > 0,
    pairs.sameHousehold + ' of ' + pairs.total);
  ok('a mismatched pair entered by hand is flagged', pairs.flagged);

  // ---------- the workload report ----------
  console.log('\nthe workload report');
  await fresh();
  const report = await page.evaluate(() => {
    // strip one sister of every qualification: nobody can ever schedule her
    Store.update(st => { Store.person('p_30').qualifications = []; });
    const weeks = [];
    for (let i = 1; i <= 8; i++) weeks.push(Store.ensureWeek(U.weekStart(U.addDays(U.today(), i * 7))));
    Scheduler.applyRangePlan(weeks, Scheduler.planRange(weeks, {}).plan);

    const thisWeek = U.weekStart(U.today());
    const f = Scheduler.fairness({ from: thisWeek, to: U.addDays(thisWeek, 56) });
    return {
      total: f.total,
      fairShare: +f.fairShare.toFixed(2),
      nothingOpen: f.nothingOpen.map(r => Store.name(r.person.id)),
      unused: f.notUsedInWindow.map(r => Store.name(r.person.id)),
      sistersCounted: f.rows.filter(r => r.person.gender === 'f' && r.past > 0).length
    };
  });
  ok('it counts the schedule that has just been made', report.total > 0);
  ok('it names anyone the scheduler can never reach',
    report.nothingOpen.length === 1 && report.nothingOpen[0].indexOf('Sarah') === 0,
    JSON.stringify(report.nothingOpen));
  ok('and everyone else has had something', report.unused.length === 0, report.unused.join(', '));
  ok('sisters are counted, not just the brothers on the platform', report.sistersCounted > 0);
  console.log('    fair share ' + report.fairShare + ' each across ' + report.total + ' assignments');

  // ---------- the rota reaches the new duties ----------
  console.log('\ncar park, security and the rest');
  await fresh();
  const rota = await page.evaluate(() => {
    const cong = Store.cong();
    // mark a few brothers for the new duties
    const ids = ['p_11', 'p_13', 'p_16', 'p_17', 'p_18'];
    Store.update(st => {
      ids.forEach(id => {
        const p = Store.person(id);
        p.qualifications = (p.qualifications || []).concat(['parking', 'security', 'literature']);
      });
    });
    const weeks = [];
    for (let i = 1; i <= 6; i++) weeks.push(Store.ensureWeek(U.weekStart(U.addDays(U.today(), i * 7))));
    const plan = Scheduler.planDuties(weeks, ['parking', 'security', 'literature', 'greeter'], {});
    Scheduler.applyDutyPlan(plan);
    const byType = {};
    Store.duties().forEach(d => { byType[d.type] = (byType[d.type] || 0) + 1; });
    return {
      types: Object.keys(byType).sort(),
      parking: byType.parking || 0,
      security: byType.security || 0,
      people: [...new Set(Store.duties().map(d => d.personId))].filter(Boolean).length,
      names: Schema.dutyTypesFor(cong).map(d => d.name)
    };
  });
  ok('the car park is on the rota', rota.parking > 0);
  ok('the security watch is on the rota', rota.security > 0);
  ok('and they are shared between several brothers', rota.people >= 3, rota.people + ' people');
  console.log('    duties available: ' + rota.names.join(', '));

  console.log('\nbrowser errors: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'none'));
  failures += errors.length;
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall scheduling checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
