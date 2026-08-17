/* The shared document on disk, plus the change log the clients sync against.
 *
 * Records are synced one at a time, keyed by collection + id, so two elders
 * working on different things at the same time do not overwrite each other.
 * Everything is a plain JSON file — back it up by copying the data directory. */
'use strict';

var fs = require('fs');
var path = require('path');

// collections that sync, plus 'account' which is a single object
var COLLECTIONS = ['congregations', 'people', 'groups', 'weeks', 'duties', 'territories',
  'reports', 'attendance', 'tasks', 'visits', 'transactions', 'announcements', 'documents',
  'users', 'audit'];
var SINGLETONS = ['account'];
var LOG_LIMIT = 8000;

function DB(dir) {
  this.dir = dir;
  this.docPath = path.join(dir, 'shepherd.json');
  this.logPath = path.join(dir, 'changes.json');
  fs.mkdirSync(dir, { recursive: true });
  this.doc = readJSON(this.docPath, null);
  var log = readJSON(this.logPath, null) || { seq: 0, changes: [] };
  this.seq = log.seq || 0;
  this.log = log.changes || [];
  this.writeTimer = null;
}

DB.COLLECTIONS = COLLECTIONS;
DB.SINGLETONS = SINGLETONS;

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

// Write via a temp file so a crash mid-write cannot leave a half-written database.
function writeJSON(file, value) {
  var tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value), 'utf8');
  fs.renameSync(tmp, file);
}

DB.prototype.exists = function () { return !!this.doc; };

DB.prototype.init = function (doc) {
  this.doc = doc;
  delete this.doc.session;
  this.seq = 1;
  this.log = [];
  this.flush(true);
  return this.doc;
};

DB.prototype.snapshot = function () {
  return { doc: this.doc, seq: this.seq };
};

DB.prototype.collection = function (name) {
  if (!this.doc[name]) this.doc[name] = [];
  return this.doc[name];
};

DB.prototype.find = function (collection, id) {
  if (SINGLETONS.indexOf(collection) !== -1) return this.doc[collection] || null;
  var list = this.collection(collection);
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
};

/* Apply one {c, id, op, rec} change. Returns the stored change or null. */
DB.prototype.apply = function (change, meta) {
  var c = change.c;
  if (SINGLETONS.indexOf(c) !== -1) {
    if (change.op === 'del') return null;
    this.doc[c] = change.rec;
  } else {
    if (COLLECTIONS.indexOf(c) === -1) return null;
    var list = this.collection(c);
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === change.id) { idx = i; break; }
    if (change.op === 'del') {
      if (idx === -1) return null;
      list.splice(idx, 1);
    } else {
      if (idx === -1) list.push(change.rec);
      else list[idx] = change.rec;
    }
  }
  this.seq += 1;
  var stored = {
    seq: this.seq, c: c, id: change.id, op: change.op,
    rec: change.op === 'del' ? null : change.rec,
    by: meta && meta.personId || null,
    origin: meta && meta.origin || null,
    at: Date.now()
  };
  this.log.push(stored);
  if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
  this.scheduleFlush();
  return stored;
};

/* Changes after `since`. `full` means the caller has fallen too far behind
   and must re-fetch the whole document. */
DB.prototype.since = function (since) {
  if (since == null || since < 0) return { full: true, seq: this.seq };
  if (since === this.seq) return { changes: [], seq: this.seq };
  var oldest = this.log.length ? this.log[0].seq : this.seq + 1;
  if (since < oldest - 1) return { full: true, seq: this.seq };
  return {
    changes: this.log.filter(function (ch) { return ch.seq > since; }),
    seq: this.seq
  };
};

DB.prototype.scheduleFlush = function () {
  var self = this;
  if (this.writeTimer) return;
  this.writeTimer = setTimeout(function () {
    self.writeTimer = null;
    self.flush();
  }, 250);
};

DB.prototype.flush = function (force) {
  if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; }
  if (!this.doc && !force) return;
  writeJSON(this.docPath, this.doc);
  writeJSON(this.logPath, { seq: this.seq, changes: this.log });
};

module.exports = DB;
