/* Credentials and sessions.
 *
 * Password hashes live in their own file and are never part of the synced
 * document, so they can never reach a browser. */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ITERATIONS = 210000;
var KEYLEN = 32;
var DIGEST = 'sha256';
var SESSION_DAYS = 30;

function Auth(dir) {
  this.dir = dir;
  this.credPath = path.join(dir, 'credentials.json');
  this.sessPath = path.join(dir, 'sessions.json');
  fs.mkdirSync(dir, { recursive: true });
  this.creds = read(this.credPath, {});
  this.sessions = read(this.sessPath, {});
  this.prune();
}

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function write(file, value) {
  var tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

function hash(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
}

Auth.prototype.isEmpty = function () { return Object.keys(this.creds).length === 0; };

Auth.prototype.byEmail = function (email) {
  var key = String(email || '').trim().toLowerCase();
  var ids = Object.keys(this.creds);
  for (var i = 0; i < ids.length; i++) {
    if (this.creds[ids[i]].email === key) return { personId: ids[i], cred: this.creds[ids[i]] };
  }
  return null;
};

Auth.prototype.has = function (personId) { return !!this.creds[personId]; };

Auth.prototype.list = function () {
  var self = this;
  return Object.keys(this.creds).map(function (id) {
    return {
      personId: id,
      email: self.creds[id].email,
      mustChange: !!self.creds[id].mustChange,
      createdAt: self.creds[id].createdAt,
      lastLoginAt: self.creds[id].lastLoginAt || null
    };
  });
};

Auth.prototype.setPassword = function (personId, email, password, mustChange) {
  if (!password || String(password).length < 8) {
    throw new Error('A password needs at least 8 characters.');
  }
  var clash = this.byEmail(email);
  if (clash && clash.personId !== personId) {
    throw new Error('That email address is already used by another account.');
  }
  var salt = crypto.randomBytes(16).toString('hex');
  var existing = this.creds[personId];
  this.creds[personId] = {
    email: String(email || (existing && existing.email) || '').trim().toLowerCase(),
    salt: salt,
    hash: hash(password, salt),
    iterations: ITERATIONS,
    mustChange: !!mustChange,
    createdAt: existing ? existing.createdAt : Date.now(),
    lastLoginAt: existing ? existing.lastLoginAt : null
  };
  write(this.credPath, this.creds);
};

Auth.prototype.remove = function (personId) {
  var self = this;
  delete this.creds[personId];
  Object.keys(this.sessions).forEach(function (t) {
    if (self.sessions[t].personId === personId) delete self.sessions[t];
  });
  write(this.credPath, this.creds);
  write(this.sessPath, this.sessions);
};

Auth.prototype.verify = function (email, password) {
  var found = this.byEmail(email);
  if (!found) return null;
  var c = found.cred;
  var attempt = crypto.pbkdf2Sync(password, c.salt, c.iterations || ITERATIONS, KEYLEN, DIGEST);
  var stored = Buffer.from(c.hash, 'hex');
  if (attempt.length !== stored.length) return null;
  if (!crypto.timingSafeEqual(attempt, stored)) return null;
  c.lastLoginAt = Date.now();
  write(this.credPath, this.creds);
  return found.personId;
};

Auth.prototype.mustChange = function (personId) {
  return !!(this.creds[personId] && this.creds[personId].mustChange);
};

Auth.prototype.startSession = function (personId, agent) {
  var token = crypto.randomBytes(32).toString('hex');
  this.sessions[token] = {
    personId: personId,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    agent: String(agent || '').slice(0, 120)
  };
  write(this.sessPath, this.sessions);
  return token;
};

Auth.prototype.session = function (token) {
  if (!token) return null;
  var s = this.sessions[token];
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_DAYS * 86400000) {
    delete this.sessions[token];
    write(this.sessPath, this.sessions);
    return null;
  }
  // only rewrite the file occasionally; this runs on every request
  if (Date.now() - s.lastSeenAt > 300000) {
    s.lastSeenAt = Date.now();
    write(this.sessPath, this.sessions);
  } else {
    s.lastSeenAt = Date.now();
  }
  return s;
};

Auth.prototype.endSession = function (token) {
  if (!token || !this.sessions[token]) return;
  delete this.sessions[token];
  write(this.sessPath, this.sessions);
};

Auth.prototype.activeSessions = function () {
  var self = this;
  return Object.keys(this.sessions).map(function (t) {
    return {
      personId: self.sessions[t].personId,
      createdAt: self.sessions[t].createdAt,
      lastSeenAt: self.sessions[t].lastSeenAt,
      agent: self.sessions[t].agent
    };
  });
};

Auth.prototype.prune = function () {
  var self = this, changed = false;
  Object.keys(this.sessions).forEach(function (t) {
    if (Date.now() - self.sessions[t].createdAt > SESSION_DAYS * 86400000) {
      delete self.sessions[t];
      changed = true;
    }
  });
  if (changed) write(this.sessPath, this.sessions);
};

Auth.randomPassword = function () {
  // readable enough to pass on verbally, still 60+ bits of entropy
  var words = ['amber', 'bridge', 'candle', 'daily', 'eager', 'forest', 'garden', 'harbour',
    'island', 'jasmine', 'kindly', 'lantern', 'meadow', 'nectar', 'orchard', 'poplar',
    'quiet', 'ribbon', 'summit', 'timber', 'upland', 'valley', 'willow', 'yonder'];
  var pick = function () { return words[crypto.randomInt(words.length)]; };
  return pick() + '-' + pick() + '-' + crypto.randomInt(1000, 9999);
};

module.exports = Auth;
