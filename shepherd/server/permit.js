/* Server-side authorisation.
 *
 * The browser hides what a person may not do; this decides what the server will
 * actually accept, using the same role/capability table the UI reads. Publishers
 * get four narrow self-service exceptions: their own contact details, their own
 * field service report, confirming or declining their own assignment, and
 * handing back a territory checked out to them. */
'use strict';

require('../js/util.js');
require('../js/schema.js');
var S = globalThis.Schema;

// collection -> capability required to write it
var WRITE = {
  congregations: 'admin.manage',
  people: 'publishers.edit',
  groups: 'publishers.edit',
  weeks: 'schedule.edit',
  duties: 'duties.edit',
  territories: 'territories.manage',
  reports: 'reports.review',
  attendance: 'attendance.edit',
  tasks: 'tasks.edit',
  visits: 'shepherding.view',
  transactions: 'accounts.edit',
  announcements: 'announce.publish',
  users: 'admin.manage',
  account: 'admin.manage',
  audit: null            // anyone signed in may append their own entries
};

// fields a person may change on their own record
var SELF_FIELDS = ['phone', 'email', 'address', 'emergencyContact', 'unavailable'];

function rolesOf(person) {
  if (!person) return [];
  var roles = (person.roles || []).slice();
  if (roles.indexOf('publisher') === -1) roles.push('publisher');
  return roles;
}

function can(person, capability) {
  var roles = rolesOf(person);
  if (roles.indexOf('admin') !== -1) return true;
  if (!capability) return true;
  var allowed = S.PERMISSIONS[capability];
  if (!allowed) return false;
  return allowed.some(function (r) { return roles.indexOf(r) !== -1; });
}

function deny(reason) { return { ok: false, reason: reason }; }
var ALLOW = { ok: true };

/* Only the status of parts this person is on may differ. */
function weekSelfChange(before, after, personId) {
  if (!before) return false;
  var skip = { midweek: 1, weekend: 1 };
  var keys = Object.keys(before).concat(Object.keys(after));
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (skip[k]) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) return false;
  }
  var ok = true;
  ['midweek', 'weekend'].forEach(function (m) {
    var b = before[m] || { parts: [] }, a = after[m] || { parts: [] };
    var bMeta = Object.assign({}, b); delete bMeta.parts;
    var aMeta = Object.assign({}, a); delete aMeta.parts;
    if (JSON.stringify(bMeta) !== JSON.stringify(aMeta)) { ok = false; return; }
    if (b.parts.length !== a.parts.length) { ok = false; return; }
    for (var i = 0; i < b.parts.length; i++) {
      var bp = b.parts[i], ap = a.parts[i];
      if (bp.id !== ap.id) { ok = false; return; }
      var bRest = Object.assign({}, bp); delete bRest.status;
      var aRest = Object.assign({}, ap); delete aRest.status;
      if (JSON.stringify(bRest) !== JSON.stringify(aRest)) { ok = false; return; }
      if (bp.status !== ap.status) {
        var mine = bp.assigneeId === personId || bp.assistantId === personId;
        var allowedStatus = ['confirmed', 'declined'].indexOf(ap.status) !== -1;
        if (!mine || !allowedStatus) { ok = false; return; }
      }
    }
  });
  return ok;
}

/* Handing back a territory you hold. */
function territorySelfReturn(before, after, personId) {
  if (!before) return false;
  if (before.assigneeId !== personId) return false;
  if (after.assigneeId !== null && after.assigneeId !== undefined) return false;
  var frozen = ['id', 'congId', 'number', 'name', 'type', 'households', 'mapUrl', 'notes'];
  for (var i = 0; i < frozen.length; i++) {
    if (JSON.stringify(before[frozen[i]]) !== JSON.stringify(after[frozen[i]])) return false;
  }
  return true;
}

/* Your own record, contact details only. */
function personSelfEdit(before, after, personId) {
  if (!before || before.id !== personId) return false;
  var keys = Object.keys(before).concat(Object.keys(after));
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (SELF_FIELDS.indexOf(k) !== -1) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) return false;
  }
  return true;
}

/* change: {c, id, op, rec}. db is used to read the record as it stands now. */
function permit(db, personId, change) {
  var me = db.find('people', personId);
  if (!me) return deny('This account is not attached to a publisher record.');
  var c = change.c;
  if (!(c in WRITE)) return deny('Unknown collection “' + c + '”.');

  var isAdmin = rolesOf(me).indexOf('admin') !== -1;
  var before = change.op === 'del' || c === 'account' ? db.find(c, change.id) : db.find(c, change.id);
  var rec = change.rec;

  // stay inside your own congregation unless you administer the account
  if (!isAdmin && c !== 'account' && c !== 'congregations') {
    var congId = (rec && rec.congId) || (before && before.congId);
    if (congId && me.congId && congId !== me.congId) {
      return deny('That record belongs to another congregation.');
    }
  }

  if (can(me, WRITE[c])) {
    // an elder may not quietly grant themselves the administrator role
    if (c === 'people' && !isAdmin && rec && (rec.roles || []).indexOf('admin') !== -1) {
      var wasAdmin = before && (before.roles || []).indexOf('admin') !== -1;
      if (!wasAdmin) return deny('Only an account administrator can grant the administrator role.');
    }
    if (c === 'audit' && rec) rec.personId = personId;
    return ALLOW;
  }

  // ---- self-service exceptions ----
  if (change.op === 'del') return deny('You cannot delete records in “' + c + '”.');

  if (c === 'people' && personSelfEdit(before, rec, personId)) return ALLOW;
  if (c === 'reports' && rec.personId === personId) return ALLOW;
  if (c === 'weeks' && weekSelfChange(before, rec, personId)) return ALLOW;
  if (c === 'territories' && territorySelfReturn(before, rec, personId)) return ALLOW;

  return deny('Your roles do not allow changing “' + c + '”.');
}

module.exports = {
  permit: permit,
  can: can,
  rolesOf: rolesOf,
  WRITE: WRITE
};
