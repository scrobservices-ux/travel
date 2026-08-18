/* Print & PDF centre, the file importer, and congregation file uploads.

   node test/paperwork.js */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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
(async()=>{
  const b=await chromium.launch(LAUNCH);
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
  await p.goto(APP);
  await p.evaluate(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(500);

  console.log('== print centre ==');
  for (const doc of ['schedule','slips','rota','cleaning','covisit','publishers','records','territories','service','accounts','attendance','agenda']) {
    await p.evaluate(d=>{location.hash='#/print/'+d}, doc);
    await p.waitForTimeout(400);
    const info = await p.evaluate(()=>({
      sheets: document.querySelectorAll('#printable .sheet').length,
      chars: document.querySelector('#printable').textContent.length,
      title: (document.querySelector('#printable .sheet-head h1')||{}).textContent
        || (document.querySelector('#printable .p-slip-name')||{}).textContent || '(grid)'
    }));
    console.log(`  ${doc.padEnd(12)} sheets=${String(info.sheets).padStart(3)}  text=${String(info.chars).padStart(6)}  first="${info.title}"`);
  }

  console.log('\n== import centre ==');
  await p.evaluate(()=>{location.hash='#/import'}); await p.waitForTimeout(400);
  // publishers import with messy real-world headers
  const res = await p.evaluate(async ()=>{
    const ta=document.querySelector('#content textarea');
    ta.value = ['Full Name;Service Group;Publisher Type;Appointment;Mobile;E-mail;Baptism',
      'Nkemdirim, Chukwuemeka;Group 9 — New;Regular pioneer;Elder;07700 123456;c.n@example.org;12/04/1998',
      'Abigail Sanni;Group 9 — New;Publisher;;07700 654321;a.sanni@example.org;03/09/2011',
      'Daniel Achebe;Group 1 — Riverside;Publisher;Elder;07700 999888;daniel.achebe@example.org;15/07/1990'].join('\n');
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    const btns=[...document.querySelectorAll('#content button')];
    btns.find(b=>b.textContent.trim()==='Read it').click();
    await new Promise(r=>setTimeout(r,300));
    const stats=[...document.querySelectorAll('.stat')].map(s=>s.querySelector('.stat-label').textContent+'='+s.querySelector('.stat-value').textContent);
    return {stats, rows: document.querySelectorAll('.table-wrap tbody tr').length};
  });
  console.log('  publishers →', res.stats.join('  '), '| preview rows:', res.rows);

  const applied = await p.evaluate(async ()=>{
    const btns=[...document.querySelectorAll('#content button')];
    btns.find(b=>b.textContent.indexOf('Import 3')===0).click();
    await new Promise(r=>setTimeout(r,250));
    document.querySelector('.modal-foot button.primary').click();
    await new Promise(r=>setTimeout(r,400));
    const p1=Store.people().find(x=>x.lastName==='Nkemdirim');
    const p2=Store.people().find(x=>x.firstName==='Daniel'&&x.lastName==='Achebe');
    return {total:Store.people().length, groups:Store.groups().length,
      newOne: p1 && (p1.appointment+'/'+p1.publisherType+'/'+p1.baptizedOn+'/'+(Store.group(p1.serviceGroupId)||{}).name),
      updatedPhone: p2 && p2.phone};
  });
  console.log('  after import →', JSON.stringify(applied));

  // reports import
  const rep = await p.evaluate(async ()=>{
    location.hash='#/import'; await new Promise(r=>setTimeout(r,300));
    document.querySelectorAll('#content .card')[2].click();  // Field service reports card
    await new Promise(r=>setTimeout(r,300));
    const ta=document.querySelector('#content textarea');
    ta.value='Publisher\tMonth\tShared\tStudies\tHours\nDaniel Achebe\tMarch 2026\tYes\t3\t\nEsther Mwangi\t2026-03\ty\t5\t61\nNobody Here\tMarch 2026\tYes\t1\t';
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    [...document.querySelectorAll('#content button')].find(b=>b.textContent.trim()==='Read it').click();
    await new Promise(r=>setTimeout(r,300));
    const stats=[...document.querySelectorAll('.stat')].map(s=>s.querySelector('.stat-label').textContent+'='+s.querySelector('.stat-value').textContent);
    [...document.querySelectorAll('#content button')].find(b=>b.textContent.indexOf('Import 2')===0).click();
    await new Promise(r=>setTimeout(r,250));
    document.querySelector('.modal-foot button.primary').click();
    await new Promise(r=>setTimeout(r,400));
    const r1=Store.reports().find(r=>r.period==='2026-03'&&r.hours===61);
    return {stats, stored:!!r1, studies:r1&&r1.studies};
  });
  console.log('  reports →', rep.stats.join('  '), '| stored:', rep.stored, 'studies:', rep.studies);

  console.log('\n== files ==');
  const files = await p.evaluate(async ()=>{
    location.hash='#/files'; await new Promise(r=>setTimeout(r,300));
    // a tiny valid PDF
    const pdf='%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
    const file=new File([pdf],'Branch letter.pdf',{type:'application/pdf'});
    const dt=new DataTransfer(); dt.items.add(file);
    const input=document.querySelector('#content input[type=file]');
    Object.defineProperty(input,'files',{value:dt.files});
    input.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,500));
    const d=Store.documents()[0];
    return {count:Store.documents().length, name:d&&d.name, mime:d&&d.mime, size:d&&d.size,
      hasData:!!(d&&d.data&&d.data.indexOf('data:application/pdf')===0)};
  });
  console.log('  uploaded →', JSON.stringify(files));

  const pubSees = await p.evaluate(async ()=>{
    Auth.signInAs('p_22'); Auth.setWorkspace('publisher');
    location.hash='#/files'; await new Promise(r=>setTimeout(r,400));
    return {rows: document.querySelectorAll('.table-wrap tbody tr').length,
      canUpload: !!document.querySelector('#content .page-actions button')};
  });
  console.log('  publisher view →', JSON.stringify(pubSees));

  await p.evaluate(()=>{Auth.signInAs('p_1');Auth.setWorkspace('elders');location.hash='#/print/slips'});
  await p.waitForTimeout(600);
  await p.screenshot({path:'/tmp/shot-print-slips.png',fullPage:false});
  await p.evaluate(()=>{location.hash='#/print/schedule'}); await p.waitForTimeout(500);
  await p.screenshot({path:'/tmp/shot-print-schedule.png'});
  await p.evaluate(()=>{location.hash='#/import'}); await p.waitForTimeout(400);
  await p.screenshot({path:'/tmp/shot-import.png'});
  // PDF rendering check via print-to-pdf
  await p.evaluate(()=>{location.hash='#/print/schedule'}); await p.waitForTimeout(500);
  await p.pdf({path:'/tmp/schedule.pdf',format:'A4',printBackground:true});
  console.log('\n  printed to PDF:', fs.statSync('/tmp/schedule.pdf').size, 'bytes');

  console.log('\nerrors:', errs.length?errs.join('\n'):'none');
  await b.close(); process.exit(errs.length?1:0);
})();
