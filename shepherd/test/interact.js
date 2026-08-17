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
(async () => {
  const b = await chromium.launch(LAUNCH);
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'index.html') + '');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(400);

  const step = async (name, fn) => { await fn(); await p.waitForTimeout(250); console.log('✓ ' + name); };

  // 1. assign a part through the picker
  await step('open week + assign chairman via picker', async () => {
    await p.evaluate(() => { location.hash = '#/meetings'; });
    await p.waitForTimeout(300);
    await p.locator('.assign-slot').first().click();
    await p.waitForTimeout(200);
    await p.locator('.picker-item').first().click();
  });
  const assigned = await p.evaluate(() => {
    const w = Store.week(U.weekStart(U.today()));
    return w.midweek.parts[0].assigneeId ? Store.name(w.midweek.parts[0].assigneeId) : null;
  });
  console.log('   chairman now:', assigned);

  // 2. auto-fill the week through the button + modal
  await step('auto-fill week via toolbar', async () => {
    await p.getByRole('button', { name: 'Auto-fill week' }).click();
    await p.waitForTimeout(300);
    await p.locator('.modal-foot button.primary').click();
  });
  console.log('   unfilled after auto-fill:', await p.evaluate(() => {
    const w = Store.week(U.weekStart(U.today()));
    return Store.allParts(w).filter(r => !r.part.assigneeId).length;
  }));

  // 3. import a program by pasting the sample
  await step('import sample program', async () => {
    await p.getByRole('button', { name: 'Import program' }).click();
    await p.waitForTimeout(250);
    await p.getByRole('button', { name: 'Load a sample' }).click();
    await p.waitForTimeout(250);
    await p.locator('.modal-foot button.primary').click();
  });
  console.log('   imported week:', await p.evaluate(() => {
    const w = Store.week('2026-11-03');
    return w ? w.source + ' / ' + w.bibleReading + ' / ' + w.midweek.parts.length + ' parts' : 'MISSING';
  }));

  // 4. create a task
  await step('create a task', async () => {
    await p.evaluate(() => { location.hash = '#/tasks'; });
    await p.waitForTimeout(300);
    await p.getByRole('button', { name: 'New task' }).click();
    await p.waitForTimeout(200);
    await p.locator('.modal input').first().fill('Test the fire alarm');
    await p.locator('.modal-foot button.primary').click();
  });
  console.log('   tasks now:', await p.evaluate(() => Store.tasks().length));

  // 5. drag a task between columns
  await step('drag task backlog → in progress', async () => {
    const src = p.locator('.col').nth(0).locator('.tile').first();
    const dst = p.locator('.col').nth(1);
    await src.dragTo(dst);
  });
  console.log('   in-progress tasks:', await p.evaluate(() => Store.tasks().filter(t => t.status === 'inprogress').length));

  // 6. duty rota generation
  await step('fill the duty rota', async () => {
    await p.evaluate(() => { location.hash = '#/duties'; });
    await p.waitForTimeout(300);
    await p.getByRole('button', { name: 'Fill the rota' }).click();
    await p.waitForTimeout(250);
    await p.locator('.modal-foot button.primary').click();
  });
  console.log('   duties stored:', await p.evaluate(() => Store.duties().length));

  // 7. territory check-out then check-in as publisher
  await step('check out a territory', async () => {
    await p.evaluate(() => { location.hash = '#/territories'; });
    await p.waitForTimeout(300);
    await p.getByRole('button', { name: 'Check out' }).first().click();
    await p.waitForTimeout(250);
    await p.locator('.picker-item').first().click();
  });

  // 8. publisher submits a report through the UI
  await step('publisher submits report', async () => {
    await p.evaluate(() => { Auth.signInAs('p_22'); Auth.setWorkspace('publisher'); location.hash = '#/my-report'; });
    await p.waitForTimeout(350);
    await p.locator('.page-actions button.primary').click();
    await p.waitForTimeout(250);
    await p.locator('.modal input[type=number]').first().fill('4');
    await p.locator('.modal-foot button.primary').click();
  });
  console.log('   report:', await p.evaluate(() => {
    const r = Store.report('p_22', U.prevPeriod(U.period(U.today())));
    return r ? 'shared=' + r.shared + ' studies=' + r.studies : 'MISSING';
  }));

  // 9. publisher confirms an assignment
  await step('publisher confirms an assignment', async () => {
    await p.evaluate(() => { location.hash = '#/my-assignments'; });
    await p.waitForTimeout(300);
    const btn = p.getByRole('button', { name: 'Confirm' }).first();
    if (await btn.count()) await btn.click();
  });

  // 10. backup export round trip
  const round = await p.evaluate(() => {
    const json = Store.exportAll();
    Store.importAll(json);
    return Store.state.people.length + ' people, ' + Store.state.tasks.length + ' tasks preserved';
  });
  console.log('✓ backup export/import round trip:', round);

  await p.evaluate(() => { Auth.signInAs('p_1'); Auth.setWorkspace('elders'); location.hash = '#/meetings'; });
  await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/shot-filled.png' });
  await p.evaluate(() => { location.hash = '#/duties'; });
  await p.waitForTimeout(400);
  await p.screenshot({ path: '/tmp/shot-duties.png' });
  await p.evaluate(() => { Auth.signInAs('p_22'); Auth.setWorkspace('publisher'); location.hash = '#/home'; });
  await p.waitForTimeout(400);
  await p.screenshot({ path: '/tmp/shot-publisher.png' });

  console.log('\nerrors:', errs.length ? errs.join('\n') : 'none');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
