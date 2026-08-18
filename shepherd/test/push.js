/* Pop-up reminders.
 *
 * The important half is cryptographic and cannot be judged by eye, so this
 * suite plays the part of the phone: it makes the key pair a browser would
 * make, takes what the server produces, and opens it exactly as the browser
 * would. If the message comes back out, the phones will be able to read it.
 * A stand-in push service catches the request so the headers can be checked
 * without anything leaving the machine.
 *
 * node test/push.js */
'use strict';

var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var child = require('child_process');

var Push = require(path.join(__dirname, '..', 'server', 'push.js'));
var failures = 0;

function ok(name, condition, detail) {
  if (condition) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function hmac(key, data) { return crypto.createHmac('sha256', key).update(data).digest(); }

/* ---------- a phone ---------- */

function makePhone() {
  var ecdh = crypto.createECDH('prime256v1');
  var pub = ecdh.generateKeys();
  var auth = crypto.randomBytes(16);
  return {
    ecdh: ecdh, pub: pub, auth: auth,
    sub: { p256dh: pub.toString('base64url'), auth: auth.toString('base64url') },
    /* what the browser does before handing the message to the service worker */
    open: function (body) {
      var salt = body.slice(0, 16);
      var idlen = body[20];
      var serverPub = body.slice(21, 21 + idlen);
      var sealed = body.slice(21 + idlen);
      var shared = ecdh.computeSecret(serverPub);
      var prkKey = hmac(auth, shared);
      var ikm = hmac(prkKey, Buffer.concat([
        Buffer.from('WebPush: info\0', 'utf8'), pub, serverPub, Buffer.from([1])
      ]));
      var prk = hmac(salt, ikm);
      var cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), Buffer.from([1])])).slice(0, 16);
      var nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0', 'utf8'), Buffer.from([1])])).slice(0, 12);
      var d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
      d.setAuthTag(sealed.slice(sealed.length - 16));
      var out = Buffer.concat([d.update(sealed.slice(0, sealed.length - 16)), d.final()]);
      return JSON.parse(out.slice(0, out.length - 1).toString('utf8'));   // drop the 0x02 delimiter
    }
  };
}

