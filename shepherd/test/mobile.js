/* The parts that matter on a phone, in a real browser against a real server:

     the invitation link opens, a publisher chooses a password and lands in
     their own view  ·  the app can be installed  ·  it still opens with no
     signal  ·  nothing personal is kept in the offline cache

   node test/mobile.js */
'use strict';

var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var child = require('child_process');
var { chromium } = require('playwright');

var PORT = 8935;
var BASE = 'http://127.0.0.1:' + PORT;
var DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'shepherd-mobile-'));
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
  var candidates = ['chrome-linux/chrome', 'chrome-linux64/chrome',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe'];
  for (var i = 0; i < candidates.length; i++) {
    var full = base + '/' + dir + '/' + candidates[i];
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
function waitForServer(tries) {
  return request('GET', '/api/health').catch(function (e) {
    if (tries <= 0) throw e;
    return wait(150).then(function () { return waitForServer(tries - 1); });
  });
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
  await waitForServer(40);

  var setup = await request('POST', '/api/setup', {
    email: 'coordinator@example.org', password: 'first-password-1',
    firstName: 'Daniel', lastName: 'Achebe', demo: true
  });
  var admin = setup.cookie ? setup.cookie.split(';')[0] : null;
  ok('the server is set up', setup.status === 200 && !!admin);

  // give Ruth something to look at, then invite her
  var doc = (await request('GET', '/api/state', null, admin)).body.doc;
  var today = new Date().toISOString().slice(0, 10);
  var week = JSON.parse(JSON.stringify(doc.weeks.filter(function (w) { return w.midweek.date > today; })[1]));
  var part = week.midweek.parts.filter(function (p) { return !p.assigneeId; })[0] || week.midweek.parts[1];
  part.assigneeId = 'p_20';
  await request('POST', '/api/changes', { changes: [{ c: 'weeks', id: week.id, op: 'put', rec: week }] }, admin);

  var invite = await request('POST', '/api/invite', { personId: 'p_20', email: 'ruth@example.org' }, admin);
  var token = /token=([^&"'\s<]+)/.exec(invite.body.link)[1];

  browser = await chromium.launch(LAUNCH);
  // an iPhone-ish viewport, because that is what a publisher will hold
  var context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: false });
  var page = await context.newPage();
  var errors = [];
  page.on('pageerror', function (e) { errors.push('PAGEERROR: ' + e.message); });
  page.on('console', function (m) {
    // a 401 before signing in and a dropped fetch while offline are the point of
    // the exercise, not faults — everything else counts
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('CONSOLE: ' + m.text());
  });

  // ---------- the invitation, as the publisher sees it ----------
  console.log('opening the invitation');
  await page.goto(BASE + '/invite?token=' + encodeURIComponent(token));
  await page.waitForTimeout(900);
  var heading = await page.evaluate(function () {
    var h = document.querySelector('#content h1, #content .page-title, .gate h1, h1');
    return h ? h.textContent : document.body.textContent.slice(0, 120);
  });
  ok('it greets her by name', /Ruth/.test(heading), heading);
  ok('and says which congregation it is', /Riverside/.test(await page.textContent('body')));

  var boxes = await page.$$('input[type=password]');
  ok('it asks for a password twice', boxes.length === 2, boxes.length + ' password boxes');
  await boxes[0].fill('short');
  await boxes[1].fill('short');
  await page.getByText('Set it and go in').click();
  await page.waitForTimeout(250);
  ok('a short password is turned back', /at least 8/i.test(await page.textContent('body')));

  await boxes[0].fill('ruth-own-password');
  await boxes[1].fill('different-password');
  await page.getByText('Set it and go in').click();
  await page.waitForTimeout(250);
  ok('two that differ are turned back', /do not match/i.test(await page.textContent('body')));

  await boxes[0].fill('ruth-own-password');
  await boxes[1].fill('ruth-own-password');
  await page.getByText('Set it and go in').click();
  await page.waitForTimeout(1500);

  var landed = await page.evaluate(function () {
    return {
      user: window.Sync.user && window.Sync.user.personId,
      workspace: window.Auth.workspaces().map(function (w) { return w.id; }),
      hash: location.hash,
      search: location.search,
      nav: Array.prototype.map.call(document.querySelectorAll('.sidebar a, .sidebar button'),
        function (a) { return a.textContent.trim(); })
    };
  });
  ok('she is signed in as herself', landed.user === 'p_20', JSON.stringify(landed.user));
  ok('the token is taken out of the address bar', landed.search === '', landed.search);
  ok('she gets the publisher view and no other',
    landed.workspace.length === 1 && landed.workspace[0] === 'publisher', JSON.stringify(landed.workspace));
  ok('with her own assignments in the menu',
    landed.nav.some(function (t) { return /assignment/i.test(t); }), JSON.stringify(landed.nav));

  await page.evaluate(function () { location.hash = '#/my-assignments'; });
  await page.waitForTimeout(400);
  ok('and the part she was given is there',
    (await page.textContent('#content')).indexOf(part.title.slice(0, 18)) !== -1);

  // ---------- installing on the phone ----------
  console.log('\ninstalling on a phone');
  var manifest = await request('GET', '/manifest.webmanifest');
  ok('the manifest is served', manifest.status === 200);
  ok('as a manifest', /manifest\+json/.test(manifest.headers['content-type'] || ''), manifest.headers['content-type']);
  var m = JSON.parse(manifest.text);
  ok('it opens full screen', m.display === 'standalone');
  ok('it names the app for the home screen', m.short_name === 'Shepherd');
  for (var i = 0; i < m.icons.length; i++) {
    var icon = await request('GET', '/' + m.icons[i].src);
    ok('the ' + m.icons[i].sizes + ' ' + m.icons[i].purpose + ' icon is really there',
      icon.status === 200 && (icon.headers['content-type'] || '').indexOf('image/png') === 0);
  }
  ok('there is a maskable one, for Android’s round icons',
    m.icons.some(function (x) { return x.purpose === 'maskable'; }));
  var apple = await request('GET', '/icons/apple-touch-icon.png');
  ok('and an apple-touch-icon for the iPhone', apple.status === 200);

  var linked = await page.evaluate(function () {
    return {
      manifest: !!document.querySelector('link[rel=manifest]'),
      apple: !!document.querySelector('link[rel=apple-touch-icon]'),
      themeColour: (document.querySelector('meta[name=theme-color]') || {}).content
    };
  });
  ok('the page points at the manifest', linked.manifest);
  ok('and at the apple-touch-icon', linked.apple);
  ok('and colours the phone’s status bar', !!linked.themeColour, linked.themeColour);

  // ---------- offline ----------
  console.log('\nwith no signal');
  var registered = await page.evaluate(function () {
    return navigator.serviceWorker.ready.then(function (reg) { return !!reg.active; });
  });
  ok('a service worker is running', registered === true);

  // give it a moment to finish storing the shell
  await page.waitForTimeout(1200);

  var cached = await page.evaluate(function () {
    return caches.keys().then(function (keys) {
      return caches.open(keys[0]).then(function (c) {
        return c.keys().then(function (reqs) { return reqs.map(function (r) { return new URL(r.url).pathname; }); });
      });
    });
  });
  ok('the app itself is stored on the phone',
    cached.indexOf('/js/app.js') !== -1 && cached.indexOf('/css/app.css') !== -1,
    cached.length + ' entries');
  ok('nothing from the congregation’s records is stored in it',
    !cached.some(function (p) { return p.indexOf('/api/') === 0 || p.indexOf('/calendar/') === 0; }),
    JSON.stringify(cached.filter(function (p) { return p.indexOf('/api/') === 0; })));

  await context.setOffline(true);
  await page.reload();
  await page.waitForTimeout(2500);
  var offline = await page.evaluate(function () {
    return {
      title: document.title,
      hasShell: !!document.querySelector('#root'),
      body: document.body.textContent.slice(0, 200)
    };
  });
  ok('the app still opens with no network', /Shepherd/.test(offline.title) && offline.hasShell,
    offline.title + ' / ' + offline.body.slice(0, 80));
  await context.setOffline(false);

  ok('and nothing threw along the way', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('\n' + (failures ? failures + ' failed' : 'all good'));
  await stop(failures ? 1 : 0);
})().catch(function (e) { console.error(e); stop(1); });
