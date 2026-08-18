/* Keeping the Kingdom Hall clean.
 *
 * Two arrangements, and most congregations run both:
 *
 *   the group's turn   — one service group stays behind after a meeting. The
 *                        rota is a plain rotation, so every group comes round in
 *                        the same order and nobody is passed over.
 *   general cleaning   — once a month the whole congregation is invited, usually
 *                        a Saturday morning.
 *
 * Nothing here is compulsory: a body of elders can set a week by hand, swap two
 * groups over, or skip a week entirely, and the rotation carries on from
 * whatever it finds. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store;
  var Clean = {};

  Clean.settings = function () { return S.cleaningFor(Store.cong()); };

  /* The groups in a settled order, so the rotation is the same on every device. */
  function groupsInOrder() {
    return U.sortBy(Store.groups(), function (g) { return g.name || ''; });
  }
  Clean.groupsInOrder = groupsInOrder;

  /* Which meetings a group stays behind after, as dates in a week record. */
  function meetingDates(week, set) {
    var out = [];
    if (!week) return out;
    if (set.after === 'midweek' || set.after === 'both') {
      if (week.midweek && !week.midweek.cancelled) {
        out.push({ date: week.midweek.date, time: week.midweek.time, meeting: 'midweek' });
      }
    }
    if (set.after === 'weekend' || set.after === 'both') {
      if (week.weekend && !week.weekend.cancelled) {
        out.push({ date: week.weekend.date, time: week.weekend.time, meeting: 'weekend' });
      }
    }
    return out;
  }

  /* The date of, say, the last Saturday of a month. Returns null when the
     congregation has turned general cleaning off. */
  Clean.generalDate = function (period, set) {
    set = set || Clean.settings();
    if (!set.generalWeek || set.generalWeek === 'none') return null;
    var first = period + '-01';
    var target = +set.generalDay;
    var days = [];
    var d = first;
    while (U.period(d) === period) {
      if (U.dow(d) === target) days.push(d);
      d = U.addDays(d, 1);
    }
    if (!days.length) return null;
    var index = { first: 0, second: 1, third: 2, fourth: 3 }[set.generalWeek];
    if (index == null) return days[days.length - 1];       // 'last'
    return days[index] || days[days.length - 1];
  };

  /* ---------- reading the rota ---------- */

  Clean.between = function (from, to) {
    return Store.cleaning().filter(function (c) { return c.date >= from && c.date <= to; });
  };

  Clean.on = function (date) {
    return Store.cleaning().filter(function (c) { return c.date === date; });
  };

  /* Everything a person is expected at: their group's turns, and every general
     cleaning, because that one is for the whole congregation. */
  Clean.forPerson = function (person, from, to) {
    if (!person) return [];
    return Clean.between(from || U.today(), to || U.addDays(U.today(), 120)).filter(function (c) {
      if (c.kind === 'general') return true;
      return (c.groupIds || []).indexOf(person.serviceGroupId) !== -1;
    });
  };

  /* Who is expected at one turn — for the reminder, and for the elders to see. */
  Clean.peopleFor = function (item) {
    var people = Store.people().filter(function (p) {
      return p.status !== 'inactive' && p.status !== 'moved' && p.status !== 'deceased';
    });
    if (!item) return [];
    if (item.kind === 'general') return people;
    return people.filter(function (p) {
      return (item.groupIds || []).indexOf(p.serviceGroupId) !== -1;
    });
  };

  Clean.label = function (item) {
    if (!item) return '';
    if (item.kind === 'general') return 'General cleaning';
    var names = (item.groupIds || []).map(function (id) {
      var g = Store.group(id);
      return g ? g.name : 'a group';
    });
    return names.length ? names.join(' and ') : 'Cleaning';
  };

  /* ---------- planning ahead ---------- */

  /* Where the rotation has got to: the group that went most recently, so the
     next turn goes to the one after it. Anything set by hand counts, which is
     what makes a manual swap stick. */
  function lastGroupIndex(order, beforeDate) {
    var past = Store.cleaning().filter(function (c) {
      return c.kind === 'group' && c.date < beforeDate && (c.groupIds || []).length;
    });
    if (!past.length) return -1;
    var latest = past[past.length - 1];
    var lastId = latest.groupIds[latest.groupIds.length - 1];
    for (var i = 0; i < order.length; i++) if (order[i].id === lastId) return i;
    return -1;
  }

  /* Proposes the turns for a stretch of weeks without saving anything.
     Returns {items: [...], skipped: [{date, reason}]}. */
  Clean.plan = function (fromWeek, weeks) {
    var set = Clean.settings();
    var order = groupsInOrder();
    var congId = Store.congId();
    var start = U.weekStart(fromWeek || U.today());
    var end = U.addDays(start, weeks * 7 - 1);
    var items = [], skipped = [];

    if (!order.length) {
      return { items: [], skipped: [{ date: start, reason: 'There are no service groups yet.' }] };
    }

    var cursor = lastGroupIndex(order, start);
    var taken = {};
    Clean.between(start, end).forEach(function (c) { taken[c.kind + '|' + c.date] = true; });

    // the group's turn, one meeting at a time
    Store.weeks().filter(function (w) {
      return w.weekStart >= start && w.weekStart <= end;
    }).forEach(function (w) {
      meetingDates(w, set).forEach(function (m) {
        if (taken['group|' + m.date]) { skipped.push({ date: m.date, reason: 'Already on the rota.' }); return; }
        var picked = [];
        for (var n = 0; n < Math.max(1, set.groupsPerTurn); n++) {
          cursor = (cursor + 1) % order.length;
          picked.push(order[cursor].id);
        }
        items.push({
          id: U.uid('cln'), congId: congId, date: m.date, kind: 'group',
          groupIds: picked, meeting: m.meeting, time: m.time || '',
          notes: '', doneAt: null, doneBy: null, createdAt: Date.now()
        });
      });
    });

    // the monthly general cleaning
    var period = U.period(start), lastPeriod = U.period(end);
    for (var guard = 0; guard < 24; guard++) {
      var date = Clean.generalDate(period, set);
      if (date && date >= start && date <= end && !taken['general|' + date]) {
        items.push({
          id: U.uid('cln'), congId: congId, date: date, kind: 'general',
          groupIds: [], meeting: null, time: set.generalTime || '09:00',
          minutes: set.generalMinutes || 180,
          notes: '', doneAt: null, doneBy: null, createdAt: Date.now()
        });
      }
      if (period === lastPeriod) break;
      period = U.nextPeriod(period);
    }

    items = U.sortBy(items, function (i) { return i.date + (i.kind === 'general' ? 'b' : 'a'); });
    return { items: items, skipped: skipped };
  };

  /* How evenly the groups have been used — the same question the fairness page
     asks about meeting parts, because "our group is always on" is a real one. */
  Clean.balance = function (from, to) {
    var counts = {};
    groupsInOrder().forEach(function (g) { counts[g.id] = { group: g, turns: 0, last: null }; });
    Clean.between(from || U.addDays(U.today(), -365), to || U.today()).forEach(function (c) {
      if (c.kind !== 'group') return;
      (c.groupIds || []).forEach(function (id) {
        if (!counts[id]) return;
        counts[id].turns += 1;
        if (!counts[id].last || c.date > counts[id].last) counts[id].last = c.date;
      });
    });
    return Object.keys(counts).map(function (id) { return counts[id]; });
  };

  global.Clean = Clean;
})(typeof window !== 'undefined' ? window : globalThis);
