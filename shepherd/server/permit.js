/* Server-side authorisation.
 *
 * The browser hides what a person may not do; this decides what the server will
 * actually accept. It reads the arrangement the body of elders has set on their
 * own congregation (falling back to the default one), so changing who cares for
 * what in the interface changes what the server enforces too.
 *
 * A capability can be held for the whole congregation or only for the person's
 * own service group — a group overseer collecting his own group's reports, for
 * instance. Publishers additionally get four narrow self-service exceptions:
 * their own contact details, their own field service report, confirming or
 * declining their own assignment, and handing back a territory they hold. */
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
  documents: 'files.manage',
  cleaning: 'cleaning.manage',
  covisits: 'covisit.manage',
  users: 'admin.manage',
  account: 'admin.manage',
  audit: null            // anyone signed in may append their own entries
};

/* Collections whose records belong to one publisher, so a group-scoped grant can
   be checked: how to find the person a record is about. */
var SUBJECT = {
  people: function (rec) { return rec && rec.id; },
  reports: function (rec) { return rec && rec.personId; },
  visits: function (rec) { return rec && rec.personId; }
};

// fields a person may change on their own record
var SELF_FIELDS = ['phone', 'email', 'address', 'emergencyContact', 'unavailable'];

function rolesOf(person) {
  if (!person) return [];
  var roles = (person.roles || []).slice();
  if (roles.indexOf('publisher') === -1) roles.push('publisher');
  return roles;
}

/* 'all' | 'group' | 'none', from the congregation's own arrangement. */
function grant(db, person, capability) {
  var roles = rolesOf(person);
  if (roles.indexOf('admin') !== -1) return 'all';
  if (!capability) return 'all';
  if (capability === 'admin.manage') return 'none';
  var cong = person && db.find('congregations', person.congId);
  var matrix = S.matrixFor(cong);
  var best = 'none';
  for (var i = 0; i < roles.length; i++) {
    var g = S.grantFor(matrix, capability, roles[i]);
    if (g === 'all') return 'all';
    if (g === 'group') best = 'group';
  }
  return best;
}

function can(db, person, capability) {
  return grant(db, person, capability) !== 'none';
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

/* Ticking off the piece of the circuit overseer preparation that is yours.
   Nothing else about the visit may move — not the dates, not who else is doing
   what, not the wording of anyone's item. */
function covisitSelfTick(before, after, personId) {
  if (!before || !after) return false;
  var bMeta = Object.assign({}, before); delete bMeta.tasks;
  var aMeta = Object.assign({}, after); delete aMeta.tasks;
  if (JSON.stringify(bMeta) !== JSON.stringify(aMeta)) return false;
  var b = before.tasks || [], a = after.tasks || [];
  if (b.length !== a.length) return false;
  for (var i = 0; i < b.length; i++) {
    var bt = b[i], at = a[i];
    if (bt.id !== at.id) return false;
    var bRest = Object.assign({}, bt); delete bRest.doneAt; delete bRest.doneBy; delete bRest.note;
    var aRest = Object.assign({}, at); delete aRest.doneAt; delete aRest.doneBy; delete aRest.note;
    if (JSON.stringify(bRest) !== JSON.stringify(aRest)) return false;
    var changed = bt.doneAt !== at.doneAt || bt.doneBy !== at.doneBy || bt.note !== at.note;
    if (!changed) continue;
    if (bt.personId !== personId) return false;              // only your own item
    if (at.doneAt && at.doneBy !== personId) return false;    // and in your own name
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
  var before = db.find(c, change.id);
  var rec = change.rec;

  // stay inside your own congregation unless you administer the account
  if (!isAdmin && c !== 'account' && c !== 'congregations') {
    var congId = (rec && rec.congId) || (before && before.congId);
    if (congId && me.congId && congId !== me.congId) {
      return deny('That record belongs to another congregation.');
    }
  }

  var held = grant(db, me, WRITE[c]);
  if (held !== 'none') {
    // a grant narrowed to a service group only reaches that group's records
    if (held === 'group' && SUBJECT[c]) {
      var subjectId = SUBJECT[c](rec) || SUBJECT[c](before);
      var subject = subjectId && db.find('people', subjectId);
      if (!subject || subject.serviceGroupId !== me.serviceGroupId) {
        return deny('Your congregation has given you that only for your own service group.');
      }
    }
    // an elder may not quietly grant themselves the administrator role
    if (c === 'people' && !isAdmin && rec && (rec.roles || []).indexOf('admin') !== -1) {
      var wasAdmin = before && (before.roles || []).indexOf('admin') !== -1;
      if (!wasAdmin) return deny('Only an account administrator can grant the administrator role.');
    }
    // nor rewrite who is allowed to do what — that is the congregation's arrangement
    if (c === 'congregations' && !isAdmin) {
      return deny('Only an account administrator can change congregation settings.');
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
  if (c === 'covisits' && can(db, me, 'covisit.view') && covisitSelfTick(before, rec, personId)) return ALLOW;

  return deny('Your roles do not allow changing “' + c + '”.');
}

module.exports = {
  permit: permit,
  can: can,
  grant: grant,
  rolesOf: rolesOf,
  WRITE: WRITE
};
