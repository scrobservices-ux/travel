/* State: one JSON document in localStorage, an audit trail, and selectors.
   Every mutation goes through Store.update() so persistence, the audit log and
   re-rendering can never drift apart. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema;
  var KEY = 'shepherd.state.v1';

  var Store = {
    state: null,
    listeners: [],
    ready: false
  };

  /* ---------- lifecycle ---------- */

  Store.init = function () {
    var raw = null;
    try { raw = global.localStorage && localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        Store.state = migrate(parsed);
      } catch (e) {
        console.warn('Stored data unreadable, starting from the demo congregation.', e);
        Store.state = global.Seed.build();
      }
    } else {
      Store.state = global.Seed.build();
    }
    Store.ready = true;
    Store.persist();
    return Store.state;
  };

  function migrate(state) {
    if (!state || typeof state !== 'object') return global.Seed.build();
    state.version = state.version || 1;
    // forward-compatible defaults for documents written by older versions
    ['people', 'groups', 'weeks', 'duties', 'territories', 'reports', 'attendance',
      'tasks', 'visits', 'transactions', 'announcements', 'users', 'audit'].forEach(function (k) {
      if (!Array.isArray(state[k])) state[k] = [];
    });
    if (!Array.isArray(state.congregations) || !state.congregations.length) {
      state.congregations = [global.Seed.empty('My Congregation')];
    }
    state.congregations.forEach(function (c) {
      c.meetings = c.meetings || { midweek: { dow: 4, time: '19:00', name: 'Life and Ministry Meeting' },
        weekend: { dow: 0, time: '10:00', name: 'Public Talk and Watchtower Study' } };
      c.subscription = c.subscription || { plan: 'free', status: 'active', seats: 0 };
      c.programSource = c.programSource || { mode: 'manual', endpoint: '', acknowledged: false, lastImportedAt: null };
      if (!c.currency) c.currency = '£';
      if (c.reportDueDay == null) c.reportDueDay = 6;
    });
    state.session = state.session || {};
    if (!state.session.congId) state.session.congId = state.congregations[0].id;
    if (!state.session.workspace) state.session.workspace = 'elders';
    if (!state.session.theme) state.session.theme = 'light';
    state.account = state.account || { name: 'My account', plan: 'free', createdAt: Date.now() };
    state.version = S.VERSION;
    return state;
  }

  Store.persist = function () {
    try {
      localStorage.setItem(KEY, JSON.stringify(Store.state));
      return true;
    } catch (e) {
      console.warn('Could not save to this browser.', e);
      return false;
    }
  };

  Store.subscribe = function (fn) {
    Store.listeners.push(fn);
    return function () {
      Store.listeners = Store.listeners.filter(function (f) { return f !== fn; });
    };
  };

  Store.emit = function () {
    Store.listeners.forEach(function (fn) {
      try { fn(Store.state); } catch (e) { console.error(e); }
    });
  };

  /* mutate + persist + audit + notify, in one place */
  Store.update = function (audit, fn) {
    if (typeof audit === 'function') { fn = audit; audit = null; }
    var result = fn(Store.state);
    if (audit) Store.log(audit.action, audit.summary, audit.entityId);
    Store.persist();
    Store.emit();
    return result;
  };

  Store.log = function (action, summary, entityId) {
    Store.state.audit.unshift({
      id: U.uid('a'),
      at: Date.now(),
      personId: Store.state.session.personId,
      congId: Store.state.session.congId,
      action: action,
      summary: summary,
      entityId: entityId || null
    });
    if (Store.state.audit.length > 500) Store.state.audit.length = 500;
  };

  /* ---------- congregation scope ---------- */

  Store.cong = function () {
    return U.by(Store.state.congregations, Store.state.session.congId) || Store.state.congregations[0];
  };
  Store.congId = function () { return Store.cong().id; };
  Store.setCong = function (id) {
    Store.update(function (st) { st.session.congId = id; });
  };

  function scoped(key) {
    var cid = Store.congId();
    return Store.state[key].filter(function (r) { return r.congId === cid; });
  }

  Store.people = function () { return scoped('people'); };
  Store.groups = function () { return scoped('groups'); };
  Store.weeks = function () { return U.sortBy(scoped('weeks'), function (w) { return w.weekStart; }); };
  Store.duties = function () { return scoped('duties'); };
  Store.territories = function () { return scoped('territories'); };
  Store.reports = function () { return scoped('reports'); };
  Store.attendance = function () { return scoped('attendance'); };
  Store.tasks = function () { return scoped('tasks'); };
  Store.visits = function () { return scoped('visits'); };
  Store.transactions = function () { return scoped('transactions'); };
  Store.announcements = function () { return scoped('announcements'); };

  Store.person = function (id) { return U.by(Store.state.people, id); };
  Store.name = function (id, style) {
    var p = Store.person(id);
    if (!p) return '—';
    if (style === 'short') return p.firstName + ' ' + p.lastName[0] + '.';
    if (style === 'last') return p.lastName + ', ' + p.firstName;
    return p.firstName + ' ' + p.lastName;
  };
  Store.group = function (id) { return U.by(Store.state.groups, id); };
  Store.me = function () { return Store.person(Store.state.session.personId); };

  Store.activePeople = function () {
    return Store.people().filter(function (p) { return p.status === 'active' || p.status === 'irregular'; });
  };

  /* ---------- weeks ---------- */

  Store.week = function (weekStartIso) {
    var cid = Store.congId();
    return Store.state.weeks.filter(function (w) {
      return w.congId === cid && w.weekStart === weekStartIso;
    })[0] || null;
  };

  Store.ensureWeek = function (weekStartIso) {
    var w = Store.week(weekStartIso);
    if (w) return w;
    var cong = Store.cong();
    w = global.Program.buildWeek(cong, weekStartIso);
    Store.update(function (st) { st.weeks.push(w); });
    return w;
  };

  // Ensures a contiguous run of weeks exists around today.
  Store.ensureWindow = function (backWeeks, forwardWeeks) {
    var start = U.addDays(U.weekStart(U.today()), -7 * (backWeeks || 4));
    var made = 0;
    for (var i = 0; i <= (backWeeks || 4) + (forwardWeeks || 8); i++) {
      var ws = U.addDays(start, i * 7);
      if (!Store.week(ws)) { Store.ensureWeek(ws); made++; }
    }
    return made;
  };

  Store.upcomingWeeks = function (n) {
    var from = U.weekStart(U.today());
    return Store.weeks().filter(function (w) { return w.weekStart >= from; }).slice(0, n || 8);
  };

  Store.allParts = function (week) {
    return week.midweek.parts.map(function (p) { return { part: p, meeting: 'midweek', week: week }; })
      .concat(week.weekend.parts.map(function (p) { return { part: p, meeting: 'weekend', week: week }; }));
  };

  Store.findPart = function (partId) {
    var weeks = Store.weeks();
    for (var i = 0; i < weeks.length; i++) {
      var all = Store.allParts(weeks[i]);
      for (var j = 0; j < all.length; j++) {
        if (all[j].part.id === partId) return all[j];
      }
    }
    return null;
  };

  Store.setAssignment = function (partId, field, personId) {
    var found = Store.findPart(partId);
    if (!found) return null;
    Store.update({
      action: 'assignment.set',
      summary: (personId ? Store.name(personId) : 'Cleared') + ' — ' + found.part.title + ' (' + U.fmtWeek(found.week.weekStart) + ')',
      entityId: partId
    }, function () {
      found.part[field] = personId || null;
      if (field === 'assigneeId') {
        found.part.status = personId ? (found.part.status === 'unassigned' ? 'proposed' : found.part.status) : 'unassigned';
      }
    });
    return found.part;
  };

  Store.setPartStatus = function (partId, status) {
    var found = Store.findPart(partId);
    if (!found) return null;
    Store.update({ action: 'assignment.status', summary: found.part.title + ' → ' + status, entityId: partId },
      function () { found.part.status = status; });
    return found.part;
  };

  /* ---------- assignments for one person ---------- */

  Store.assignmentsFor = function (personId, opts) {
    opts = opts || {};
    var out = [];
    Store.weeks().forEach(function (w) {
      if (opts.from && w.weekStart < opts.from) return;
      if (opts.to && w.weekStart > opts.to) return;
      Store.allParts(w).forEach(function (row) {
        var p = row.part;
        var role = null;
        if (p.assigneeId === personId) role = 'main';
        else if (p.assistantId === personId) role = 'assistant';
        if (!role) return;
        out.push({
          weekStart: w.weekStart,
          date: row.meeting === 'midweek' ? w.midweek.date : w.weekend.date,
          meeting: row.meeting,
          part: p,
          role: role
        });
      });
    });
    Store.duties().forEach(function (d) {
      if (d.personId !== personId) return;
      if (opts.from && d.date < opts.from) return;
      if (opts.to && d.date > U.addDays(opts.to, 6)) return;
      out.push({ weekStart: U.weekStart(d.date), date: d.date, meeting: d.meeting, duty: d, role: 'duty' });
    });
    return U.sortBy(out, function (r) { return r.date; });
  };

  Store.lastAssignedAt = function (personId, typeId) {
    var latest = null;
    Store.weeks().forEach(function (w) {
      Store.allParts(w).forEach(function (row) {
        var p = row.part;
        if (p.assigneeId !== personId && p.assistantId !== personId) return;
        if (typeId && p.type !== typeId) return;
        var d = row.meeting === 'midweek' ? w.midweek.date : w.weekend.date;
        if (!latest || d > latest) latest = d;
      });
    });
    return latest;
  };

  Store.assignmentCountInWeek = function (personId, weekStart) {
    var w = Store.week(weekStart);
    if (!w) return 0;
    return Store.allParts(w).filter(function (row) {
      return row.part.assigneeId === personId || row.part.assistantId === personId;
    }).length + Store.duties().filter(function (d) {
      return d.personId === personId && U.weekStart(d.date) === weekStart;
    }).length;
  };

  Store.isAway = function (personId, dateIso) {
    var p = Store.person(personId);
    if (!p || !p.unavailable) return null;
    for (var i = 0; i < p.unavailable.length; i++) {
      var u = p.unavailable[i];
      if (dateIso >= u.from && dateIso <= u.to) return u;
    }
    return null;
  };

  /* ---------- reports ---------- */

  Store.report = function (personId, period) {
    var cid = Store.congId();
    return Store.state.reports.filter(function (r) {
      return r.congId === cid && r.personId === personId && r.period === period;
    })[0] || null;
  };

  Store.saveReport = function (personId, period, data) {
    var existing = Store.report(personId, period);
    return Store.update({
      action: existing ? 'report.updated' : 'report.submitted',
      summary: Store.name(personId) + ' — ' + U.periodLabel(period),
      entityId: personId
    }, function (st) {
      if (existing) {
        Object.keys(data).forEach(function (k) { existing[k] = data[k]; });
        existing.submittedAt = existing.submittedAt || Date.now();
        return existing;
      }
      var rep = {
        id: U.uid('rep'), congId: Store.congId(), personId: personId, period: period,
        shared: !!data.shared, studies: data.studies || 0, hours: data.hours == null ? null : data.hours,
        credit: data.credit || 0, comments: data.comments || '',
        submittedAt: Date.now(), submittedBy: st.session.personId, acceptedAt: null
      };
      st.reports.push(rep);
      return rep;
    });
  };

  Store.missingReports = function (period) {
    return Store.activePeople().filter(function (p) { return !Store.report(p.id, period); });
  };

  Store.reportSummary = function (period) {
    var reps = Store.reports().filter(function (r) { return r.period === period; });
    var shared = reps.filter(function (r) { return r.shared; });
    var pioneers = shared.filter(function (r) {
      var p = Store.person(r.personId);
      return p && (p.publisherType === 'regular' || p.publisherType === 'auxiliary' || p.publisherType === 'special');
    });
    return {
      period: period,
      submitted: reps.length,
      expected: Store.activePeople().length,
      publishers: shared.length,
      studies: U.sum(shared, function (r) { return r.studies || 0; }),
      pioneerHours: U.sum(pioneers, function (r) { return r.hours || 0; }),
      auxiliary: pioneers.filter(function (r) { return Store.person(r.personId).publisherType === 'auxiliary'; }).length,
      regular: pioneers.filter(function (r) { return Store.person(r.personId).publisherType === 'regular'; }).length
    };
  };

  /* months a publisher has not reported, most recent first */
  Store.inactiveMonths = function (personId) {
    var p = U.period(U.today()), n = 0;
    for (var i = 0; i < 24; i++) {
      p = U.prevPeriod(p);
      var r = Store.report(personId, p);
      if (r && r.shared) break;
      n++;
    }
    return n;
  };

  /* ---------- territories ---------- */

  Store.territoryStatus = function (t) {
    if (t.status === 'do_not_call') return 'do_not_call';
    if (t.assigneeId && t.dueOn && t.dueOn < U.today()) return 'overdue';
    if (t.assigneeId) return 'out';
    return 'available';
  };
  Store.overdueTerritories = function () {
    return Store.territories().filter(function (t) { return Store.territoryStatus(t) === 'overdue'; });
  };

  /* ---------- attendance ---------- */

  Store.attendanceAverage = function (period, meeting) {
    var rows = Store.attendance().filter(function (a) {
      return U.period(a.date) === period && (!meeting || a.meeting === meeting);
    });
    if (!rows.length) return null;
    return Math.round(U.sum(rows, function (r) { return r.count; }) / rows.length);
  };

  /* ---------- accounts ---------- */

  Store.accountsSummary = function (period) {
    var rows = Store.transactions().filter(function (t) { return t.period === period; });
    var income = U.sum(rows.filter(function (t) { return t.kind === 'income'; }), function (t) { return t.amount; });
    var expense = U.sum(rows.filter(function (t) { return t.kind === 'expense'; }), function (t) { return t.amount; });
    var priorRows = Store.transactions().filter(function (t) { return t.period < period; });
    var opening = U.sum(priorRows.filter(function (t) { return t.kind === 'income'; }), function (t) { return t.amount; })
      - U.sum(priorRows.filter(function (t) { return t.kind === 'expense'; }), function (t) { return t.amount; });
    return { period: period, opening: opening, income: income, expense: expense, closing: opening + income - expense, rows: rows };
  };

  /* ---------- data portability ---------- */

  Store.exportAll = function () {
    return JSON.stringify(Store.state, null, 2);
  };

  Store.importAll = function (json) {
    var data = JSON.parse(json);
    Store.state = migrate(data);
    Store.log('data.imported', 'Full account data replaced by import');
    Store.persist();
    Store.emit();
  };

  Store.resetDemo = function () {
    Store.state = global.Seed.build();
    Store.persist();
    Store.emit();
  };

  Store.resetBlank = function () {
    Store.state = global.Seed.blankState();
    Store.persist();
    Store.emit();
  };

  global.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
