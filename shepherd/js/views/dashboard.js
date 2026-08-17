/* Overview pages: the elders' congregation overview and the publisher home. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App, Sch = global.Scheduler;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  function nextMeetings() {
    var out = [];
    Store.weeks().forEach(function (w) {
      ['midweek', 'weekend'].forEach(function (m) {
        if (w[m].date >= U.today()) out.push({ week: w, meeting: m, date: w[m].date });
      });
    });
    return U.sortBy(out, function (r) { return r.date; }).slice(0, 2);
  }

  /* ---------- attention list ---------- */

  function attention() {
    var items = [];
    var lastPeriod = U.prevPeriod(U.period(U.today()));

    if (Auth.can('reports.review')) {
      var missing = Store.missingReports(lastPeriod);
      if (missing.length) {
        items.push({
          tone: 'warn', icon: 'report',
          title: U.plural(missing.length, 'field service report') + ' outstanding for ' + U.periodLabel(lastPeriod),
          body: missing.slice(0, 6).map(function (p) { return Store.name(p.id); }).join(', ') + (missing.length > 6 ? '…' : ''),
          action: ['Open reports', function () { App.go('reports'); }]
        });
      }
    }

    if (Auth.can('territories.view')) {
      var overdue = Store.overdueTerritories();
      if (overdue.length) {
        items.push({
          tone: 'danger', icon: 'map',
          title: U.plural(overdue.length, 'territory', 'territories') + ' overdue',
          body: overdue.slice(0, 5).map(function (t) {
            return t.number + ' (' + Store.name(t.assigneeId) + ', ' + Math.abs(U.diffDays(t.dueOn, U.today())) + ' days)';
          }).join(', '),
          action: ['Review territories', function () { App.go('territories'); }]
        });
      }
    }

    if (Auth.can('schedule.view')) {
      var gaps = [];
      Store.upcomingWeeks(4).forEach(function (w) {
        Store.allParts(w).forEach(function (row) {
          var t = S.partType(row.part.type);
          if (!row.part.assigneeId) gaps.push({ w: w, p: row.part });
          else if (t.assistant && !row.part.assistantId) gaps.push({ w: w, p: row.part });
        });
      });
      if (gaps.length) {
        items.push({
          tone: 'warn', icon: 'calendar',
          title: U.plural(gaps.length, 'assignment') + ' unfilled in the next four weeks',
          body: 'Earliest: ' + gaps[0].p.title + ' — week of ' + U.fmtWeek(gaps[0].w.weekStart),
          action: ['Open the schedule', function () { App.go('meetings'); }]
        });
      }
      var clashes = [];
      Store.upcomingWeeks(4).forEach(function (w) { clashes = clashes.concat(Sch.conflicts(w)); });
      if (clashes.length) {
        items.push({
          tone: 'danger', icon: 'warn',
          title: U.plural(clashes.length, 'scheduling clash', 'scheduling clashes'),
          body: clashes[0].message,
          action: ['Fix on the schedule', function () { App.go('meetings'); }]
        });
      }
    }

    if (Auth.can('tasks.view')) {
      var due = Store.tasks().filter(function (t) {
        return t.status !== 'done' && t.dueOn && t.dueOn <= U.addDays(U.today(), 7);
      });
      if (due.length) {
        items.push({
          tone: 'warn', icon: 'check',
          title: U.plural(due.length, 'task') + ' due within a week',
          body: due.slice(0, 4).map(function (t) { return t.title; }).join(' · '),
          action: ['Open the task board', function () { App.go('tasks'); }]
        });
      }
    }

    if (Auth.can('publishers.view')) {
      var quiet = Store.activePeople().filter(function (p) { return Store.inactiveMonths(p.id) >= 2; });
      if (quiet.length) {
        items.push({
          tone: 'neutral', icon: 'heart',
          title: U.plural(quiet.length, 'publisher') + ' have not reported for two months or more',
          body: quiet.slice(0, 6).map(function (p) { return Store.name(p.id); }).join(', '),
          action: ['Open publishers', function () { App.go('publishers'); }]
        });
      }
    }

    return items;
  }

  /* ---------- elders overview ---------- */

  Views.dashboard = {
    title: 'the congregation overview',
    render: function (root) {
      var cong = Store.cong();
      var lastPeriod = U.prevPeriod(U.period(U.today()));
      var sum = Store.reportSummary(lastPeriod);

      root.appendChild(UI.pageHead({
        title: cong.name,
        sub: [cong.number, cong.city, 'Circuit ' + cong.circuit].filter(Boolean).join(' · ')
          + ' — ' + U.fmtDate(U.today(), 'long'),
        actions: [
          Auth.can('schedule.edit') ? UI.btn('Schedule a week', { icon: 'calendar', onClick: function () { App.go('meetings'); } }) : null,
          Auth.can('tasks.edit') ? UI.btn('New task', { variant: 'primary', icon: 'plus', onClick: function () { Views.tasks.newTask(); } }) : null
        ].filter(Boolean)
      }));

      /* stats */
      var active = Store.activePeople().length;
      var attMid = Store.attendanceAverage(lastPeriod, 'midweek');
      var attWknd = Store.attendanceAverage(lastPeriod, 'weekend');
      root.appendChild(el('div.grid.c4', [
        UI.stat('Publishers', active, Store.people().length + ' on the roll'),
        UI.stat('Reports · ' + U.periodLabel(lastPeriod), sum.submitted + '/' + sum.expected,
          sum.submitted >= sum.expected ? 'All in' : (sum.expected - sum.submitted) + ' outstanding',
          sum.submitted >= sum.expected ? 'up' : 'down'),
        UI.stat('Pioneer hours', sum.pioneerHours, sum.regular + ' regular · ' + sum.auxiliary + ' auxiliary'),
        UI.stat('Average attendance', (attMid || '—') + ' / ' + (attWknd || '—'), 'Midweek / weekend')
      ]));

      /* attention */
      var att = attention();
      root.appendChild(UI.sectionTitle('Needs attention'));
      if (!att.length) {
        root.appendChild(UI.banner('success', 'Nothing outstanding', 'Reports are in, the schedule is filled and no territory is overdue.'));
      } else {
        var stack = el('div.stack');
        att.forEach(function (a) {
          stack.appendChild(UI.banner(a.tone, a.title, a.body,
            a.action ? UI.btn(a.action[0], { sm: true, onClick: a.action[1] }) : null));
        });
        root.appendChild(stack);
      }

      /* two columns */
      var cols = el('div.grid.c2', { style: 'margin-top:24px' });

      /* next meetings */
      var meetCard = el('div.stack');
      nextMeetings().forEach(function (nm) {
        var block = nm.week[nm.meeting];
        var name = cong.meetings[nm.meeting].name;
        var rows = block.parts.filter(function (p) {
          return ['chairman', 'treasures', 'cbs', 'public_talk', 'wt_study', 'living'].indexOf(p.type) !== -1;
        }).slice(0, 5);
        meetCard.appendChild(UI.card(name, [
          el('div.muted.small', { style: 'margin-top:-6px;margin-bottom:10px',
            text: U.fmtDate(block.date, 'long') + ' at ' + block.time }),
          el('div.stack', rows.map(function (p) {
            return el('div.row', [
              el('span.trunc', { style: 'flex:1', text: p.title }),
              p.assigneeId ? UI.person(p.assigneeId) : UI.lozenge('Unassigned', 'removed')
            ]);
          })),
          el('div', { style: 'margin-top:12px' },
            UI.btn('Open the week', { sm: true, variant: 'subtle', icon: 'chevronRight',
              onClick: function () { App.go('meetings', nm.week.weekStart); } }))
        ], { icon: nm.meeting === 'midweek' ? 'book' : 'people' }));
      });
      cols.appendChild(meetCard);

      /* right column: tasks + announcements */
      var right = el('div.stack');
      if (Auth.can('tasks.view')) {
        var open = U.sortBy(Store.tasks().filter(function (t) { return t.status !== 'done'; }),
          function (t) { return t.dueOn || '9999'; }).slice(0, 6);
        right.appendChild(UI.card("Open tasks for the body of elders", [
          open.length ? el('div.stack', open.map(function (t) {
            return el('div.row', [
              UI.statusLozenge(S.PRIORITIES, t.priority),
              el('a.trunc', { style: 'flex:1', href: App.href('tasks', t.id), text: t.title }),
              el('span.small.muted', { text: t.dueOn ? U.fmtDate(t.dueOn) : '—' }),
              UI.avatarGroup(t.assigneeIds, 3)
            ]);
          })) : el('div.muted', { text: 'No open tasks.' })
        ], { icon: 'check', action: UI.btn('All tasks', { sm: true, variant: 'subtle', onClick: function () { App.go('tasks'); } }) }));
      }

      var anns = U.sortBy(Store.announcements(), function (a) { return a.publishedAt; }, 'desc').slice(0, 3);
      right.appendChild(UI.card('Latest announcements', [
        anns.length ? el('div.stack', anns.map(function (a) {
          return el('div', [
            el('div.row', [a.pinned ? UI.lozenge('Pinned', 'inprogress') : null, el('strong', { text: a.title })]),
            el('div.small.muted', { text: U.relative(a.publishedAt) + ' · ' + Store.name(a.authorId) })
          ]);
        })) : el('div.muted', { text: 'Nothing posted yet.' })
      ], { icon: 'megaphone', action: UI.btn('All', { sm: true, variant: 'subtle', onClick: function () { App.go('announcements'); } }) }));

      cols.appendChild(right);
      root.appendChild(cols);

      /* workload fairness */
      if (Auth.can('schedule.view')) {
        root.appendChild(UI.sectionTitle('Assignment workload — last eight weeks'));
        var from = U.addDays(U.weekStart(U.today()), -56);
        var counts = Sch.workload(from, U.weekStart(U.today()));
        var rows = U.sortBy(Store.activePeople().map(function (p) {
          return { person: p, n: counts[p.id] || 0 };
        }), function (r) { return -r.n; });
        var max = Math.max(1, rows[0] ? rows[0].n : 1);
        root.appendChild(UI.table([
          { key: 'name', label: 'Publisher', render: function (r) { return UI.person(r.person.id, { sub: true }); },
            sort: function (r) { return r.person.lastName; } },
          { key: 'n', label: 'Assignments', num: true, sort: function (r) { return r.n; },
            render: function (r) { return String(r.n); } },
          { key: 'bar', label: '', render: function (r) {
            return el('div', { style: 'min-width:120px' }, UI.meter(r.n / max, r.n === 0 ? 'warn' : ''));
          } }
        ], rows.slice(0, 12), { empty: 'No assignments recorded yet.' }));
        root.appendChild(el('p.small.muted', { style: 'margin-top:8px',
          text: 'The scheduler prefers whoever has waited longest, so this list should stay reasonably level over a service year.' }));
      }
    }
  };

  /* ---------- publisher home ---------- */

  Views.home = {
    title: 'your home page',
    render: function (root) {
      var me = Auth.me();
      var cong = Store.cong();
      var mine = Store.assignmentsFor(me.id, { from: U.weekStart(U.today()) });
      var lastPeriod = U.prevPeriod(U.period(U.today()));
      var myReport = Store.report(me.id, lastPeriod);

      root.appendChild(UI.pageHead({
        title: 'Hello, ' + me.firstName,
        sub: cong.name + ' · ' + (Store.group(me.serviceGroupId) || {}).name
      }));

      if (!myReport) {
        root.appendChild(UI.banner('warn', 'Your ' + U.periodLabel(lastPeriod) + ' report has not been handed in',
          'It is due by the ' + cong.reportDueDay + 'th.',
          UI.btn('Submit it now', { sm: true, variant: 'primary', onClick: function () { App.go('my-report'); } })));
      }

      var next = mine.slice(0, 6);
      root.appendChild(UI.sectionTitle('My next assignments'));
      if (!next.length) {
        root.appendChild(UI.empty('Nothing scheduled', 'When an elder assigns you a part or a duty it appears here.'));
      } else {
        root.appendChild(UI.table([
          { key: 'date', label: 'Date', render: function (r) { return U.fmtDate(r.date, 'day'); } },
          { key: 'what', label: 'Assignment', render: function (r) {
            if (r.duty) return S.dutyType(r.duty.type).name;
            return r.part.title + (r.role === 'assistant' ? ' (assistant)' : '');
          } },
          { key: 'with', label: 'With', render: function (r) {
            if (r.duty) return el('span.muted', { text: '—' });
            var other = r.role === 'assistant' ? r.part.assigneeId : r.part.assistantId;
            return other ? UI.person(other) : el('span.muted', { text: '—' });
          } },
          { key: 'status', label: 'Status', render: function (r) {
            if (r.duty) return UI.lozenge('Scheduled', 'inprogress');
            return UI.statusLozenge(S.PART_STATUS, r.part.status);
          } },
          { key: 'actions', label: '', render: function (r) {
            if (r.duty || r.part.status === 'confirmed') return el('span');
            return UI.btn('Confirm', { sm: true, variant: 'primary', onClick: function () {
              Store.setPartStatus(r.part.id, 'confirmed');
              UI.flag('Confirmed', r.part.title, 'success');
            } });
          } }
        ], next));
      }

      var cols = el('div.grid.c2', { style: 'margin-top:24px' });

      var terr = Store.territories().filter(function (t) { return t.assigneeId === me.id; });
      cols.appendChild(UI.card('My territories', [
        terr.length ? el('div.stack', terr.map(function (t) {
          var overdue = Store.territoryStatus(t) === 'overdue';
          return el('div.row', [
            el('span', { style: 'flex:1', text: t.number + ' — ' + t.name }),
            UI.lozenge(overdue ? 'Overdue' : 'Due ' + U.fmtDate(t.dueOn), overdue ? 'removed' : '')
          ]);
        })) : el('div.muted', { text: 'None checked out.' })
      ], { icon: 'map', action: UI.btn('Open', { sm: true, variant: 'subtle', onClick: function () { App.go('my-territories'); } }) }));

      var anns = U.sortBy(Store.announcements(), function (a) { return a.publishedAt; }, 'desc').slice(0, 4);
      cols.appendChild(UI.card('Announcements', [
        anns.length ? el('div.stack', anns.map(function (a) {
          return el('div', [
            el('strong', { text: a.title }),
            el('div.small.muted', { text: U.relative(a.publishedAt) })
          ]);
        })) : el('div.muted', { text: 'Nothing posted yet.' })
      ], { icon: 'megaphone', action: UI.btn('All', { sm: true, variant: 'subtle', onClick: function () { App.go('announcements'); } }) }));

      root.appendChild(cols);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
