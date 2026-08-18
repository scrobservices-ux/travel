/* A small SMTP client and an outbox, with no dependencies.
 *
 * Congregations do not run mail servers, so this talks to whatever account they
 * already have — a Gmail app password, their own hosting, a relay. Nothing is
 * sent until an administrator has entered those details and pressed Test.
 *
 * Until then the transport is "file": messages are written to data/outbox as
 * .eml files so the whole flow can be seen working without sending anything. */
'use strict';

var fs = require('fs');
var net = require('net');
var tls = require('tls');
var path = require('path');
var crypto = require('crypto');

function Mail(dir) {
  this.dir = dir;
  this.settingsPath = path.join(dir, 'mail.json');
  this.queuePath = path.join(dir, 'outbox.json');
  this.spoolDir = path.join(dir, 'outbox');
  fs.mkdirSync(dir, { recursive: true });
  this.settings = read(this.settingsPath, {
    transport: 'file',              // 'file' | 'smtp' | 'off'
    host: '', port: 587, secure: false, user: '', pass: '',
    from: '', fromName: 'Shepherd', replyTo: '',
    baseUrl: '',                    // what goes in links; taken from the request if blank
    digestDay: 1,                   // Monday
    digestHour: 8,
    lastDigestOn: null
  });
  this.queue = read(this.queuePath, []);
}

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function write(file, value, mode) {
  var tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: mode || 0o600 });
  fs.renameSync(tmp, file);
}

Mail.prototype.saveSettings = function (patch) {
  var self = this;
  Object.keys(patch || {}).forEach(function (k) {
    if (k === 'pass' && patch[k] === '') return;      // blank means "keep the one we have"
    self.settings[k] = patch[k];
  });
  if (this.settings.port) this.settings.port = +this.settings.port;
  write(this.settingsPath, this.settings);
  return this.publicSettings();
};

/* never hand the password back to a browser */
Mail.prototype.publicSettings = function () {
  var s = this.settings;
  return {
    transport: s.transport, host: s.host, port: s.port, secure: !!s.secure,
    user: s.user, hasPassword: !!s.pass, from: s.from, fromName: s.fromName,
    replyTo: s.replyTo, baseUrl: s.baseUrl, digestDay: s.digestDay, digestHour: s.digestHour,
    queued: this.queue.filter(function (m) { return !m.sentAt && !m.failedAt; }).length,
    sent: this.queue.filter(function (m) { return m.sentAt; }).length,
    failed: this.queue.filter(function (m) { return m.failedAt; }).length
  };
};

Mail.prototype.configured = function () {
  if (this.settings.transport === 'off') return false;
  if (this.settings.transport === 'file') return true;
  return !!(this.settings.host && this.settings.from);
};

/* ---------- the outbox ---------- */

Mail.prototype.enqueue = function (message) {
  var m = {
    id: crypto.randomBytes(8).toString('hex'),
    to: message.to,
    toName: message.toName || '',
    subject: message.subject,
    text: message.text,
    html: message.html || null,
    kind: message.kind || 'other',
    personId: message.personId || null,
    createdAt: Date.now(),
    attempts: 0,
    sentAt: null,
    failedAt: null,
    error: null
  };
  this.queue.push(m);
  if (this.queue.length > 500) this.queue.splice(0, this.queue.length - 500);
  write(this.queuePath, this.queue);
  return m;
};

Mail.prototype.pending = function () {
  return this.queue.filter(function (m) { return !m.sentAt && !m.failedAt; });
};

/* Sends everything waiting. Resolves with {sent, failed}. */
Mail.prototype.flush = function () {
  var self = this;
  var pending = this.pending();
  if (!pending.length || !this.configured()) return Promise.resolve({ sent: 0, failed: 0 });

  var sent = 0, failed = 0;
  return pending.reduce(function (chain, m) {
    return chain.then(function () {
      return self.deliver(m).then(function () {
        m.sentAt = Date.now();
        sent++;
      }, function (err) {
        m.attempts += 1;
        m.error = String(err && err.message || err);
        if (m.attempts >= 5) m.failedAt = Date.now();
        failed++;
      });
    });
  }, Promise.resolve()).then(function () {
    write(self.queuePath, self.queue);
    return { sent: sent, failed: failed };
  });
};

Mail.prototype.deliver = function (m) {
  if (this.settings.transport === 'off') return Promise.reject(new Error('Email is turned off.'));
  if (this.settings.transport === 'file') {
    fs.mkdirSync(this.spoolDir, { recursive: true });
    var file = path.join(this.spoolDir, m.createdAt + '-' + m.id + '.eml');
    fs.writeFileSync(file, this.compose(m), 'utf8');
    return Promise.resolve();
  }
  return this.smtp(m);
};

/* ---------- composing ---------- */

function encodeHeader(value) {
  // RFC 2047 for anything outside ASCII, so names with accents survive
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return '=?UTF-8?B?' + Buffer.from(value, 'utf8').toString('base64') + '?=';
}

