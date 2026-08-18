/* Pop-up reminders on phones — Web Push, written out in full so the server
 * needs nothing installed.
 *
 * How it hangs together. The phone's browser gives the app a "subscription": an
 * address at the browser maker's push service (Google's for Chrome, Mozilla's
 * for Firefox, Apple's for Safari), plus two keys. Shepherd encrypts the message
 * with those keys — RFC 8291, aes128gcm — and signs the request with its own key
 * pair — RFC 8292, VAPID — so only that phone can read the reminder and only
 * this server can send to that address. The push service passes on a sealed
 * envelope it cannot open.
 *
 * Two things a body of elders should know, and the app says both plainly:
 *   · the phone's own push service is in the middle. That is how every app on a
 *     phone gets a notification, and it cannot see what is inside; but it does
 *     see that this server sent that phone something.
 *   · an iPhone only allows this once Shepherd has been added to the home
 *     screen. That is Apple's rule, not ours. */
'use strict';

var fs = require('fs');
var path = require('path');
var url = require('url');
var https = require('https');
var http = require('http');
var crypto = require('crypto');

var TTL = 6 * 3600;               // a reminder nobody collected in six hours is stale

function Push(dir, mail) {
  this.dir = dir;
  this.keyPath = path.join(dir, 'push-keys.json');
  this.subPath = path.join(dir, 'push-subs.json');
  this.keys = read(this.keyPath, null) || this.generateKeys();
  this.subs = read(this.subPath, {});     // token -> {personId, endpoint, p256dh, auth, agent, createdAt}
  this.lastError = null;
}

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function write(file, value) {
  var tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}
function b64(buf) { return Buffer.from(buf).toString('base64url'); }
function unb64(str) { return Buffer.from(String(str), 'base64url'); }

/* ---------- the server's own key pair ---------- */

/* Made once, on first use, and kept. Changing it would silently orphan every
   phone already subscribed, so it is never regenerated on its own. */
Push.prototype.generateKeys = function () {
  var pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  var pubDer = pair.publicKey.export({ type: 'spki', format: 'der' });
  var keys = {
    publicKey: b64(pubDer.slice(pubDer.length - 65)),        // the uncompressed point
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    createdAt: Date.now()
  };
  write(this.keyPath, keys);
  return keys;
};

Push.prototype.publicKey = function () { return this.keys.publicKey; };

/* ---------- who is subscribed ---------- */

Push.prototype.subscribe = function (personId, sub, agent) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    throw new Error('That subscription is not complete.');
  }
  var token = crypto.createHash('sha256').update(String(sub.endpoint)).digest('hex').slice(0, 32);
  this.subs[token] = {
    personId: personId,
    endpoint: String(sub.endpoint),
    p256dh: String(sub.keys.p256dh),
    auth: String(sub.keys.auth),
    agent: String(agent || '').slice(0, 120),
    createdAt: this.subs[token] ? this.subs[token].createdAt : Date.now(),
    failures: 0
  };
  write(this.subPath, this.subs);
  return token;
};

Push.prototype.unsubscribe = function (endpoint) {
  var self = this, removed = 0;
  Object.keys(this.subs).forEach(function (t) {
    if (self.subs[t].endpoint === endpoint) { delete self.subs[t]; removed++; }
  });
  if (removed) write(this.subPath, this.subs);
  return removed;
};

Push.prototype.forgetPerson = function (personId) {
  var self = this, removed = 0;
  Object.keys(this.subs).forEach(function (t) {
    if (self.subs[t].personId === personId) { delete self.subs[t]; removed++; }
  });
  if (removed) write(this.subPath, this.subs);
  return removed;
};

Push.prototype.forPerson = function (personId) {
  var self = this;
  return Object.keys(this.subs)
    .filter(function (t) { return self.subs[t].personId === personId; })
    .map(function (t) { return Object.assign({ token: t }, self.subs[t]); });
};

Push.prototype.count = function () { return Object.keys(this.subs).length; };

Push.prototype.devices = function () {
  var self = this;
  var byPerson = {};
  Object.keys(this.subs).forEach(function (t) {
    var s = self.subs[t];
    byPerson[s.personId] = (byPerson[s.personId] || 0) + 1;
  });
  return byPerson;
};

