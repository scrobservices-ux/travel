/* Preparing for the circuit overseer's visit.
 *
 * The week goes well when the work was spread out beforehand and every brother
 * knew which piece was his and when it was wanted. So a visit is not one date in
 * a diary: it is a list of jobs, each with a name against it and a day by which
 * it should be done, counted back from the day he arrives.
 *
 * The list starts from the congregation's own template (Schema.COVISIT_TEMPLATE
 * until they change it). Everything can be re-dated, handed to somebody else,
 * added to or struck out — the app proposes, the body of elders decides. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store;
  var CO = {};

  /* Who normally carries a job. If nobody holds the role the item is left
     without a name, and the view says so rather than quietly dropping it. */
  CO.holderOf = function (role) {
    var people = Store.people().filter(function (p) {
      return (p.roles || []).indexOf(role) !== -1 && p.status !== 'inactive' && p.status !== 'moved';
    });
    if (!people.length) return null;
    return U.sortBy(people, function (p) { return p.lastName + p.firstName; })[0].id;
  };

  CO.dueOn = function (from, weeksBefore) {
    return U.addDays(from, -7 * (+weeksBefore || 0));
  };

  /* A fresh visit, with the template turned into dated jobs. */
  CO.build = function (opts) {
    var cong = Store.cong();
    var from = opts.from;
    var template = S.covisitTemplateFor(cong);
    return {
      id: U.uid('co'),
      congId: cong.id,
      from: from,
      to: opts.to || U.addDays(from, 5),
      coName: opts.coName || '',
      coWifeName: opts.coWifeName || '',
      talkTitle: opts.talkTitle || '',
      notes: opts.notes || '',
      closedAt: null,
      createdAt: Date.now(),
      tasks: template.map(function (t, i) {
        return {
          id: U.uid('cot'),
          key: t.key || ('item' + i),
          title: t.title,
          detail: t.detail || '',
          role: t.role || null,
          personId: CO.holderOf(t.role),
          weeksBefore: t.weeksBefore,
          dueOn: CO.dueOn(from, t.weeksBefore),
          doneAt: null,
          doneBy: null,
          note: ''
        };
      })
    };
  };

  /* When the dates move, every job that has not been done moves with them —
     one that is already finished keeps the day it was actually finished by. */
  CO.reschedule = function (visit, from, to) {
    visit.from = from;
    visit.to = to;
    (visit.tasks || []).forEach(function (t) {
      if (t.doneAt) return;
      if (t.weeksBefore == null) return;
      t.dueOn = CO.dueOn(from, t.weeksBefore);
    });
    return visit;
  };

  /* ---------- reading one ---------- */

  CO.all = function () { return Store.covisits(); };

  CO.next = function () {
    var today = U.today();
    var upcoming = CO.all().filter(function (v) { return !v.closedAt && v.to >= today; });
    return upcoming[0] || null;
  };

  CO.status = function (visit) {
    var today = U.today();
    if (!visit) return 'planned';
    if (visit.closedAt || visit.to < today) return 'done';
    if (visit.from <= today && today <= visit.to) return 'current';
    return 'planned';
  };

  CO.tasksFor = function (visit, personId) {
    return (visit.tasks || []).filter(function (t) { return t.personId === personId; });
  };

  /* Grouped the way a body of elders talks about it: eight weeks out, four
     weeks out, the week itself, afterwards. */
  CO.stages = function (visit) {
    var buckets = [
      { id: 'early', name: 'Well beforehand', sub: 'Five weeks or more', min: 5, max: 99 },
      { id: 'mid', name: 'A month out', sub: 'Three to four weeks', min: 3, max: 4 },
      { id: 'near', name: 'The fortnight before', sub: 'One to two weeks', min: 1, max: 2 },
      { id: 'week', name: 'The visit itself', sub: 'The week he is with us', min: 0, max: 0 },
      { id: 'after', name: 'Afterwards', sub: 'Once he has gone', min: -99, max: -1 }
    ];
    return buckets.map(function (b) {
      return Object.assign({}, b, {
        tasks: U.sortBy((visit.tasks || []).filter(function (t) {
          var w = +t.weeksBefore || 0;
          return w >= b.min && w <= b.max;
        }), function (t) { return t.dueOn; })
      });
    }).filter(function (b) { return b.tasks.length; });
  };

  CO.progress = function (visit) {
    var today = U.today();
    var tasks = (visit && visit.tasks) || [];
    var done = tasks.filter(function (t) { return !!t.doneAt; });
    var overdue = tasks.filter(function (t) { return !t.doneAt && t.dueOn < today; });
    var soon = tasks.filter(function (t) {
      return !t.doneAt && t.dueOn >= today && t.dueOn <= U.addDays(today, 7);
    });
    var unassigned = tasks.filter(function (t) { return !t.personId; });
    return {
      total: tasks.length,
      done: done.length,
      overdue: overdue.length,
      soon: soon.length,
      unassigned: unassigned.length,
      percent: tasks.length ? Math.round(done.length * 100 / tasks.length) : 0,
      overdueTasks: U.sortBy(overdue, function (t) { return t.dueOn; }),
      soonTasks: U.sortBy(soon, function (t) { return t.dueOn; })
    };
  };

  /* Who is carrying what, so the coordinator can see at a glance whether one
     brother has been given the lot. */
  CO.byPerson = function (visit) {
    var map = {};
    (visit.tasks || []).forEach(function (t) {
      var key = t.personId || 'unassigned';
      (map[key] = map[key] || []).push(t);
    });
    return Object.keys(map).map(function (id) {
      return {
        personId: id === 'unassigned' ? null : id,
        tasks: U.sortBy(map[id], function (t) { return t.dueOn; }),
        done: map[id].filter(function (t) { return !!t.doneAt; }).length
      };
    });
  };

  CO.taskState = function (task) {
    if (!task) return { id: 'open', name: 'To do', tone: '' };
    if (task.doneAt) return { id: 'done', name: 'Done', tone: 'success' };
    var today = U.today();
    if (task.dueOn < today) return { id: 'overdue', name: 'Overdue', tone: 'removed' };
    if (task.dueOn <= U.addDays(today, 7)) return { id: 'soon', name: 'This week', tone: 'warn' };
    return { id: 'open', name: 'To do', tone: '' };
  };

  global.CO = CO;
})(typeof window !== 'undefined' ? window : globalThis);