Mail.prototype.fromHeader = function () {
  var s = this.settings;
  var addr = s.from || 'shepherd@localhost';
  return s.fromName ? encodeHeader(s.fromName) + ' <' + addr + '>' : addr;
};

Mail.prototype.compose = function (m) {
  var s = this.settings;
  var boundary = 'sh_' + crypto.randomBytes(12).toString('hex');
  var head = [
    'From: ' + this.fromHeader(),
    'To: ' + (m.toName ? encodeHeader(m.toName) + ' <' + m.to + '>' : m.to),
    s.replyTo ? 'Reply-To: ' + s.replyTo : null,
    'Subject: ' + encodeHeader(m.subject),
    'Date: ' + new Date(m.createdAt).toUTCString(),
    'Message-ID: <' + m.id + '@shepherd.local>',
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated'
  ].filter(Boolean);

  if (!m.html) {
    head.push('Content-Type: text/plain; charset=utf-8');
    head.push('Content-Transfer-Encoding: base64');
    return head.join('\r\n') + '\r\n\r\n' + wrap(Buffer.from(m.text, 'utf8').toString('base64'));
  }
  head.push('Content-Type: multipart/alternative; boundary="' + boundary + '"');
  return head.join('\r\n') + '\r\n\r\n'
    + '--' + boundary + '\r\n'
    + 'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'
    + wrap(Buffer.from(m.text, 'utf8').toString('base64')) + '\r\n'
    + '--' + boundary + '\r\n'
    + 'Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'
    + wrap(Buffer.from(m.html, 'utf8').toString('base64')) + '\r\n'
    + '--' + boundary + '--\r\n';
};

function wrap(s) { return (s.match(/.{1,76}/g) || []).join('\r\n'); }

/* ---------- the SMTP conversation ---------- */

Mail.prototype.smtp = function (m) {
  var s = this.settings;
  var self = this;
  var body = this.compose(m);

  return new Promise(function (resolve, reject) {
    var socket = s.secure
      ? tls.connect({ host: s.host, port: s.port, servername: s.host })
      : net.connect({ host: s.host, port: s.port });
    var buffer = '';
    var waiting = null;
    var done = false;

    var timer = setTimeout(function () { fail(new Error('The mail server did not answer in time.')); }, 20000);

    function fail(err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch (e) { /* ignore */ }
      reject(err);
    }
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.end(); } catch (e) { /* ignore */ }
      resolve();
    }

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      var lines = buffer.split(/\r?\n/);
      // a reply is complete when a line reads "250 text" rather than "250-text"
      for (var i = 0; i < lines.length; i++) {
        if (/^\d{3} /.test(lines[i])) {
          var reply = lines.slice(0, i + 1).join('\n');
          buffer = lines.slice(i + 1).join('\r\n');
          var code = +reply.slice(0, 3);
          var handler = waiting;
          waiting = null;
          if (handler) handler(code, reply);
          return;
        }
      }
    }

    function say(command, expect, next) {
      waiting = function (code, reply) {
        if (expect && expect.indexOf(code) === -1) {
          fail(new Error('Mail server said: ' + reply.split('\n')[0]));
          return;
        }
        next(code, reply);
      };
      if (command !== null) socket.write(command + '\r\n');
    }

    socket.on('data', onData);
    socket.on('error', fail);
    socket.on('timeout', function () { fail(new Error('The connection to the mail server timed out.')); });
    socket.setTimeout(20000);

    // greeting
    say(null, [220], function () {
      say('EHLO shepherd', [250], function (code, greeting) {
        var canStartTls = /STARTTLS/i.test(greeting);
        if (!s.secure && canStartTls) {
          say('STARTTLS', [220], function () {
            var secured = tls.connect({ socket: socket, servername: s.host, rejectUnauthorized: true }, function () {
              secured.on('data', onData);
              secured.on('error', fail);
              socket = secured;
              say('EHLO shepherd', [250], function () { authenticate(); });
            });
            secured.on('error', fail);
          });
        } else {
          authenticate();
        }
      });
    });

    function authenticate() {
      if (!s.user) { envelope(); return; }
      say('AUTH LOGIN', [334], function () {
        say(Buffer.from(s.user, 'utf8').toString('base64'), [334], function () {
          say(Buffer.from(s.pass, 'utf8').toString('base64'), [235], function () { envelope(); });
        });
      });
    }

    function envelope() {
      say('MAIL FROM:<' + (s.from || 'shepherd@localhost') + '>', [250], function () {
        say('RCPT TO:<' + m.to + '>', [250, 251], function () {
          say('DATA', [354], function () {
            var payload = body.replace(/\r?\n\./g, '\r\n..');
            socket.write(payload + '\r\n.\r\n');
            say(null, [250], function () {
              say('QUIT', null, function () { finish(); });
              setTimeout(finish, 500);
            });
          });
        });
      });
    }
  });
};

module.exports = Mail;