(async function () {
  var DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'shepherd-push-'));
  var push = new Push(DIR);

  console.log('the server’s own keys');
  ok('a key pair is made on first use', !!push.publicKey() && push.publicKey().length > 80, push.publicKey());
  ok('it is an uncompressed P-256 point, as browsers require',
    Buffer.from(push.publicKey(), 'base64url').length === 65
      && Buffer.from(push.publicKey(), 'base64url')[0] === 4);
  ok('the private half is written where only the server can read it',
    (fs.statSync(path.join(DIR, 'push-keys.json')).mode & 0o077) === 0);
  var again = new Push(DIR);
  ok('restarting keeps the same key, so subscribed phones are not orphaned',
    again.publicKey() === push.publicKey());

  console.log('\nthe sealed message');
  var phone = makePhone();
  var message = {
    title: 'Your group cleans the hall on Saturday',
    body: 'After the weekend meeting — Group 3 — windows this time, and an accent: réunion',
    url: './#/my-cleaning', tag: 'cleaning-1'
  };
  var body = push.encrypt(phone.sub, JSON.stringify(message));
  var opened = phone.open(body);
  ok('the phone can open what the server sealed', opened.title === message.title, JSON.stringify(opened).slice(0, 80));
  ok('the whole message survives, accents and all', opened.body === message.body);
  ok('and what it should open when tapped', opened.url === './#/my-cleaning');

  var salt = body.slice(0, 16);
  ok('the envelope is laid out the way the standard says',
    body.length > 21 + 65 && body[20] === 65 && body.readUInt32BE(16) === 4096,
    'idlen=' + body[20] + ' rs=' + body.readUInt32BE(16));
  var second = push.encrypt(phone.sub, JSON.stringify(message));
  ok('every message uses a fresh salt and a fresh key',
    !salt.equals(second.slice(0, 16)) && !body.slice(21, 86).equals(second.slice(21, 86)));

  var other = makePhone();
  var wrong = false;
  try { other.open(body); wrong = true; } catch (e) { /* as it should be */ }
  ok('another phone cannot open it', !wrong);

  var tampered = Buffer.from(body);
  tampered[tampered.length - 20] ^= 0xFF;
  var tamperOpened = false;
  try { phone.open(tampered); tamperOpened = true; } catch (e) { /* as it should be */ }
  ok('and a message meddled with in transit is refused', !tamperOpened);

  console.log('\nproving who sent it');
  var jwt = push.vapid('https://push.example.org/some/endpoint', 'mailto:elders@example.org');
  var parts = jwt.split('.');
  ok('the token has three parts', parts.length === 3);
  var header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  var claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  ok('signed the way push services expect', header.alg === 'ES256' && header.typ === 'JWT');
  ok('addressed to that push service only', claims.aud === 'https://push.example.org', claims.aud);
  ok('and it expires', claims.exp > Math.floor(Date.now() / 1000) && claims.exp < Date.now() / 1000 + 24 * 3600);

  var spki = Buffer.concat([
    Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex'),
    Buffer.from(push.publicKey(), 'base64url')
  ]);
  var verifies = crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]),
    { key: crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' }), dsaEncoding: 'ieee-p1363' },
    Buffer.from(parts[2], 'base64url'));
  ok('the signature checks out against the key the phone was given', verifies);

  /* ---------- a stand-in push service ---------- */
  console.log('\nsending');
  var seen = [];
  var service = http.createServer(function (req, res) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      seen.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      if (req.url.indexOf('/gone') === 0) { res.writeHead(410); res.end(); return; }
      if (req.url.indexOf('/broken') === 0) { res.writeHead(500); res.end('nope'); return; }
      res.writeHead(201); res.end();
    });
  });
  await new Promise(function (r) { service.listen(0, '127.0.0.1', r); });
  var origin = 'http://127.0.0.1:' + service.address().port;

  push.subscribe('p_20', { endpoint: origin + '/ok/ruth', keys: phone.sub }, 'Chrome on Android');
  ok('a phone can subscribe', push.forPerson('p_20').length === 1);
  push.subscribe('p_20', { endpoint: origin + '/ok/ruth', keys: phone.sub }, 'Chrome on Android');
  ok('subscribing twice from the same phone does not double it', push.forPerson('p_20').length === 1);
  var laptop = makePhone();
  push.subscribe('p_20', { endpoint: origin + '/ok/ruth-laptop', keys: laptop.sub }, 'Firefox');
  ok('but a second device is its own subscription', push.forPerson('p_20').length === 2);
  ok('one person’s devices are not another’s', push.forPerson('p_21').length === 0);

  var out = await push.toPerson('p_20', message);
  ok('both her devices are sent to', out.sent === 2, JSON.stringify(out));
  ok('the push service was asked twice', seen.length === 2);
  var call = seen[0];
  ok('the request says how it is encoded', call.headers['content-encoding'] === 'aes128gcm');
  ok('it carries the signature and the key',
    /^vapid t=[^,]+,k=.+/.test(call.headers.authorization || ''), call.headers.authorization);
  ok('the key sent is this server’s',
    (call.headers.authorization || '').indexOf('k=' + push.publicKey()) !== -1);
  ok('it tells the service how long to hold it', +call.headers.ttl > 0, call.headers.ttl);
  ok('and what arrived is what the phone can open',
    phone.open(call.body).title === message.title);
  ok('nothing readable is on the wire',
    call.body.indexOf(Buffer.from('cleans the hall')) === -1
      && call.body.indexOf(Buffer.from('my-cleaning')) === -1);

  push.subscribe('p_30', { endpoint: origin + '/gone/old-phone', keys: makePhone().sub }, 'an old phone');
  var goneOut = await push.toPerson('p_30', message);
  ok('a phone that has been wiped is dropped rather than tried for ever',
    goneOut.gone === 1 && push.forPerson('p_30').length === 0, JSON.stringify(goneOut));

  push.subscribe('p_31', { endpoint: origin + '/broken/x', keys: makePhone().sub }, 'a sulking service');
  var badOut = await push.toPerson('p_31', message);
  ok('a push service having a bad day is counted, not thrown',
    badOut.failed === 1 && badOut.sent === 0, JSON.stringify(badOut));
  ok('and the reason is kept for the administrator', /500/.test(push.lastError || ''), push.lastError);

  ok('unsubscribing removes only that device',
    push.unsubscribe(origin + '/ok/ruth-laptop') === 1 && push.forPerson('p_20').length === 1);
  ok('and removing a person takes all of theirs',
    push.forgetPerson('p_20') === 1 && push.forPerson('p_20').length === 0);

  service.close();
  fs.rmSync(DIR, { recursive: true, force: true });

  /* ---------- through the server ---------- */
  console.log('\nthrough the server');
  var PORT = 8937, BASE = 'http://127.0.0.1:' + PORT;
  var DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'shepherd-push-srv-'));
  var server = child.spawn(process.execPath,
    [path.join(__dirname, '..', 'server', 'server.js'), '--port', String(PORT), '--host', '127.0.0.1', '--data', DATA],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', function (d) { process.stderr.write('[server] ' + d); });

  function request(method, endpoint, reqBody, cookie) {
    return new Promise(function (resolve, reject) {
      var payload = reqBody == null ? null : Buffer.from(JSON.stringify(reqBody));
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
          resolve({ status: res.statusCode, body: data, cookie: (res.headers['set-cookie'] || [])[0] });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  for (var i = 0; i < 40; i++) {
    try { await request('GET', '/api/health'); break; } catch (e) { await wait(150); }
  }

  var setup = await request('POST', '/api/setup', {
    email: 'coordinator@example.org', password: 'first-password-1',
    firstName: 'Daniel', lastName: 'Achebe', demo: true
  });
  var admin = setup.cookie.split(';')[0];

  ok('the app is refused the key until someone signs in',
    (await request('GET', '/api/push')).status === 401);
  var info = await request('GET', '/api/push', null, admin);
  ok('a signed-in publisher is given the key to subscribe with',
    info.status === 200 && !!info.body.publicKey);
  ok('and told nothing is subscribed yet', info.body.devices === 0);

  var phone2 = makePhone();
  var sub = await request('POST', '/api/push/subscribe',
    { subscription: { endpoint: 'https://push.example.org/abc', keys: phone2.sub } }, admin);
  ok('a device can be registered', sub.status === 200 && sub.body.devices === 1, JSON.stringify(sub.body));
  ok('a half-finished subscription is refused',
    (await request('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://x' } }, admin)).status === 400);

  var made = await request('POST', '/api/password',
    { personId: 'p_20', email: 'ruth@example.org', mustChange: false }, admin);
  var ruth = (await request('POST', '/api/login',
    { email: 'ruth@example.org', password: made.body.password })).cookie;
  var hers = await request('GET', '/api/push', null, ruth);
  ok('another publisher sees her own devices, not his', hers.body.devices === 0 && hers.body.total === 1);
  await request('POST', '/api/push/unsubscribe', { endpoint: 'https://push.example.org/abc' }, ruth);
  ok('and cannot unsubscribe his',
    (await request('GET', '/api/push', null, admin)).body.devices === 1);

  var subs = JSON.parse(fs.readFileSync(path.join(DATA, 'push-subs.json'), 'utf8'));
  ok('subscriptions are kept out of the shared document',
    JSON.stringify((await request('GET', '/api/state', null, admin)).body.doc).indexOf('p256dh') === -1);
  ok('and on disk where only the server can read them',
    (fs.statSync(path.join(DATA, 'push-subs.json')).mode & 0o077) === 0 && Object.keys(subs).length === 1);

  server.kill('SIGTERM');
  fs.rmSync(DATA, { recursive: true, force: true });

  console.log('\n' + (failures ? failures + ' failed' : 'all good'));
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