/* ---------- the envelope ---------- */

/* RFC 8291. The phone gave us its public key and a shared secret; we make a
   throw-away key pair of our own, agree on a secret with it, and derive the
   content key and nonce from the pair. */
Push.prototype.encrypt = function (sub, payload) {
  var plaintext = Buffer.from(payload, 'utf8');
  var clientPub = unb64(sub.p256dh);
  var authSecret = unb64(sub.auth);

  var ecdh = crypto.createECDH('prime256v1');
  var serverPub = ecdh.generateKeys();
  var shared = ecdh.computeSecret(clientPub);

  var prkKey = hmac(authSecret, shared);
  var keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'), clientPub, serverPub, Buffer.from([1])
  ]);
  var ikm = hmac(prkKey, keyInfo);

  var salt = crypto.randomBytes(16);
  var prk = hmac(salt, ikm);
  var cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), Buffer.from([1])])).slice(0, 16);
  var nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0', 'utf8'), Buffer.from([1])])).slice(0, 12);

  var cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  var body = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([2])])),   // 0x02 ends the record
    cipher.final(),
    cipher.getAuthTag()
  ]);

  var recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([serverPub.length]), serverPub, body]);
};

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/* RFC 8292: a short-lived token proving the message came from this server. */
Push.prototype.vapid = function (endpoint, subject) {
  var u = url.parse(endpoint);
  var header = b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  var claims = b64(JSON.stringify({
    aud: u.protocol + '//' + u.host,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject || 'mailto:shepherd@localhost'
  }));
  var signing = header + '.' + claims;
  var der = crypto.sign('sha256', Buffer.from(signing, 'utf8'), {
    key: this.keys.privateKey, dsaEncoding: 'ieee-p1363'      // r||s, which is what JWS wants
  });
  return signing + '.' + b64(der);
};

/* ---------- sending ---------- */

/* Resolves {sent, gone} — "gone" is a phone that has unsubscribed or been wiped,
   whose subscription is dropped so it is not tried again. */
Push.prototype.send = function (sub, message, opts) {
  var self = this;
  opts = opts || {};
  var payload = JSON.stringify(message);
  var body = this.encrypt(sub, payload);
  var u = url.parse(sub.endpoint);
  var transport = u.protocol === 'http:' ? http : https;

  return new Promise(function (resolve, reject) {
    var req = transport.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port,
      path: u.path, method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length': body.length,
        'TTL': String(opts.ttl || TTL),
        'Urgency': opts.urgency || 'normal',
        'Authorization': 'vapid t=' + self.vapid(sub.endpoint, opts.subject)
          + ',k=' + self.keys.publicKey
      },
      timeout: 15000
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var text = Buffer.concat(chunks).toString('utf8').slice(0, 300);
        if (res.statusCode === 404 || res.statusCode === 410) {
          self.unsubscribe(sub.endpoint);
          resolve({ ok: false, gone: true, status: res.statusCode });
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) { resolve({ ok: true, status: res.statusCode }); return; }
        reject(new Error('Push service answered ' + res.statusCode + ' ' + text));
      });
    });
    req.on('timeout', function () { req.destroy(new Error('The push service did not answer.')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
};

/* Every device one person has. One failure does not stop the others. */
Push.prototype.toPerson = function (personId, message, opts) {
  var self = this;
  var subs = this.forPerson(personId);
  if (!subs.length) return Promise.resolve({ sent: 0, gone: 0, failed: 0 });
  var sent = 0, gone = 0, failed = 0;
  return subs.reduce(function (chain, sub) {
    return chain.then(function () {
      return self.send(sub, message, opts).then(function (out) {
        if (out.ok) sent++; else if (out.gone) gone++;
      }, function (err) {
        failed++;
        self.lastError = String(err && err.message || err);
        var record = self.subs[sub.token];
        if (record) {
          record.failures = (record.failures || 0) + 1;
          // a phone that has refused ten times in a row is not coming back
          if (record.failures >= 10) { delete self.subs[sub.token]; gone++; }
          write(self.subPath, self.subs);
        }
      });
    });
  }, Promise.resolve()).then(function () { return { sent: sent, gone: gone, failed: failed }; });
};

module.exports = Push;
