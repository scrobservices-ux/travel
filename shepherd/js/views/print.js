/* Print & PDF centre.
 *
 * Builds real documents — the meeting schedule for the board, assignment slips to
 * hand out, the duty rota, publisher record cards, the territory register, the
 * monthly reports — laid out on paper-sized sheets. Print sends them to a printer;
 * choosing "Save as PDF" in the same dialog writes a PDF file. Nothing is uploaded
 * anywhere to make one. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var state = { doc: 'schedule', weeks: 4, period: null, paper: 'A4', personId: '' };
  function period() { return state.period || U.prevPeriod(U.period(U.today())); }

  /* ---------- sheet helpers ---------- */

  function sheet(children) { return el('section.sheet', children); }

  function sheetHead(title, sub) {
    var cong = Store.cong();
    return el('header.sheet-head', [
      el('div', [
        el('h1', { text: title }),
        sub ? el('div.sheet-sub', { text: sub }) : null
      ]),
      el('div.sheet-org', [
        el('div', { text: cong.name }),
        el('div.small', { text: [cong.number, cong.city].filter(Boolean).join(' · ') })
      ])
    ]);
  }

  function sheetFoot(note) {
    return el('footer.sheet-foot', {
      text: (note ? note + ' · ' : '') + 'Prepared ' + U.fmtDate(U.today(), 'long')
    });
  }

  function pTable(columns, rows) {
    var t = el('table.p-tbl');
    t.appendChild(el('thead', el('tr', columns.map(function (c) {
      return el('th' + (c.num ? '.num' : ''), { style: c.width ? 'width:' + c.width : null, text: c.label });
    }))));
    var body = el('tbody');
    rows.forEach(function (r) {
      body.appendChild(el('tr', columns.map(function (c) {
        var v = c.render ? c.render(r) : r[c.key];
        return el('td' + (c.num ? '.num' : ''), v instanceof Node ? v : (v == null || v === '' ? '—' : String(v)));
      })));
    });
    t.appendChild(body);
    return t;
  }

  function nameOf(id) { return id ? Store.name(id) : '—'; }

  /* ---------- documents ---------- */

  var DOCS = {

    /* the week-by-week programme for the information board */
    schedule: {
      name: 'Meeting schedule',
      hint: 'Both meetings, every part and who has it — the sheet for the board.',
      options: ['weeks'],
      build: function () {
        var cong = Store.cong();
        var weeks = Store.weeks().filter(function (w) { return w.weekStart >= U.weekStart(U.today()); })
          .slice(0, state.weeks);
        if (!weeks.length) return [sheet([sheetHead('Meeting schedule'), el('p', { text: 'No weeks scheduled yet.' })])];
        return weeks.map(function (w) {
          var body = [sheetHead('Week of ' + U.fmtWeek(w.weekStart),
            w.bibleReading ? 'Bible reading: ' + w.bibleReading : null)];
          ['midweek', 'weekend'].forEach(function (m) {
            var block = w[m];
            body.push(el('h2.p-h2', { text: cong.meetings[m].name + ' — ' + U.fmtDate(block.date, 'long') + ', ' + block.time }));
            if (block.cancelled) {
              body.push(el('p.p-note', { text: 'No meeting this week' + (block.note ? ' — ' + block.note : '.') }));
              return;
            }
            var lastSection = null;
            var rows = el('div.p-parts');
            block.parts.forEach(function (p) {
              if (p.section !== lastSection) {
                rows.appendChild(el('div.p-section', { text: S.section(p.section).name }));
                lastSection = p.section;
              }
              rows.appendChild(el('div.p-part', [
                el('span.p-min', { text: p.minutes ? p.minutes + ' min' : '' }),
                el('span.p-title', [
                  document.createTextNode(p.title),
                  p.source ? el('span.p-src', { text: '  ' + p.source }) : null
                ]),
                el('span.p-who', {
                  text: nameOf(p.assigneeId) + (p.assistantId ? ' / ' + nameOf(p.assistantId) : '')
                })
              ]));
            });
            body.push(rows);
          });
          body.push(sheetFoot());
          return sheet(body);
        });
      }
    },

    /* one slip per assignment, to hand to the publisher */
    slips: {
      name: 'Assignment slips',
      hint: 'A slip per assignment to hand out — part, date, setting and any note.',
      options: ['weeks'],
      build: function () {
        var cong = Store.cong();
        var horizon = U.addDays(U.weekStart(U.today()), state.weeks * 7);
        var slips = [];
        Store.weeks().forEach(function (w) {
          if (w.weekStart < U.weekStart(U.today()) || w.weekStart >= horizon) return;
          Store.allParts(w).forEach(function (row) {
            var p = row.part;
            if (!p.assigneeId) return;
            if (['chairman', 'opening_song', 'closing_song', 'opening_words', 'concluding'].indexOf(p.type) !== -1
              && p.type !== 'chairman') return;
            var block = row.meeting === 'midweek' ? w.midweek : w.weekend;
            slips.push({ part: p, date: block.date, time: block.time, meeting: row.meeting, who: p.assigneeId, assist: p.assistantId });
            if (p.assistantId) {
              slips.push({ part: p, date: block.date, time: block.time, meeting: row.meeting, who: p.assistantId, assist: p.assigneeId, isAssistant: true });
            }
          });
        });
        slips = U.sortBy(slips, function (s) { return s.date + Store.name(s.who, 'last'); });
        if (!slips.length) return [sheet([sheetHead('Assignment slips'), el('p', { text: 'Nothing assigned in this period.' })])];

        var pages = [], perPage = 6;
        for (var i = 0; i < slips.length; i += perPage) {
          var grid = el('div.p-slips');
          slips.slice(i, i + perPage).forEach(function (s) {
            grid.appendChild(el('div.p-slip', [
              el('div.p-slip-h', [
                el('strong', { text: Store.cong().name }),
                el('span', { text: cong.meetings[s.meeting].name })
              ]),
              el('div.p-slip-name', { text: Store.name(s.who) }),
              el('dl.p-slip-kv', [
                el('dt', { text: 'Assignment' }),
                el('dd', { text: s.part.title + (s.isAssistant ? ' (assistant)' : '') }),
                el('dt', { text: 'Date' }),
                el('dd', { text: U.fmtDate(s.date, 'long') + ' at ' + s.time }),
                s.assist ? el('dt', { text: s.isAssistant ? 'Assisting' : 'Assistant' }) : null,
                s.assist ? el('dd', { text: Store.name(s.assist) }) : null,
                s.part.source ? el('dt', { text: 'Setting' }) : null,
                s.part.source ? el('dd', { text: s.part.source }) : null,
                s.part.minutes ? el('dt', { text: 'Time' }) : null,
                s.part.minutes ? el('dd', { text: s.part.minutes + ' minutes' }) : null
              ]),
              s.part.notes ? el('div.p-slip-note', { text: s.part.notes }) : null,
              el('div.p-slip-foot', { text: 'Please be ready a little early and let an elder know if you cannot care for it.' })
            ]));
          });
          pages.push(sheet([grid]));
        }
        return pages;
      }
    },

    rota: {
      name: 'Duty rota',
      hint: 'Attendants, audio/video, microphones, platform and cleaning.',
      options: ['weeks'],
      build: function () {
        var all = S.dutyTypesFor(Store.cong());
        var types = all.filter(function (dt) {
          return Store.duties().some(function (d) { return d.type === dt.id; });
        });
        if (!types.length) types = all.slice(0, 6);
        var rows = [];
        Store.weeks().filter(function (w) { return w.weekStart >= U.weekStart(U.today()); })
          .slice(0, state.weeks).forEach(function (w) {
            ['midweek', 'weekend'].forEach(function (m) {
              if (w[m].cancelled) return;
              rows.push({ date: w[m].date, meeting: m });
            });
          });
        rows = U.sortBy(rows, function (r) { return r.date; });
        var columns = [{ key: 'date', label: 'Meeting', width: '20%', render: function (r) {
          return U.fmtDate(r.date, 'day') + ' — ' + (r.meeting === 'midweek' ? 'midweek' : 'weekend');
        } }].concat(types.map(function (dt) {
          return { key: dt.id, label: dt.name, render: function (r) {
            var d = Store.duties().filter(function (x) { return x.date === r.date && x.type === dt.id; })[0];
            if (!d) return '';
            return d.personId ? Store.name(d.personId) : (Store.group(d.groupId) || {}).name || '';
          } };
        }));
        return [sheet([
          sheetHead('Duty rota', 'Next ' + state.weeks + ' weeks'),
          pTable(columns, rows),
          sheetFoot()
        ])];
      }
    },

    publishers: {
      name: 'Publisher list',
      hint: 'Contact list by service group.',
      options: [],
      build: function () {
        var pages = [];
        Store.groups().forEach(function (g) {
          var members = U.sortBy(Store.people().filter(function (p) { return p.serviceGroupId === g.id; }),
            function (p) { return p.lastName; });
          if (!members.length) return;
          pages.push(sheet([
            sheetHead(g.name, (g.overseerId ? 'Overseer: ' + Store.name(g.overseerId) : '')
              + (g.assistantId ? ' · Assistant: ' + Store.name(g.assistantId) : '')),
            pTable([
              { key: 'name', label: 'Name', width: '26%', render: function (p) { return Store.name(p.id, 'last'); } },
              { key: 'type', label: 'Type', width: '12%', render: function (p) {
                return (S.PUBLISHER_TYPES.filter(function (t) { return t.id === p.publisherType; })[0] || {}).short;
              } },
              { key: 'phone', label: 'Phone', width: '18%' },
              { key: 'email', label: 'Email', width: '24%' },
              { key: 'address', label: 'Address' }
            ], members),
            sheetFoot('Confidential — congregation use only')
          ]));
        });
        if (!pages.length) pages.push(sheet([sheetHead('Publisher list'), el('p', { text: 'No publishers on the roll yet.' })]));
        return pages;
      }
    },

    /* the service-year record card, one publisher per block */
    records: {
      name: 'Publisher record cards',
      hint: 'A service-year card per publisher — months reported, studies and hours.',
      options: ['person'],
      build: function () {
        var sy = U.serviceYear(U.period(U.today()));
        var periods = U.serviceYearPeriods(sy);
        var people = state.personId
          ? Store.people().filter(function (p) { return p.id === state.personId; })
          : U.sortBy(Store.people(), function (p) { return p.lastName; });
        var pages = [], perPage = 2;
        for (var i = 0; i < people.length; i += perPage) {
          var cards = el('div.p-cards');
          people.slice(i, i + perPage).forEach(function (p) {
            var rows = periods.map(function (per) {
              var r = Store.report(p.id, per);
              return { period: per, r: r };
            });
            var shared = rows.filter(function (x) { return x.r && x.r.shared; });
            cards.appendChild(el('div.p-card', [
              el('div.p-card-h', [
                el('strong', { text: Store.name(p.id, 'last') }),
                el('span', { text: 'Service year ' + (sy - 1) + '/' + sy })
              ]),
              el('div.p-card-meta', [
                'Type: ' + (S.PUBLISHER_TYPES.filter(function (t) { return t.id === p.publisherType; })[0] || {}).name,
                'Group: ' + ((Store.group(p.serviceGroupId) || {}).name || '—'),
                'Baptised: ' + (p.baptizedOn ? U.fmtDate(p.baptizedOn) : '—'),
                'Status: ' + (S.STATUSES.filter(function (s) { return s.id === p.status; })[0] || {}).name
              ].join('   ·   ')),
              pTable([
                { key: 'm', label: 'Month', width: '30%', render: function (x) { return U.periodLabel(x.period); } },
                { key: 's', label: 'Shared', width: '16%', render: function (x) {
                  return x.r ? (x.r.shared ? 'Yes' : 'No') : ''; } },
                { key: 'st', label: 'Studies', num: true, width: '16%', render: function (x) {
                  return x.r ? String(x.r.studies || 0) : ''; } },
                { key: 'h', label: 'Hours', num: true, width: '16%', render: function (x) {
                  return x.r && x.r.hours != null ? String(x.r.hours) : ''; } },
                { key: 'c', label: 'Comments', render: function (x) { return x.r ? x.r.comments : ''; } }
              ], rows),
              el('div.p-card-tot', { text: 'Months reported: ' + shared.length
                + '   ·   Studies: ' + U.sum(shared, function (x) { return x.r.studies || 0; })
                + '   ·   Hours: ' + U.sum(shared, function (x) { return x.r.hours || 0; }) })
            ]));
          });
          pages.push(sheet([cards, sheetFoot('Confidential — congregation use only')]));
        }
        if (!pages.length) pages.push(sheet([sheetHead('Publisher record cards'), el('p', { text: 'No publishers yet.' })]));
        return pages;
      }
    },

    territories: {
      name: 'Territory register',
      hint: 'Every territory, who holds it and when it is due back.',
      options: [],
      build: function () {
        var rows = U.sortBy(Store.territories(), function (t) { return t.number; });
        return [sheet([
          sheetHead('Territory register'),
          pTable([
            { key: 'number', label: 'No.', width: '8%' },
            { key: 'name', label: 'Boundaries', width: '28%' },
            { key: 'type', label: 'Type', width: '14%' },
            { key: 'status', label: 'Status', width: '12%', render: function (t) {
              var s = Store.territoryStatus(t);
              return (S.TERRITORY_STATUS.filter(function (x) { return x.id === s; })[0] || {}).name;
            } },
            { key: 'who', label: 'Held by', width: '18%', render: function (t) { return nameOf(t.assigneeId); } },
            { key: 'out', label: 'Out', width: '10%', render: function (t) { return t.checkedOutOn ? U.fmtDate(t.checkedOutOn) : ''; } },
            { key: 'due', label: 'Due', width: '10%', render: function (t) { return t.dueOn ? U.fmtDate(t.dueOn) : ''; } }
          ], rows),
          sheetFoot()
        ])];
      }
    },

    service: {
      name: 'Field service report',
      hint: 'The congregation totals for a month, with who is still outstanding.',
      options: ['period'],
      build: function () {
        var per = period();
        var sum = Store.reportSummary(per);
        var missing = Store.missingReports(per);
        var rows = U.sortBy(Store.activePeople(), function (p) { return p.lastName; }).map(function (p) {
          return { p: p, r: Store.report(p.id, per) };
        });
        return [
          sheet([
            sheetHead('Congregation field service report', U.periodLabel(per)),
            pTable([
              { key: 'k', label: 'Item', width: '60%' },
              { key: 'v', label: 'Total', num: true }
            ], [
              { k: 'Active publishers', v: sum.expected },
              { k: 'Reports received', v: sum.submitted },
              { k: 'Publishers who shared in the ministry', v: sum.publishers },
              { k: 'Bible studies conducted', v: sum.studies },
              { k: 'Auxiliary pioneers', v: sum.auxiliary },
              { k: 'Regular pioneers', v: sum.regular },
              { k: 'Total pioneer hours', v: sum.pioneerHours },
              { k: 'Average midweek attendance', v: Store.attendanceAverage(per, 'midweek') || '—' },
              { k: 'Average weekend attendance', v: Store.attendanceAverage(per, 'weekend') || '—' }
            ]),
            missing.length ? el('p.p-note', { text: 'Outstanding: ' + missing.map(function (p) { return Store.name(p.id); }).join(', ') }) : null,
            sheetFoot()
          ]),
          sheet([
            sheetHead('Individual reports', U.periodLabel(per)),
            pTable([
              { key: 'n', label: 'Publisher', width: '32%', render: function (x) { return Store.name(x.p.id, 'last'); } },
              { key: 'g', label: 'Group', width: '22%', render: function (x) { return (Store.group(x.p.serviceGroupId) || {}).name || ''; } },
              { key: 's', label: 'Shared', width: '12%', render: function (x) { return x.r ? (x.r.shared ? 'Yes' : 'No') : 'Not in'; } },
              { key: 'st', label: 'Studies', num: true, width: '12%', render: function (x) { return x.r ? String(x.r.studies || 0) : ''; } },
              { key: 'h', label: 'Hours', num: true, width: '12%', render: function (x) { return x.r && x.r.hours != null ? String(x.r.hours) : ''; } }
            ], rows),
            sheetFoot('Confidential — congregation use only')
          ])
        ];
      }
    },

    accounts: {
      name: 'Accounts report',
      hint: 'The monthly report read to the congregation.',
      options: ['period'],
      build: function () {
        var per = period();
        var sum = Store.accountsSummary(per);
        var cur = Store.cong().currency;
        var byCat = [];
        S.ACCOUNT_CATEGORIES.income.forEach(function (c) {
          var v = U.sum(sum.rows.filter(function (r) { return r.kind === 'income' && r.category === c; }), function (r) { return r.amount; });
          if (v) byCat.push({ k: 'Receipts — ' + c, v: U.money(v, cur) });
        });
        byCat.push({ k: 'Total receipts', v: U.money(sum.income, cur) });
        S.ACCOUNT_CATEGORIES.expense.forEach(function (c) {
          var v = U.sum(sum.rows.filter(function (r) { return r.kind === 'expense' && r.category === c; }), function (r) { return r.amount; });
          if (v) byCat.push({ k: 'Expenses — ' + c, v: U.money(v, cur) });
        });
        byCat.push({ k: 'Total expenses', v: U.money(sum.expense, cur) });
        return [sheet([
          sheetHead('Congregation accounts report', U.periodLabel(per)),
          pTable([{ key: 'k', label: 'Item', width: '65%' }, { key: 'v', label: 'Amount', num: true }],
            [{ k: 'Opening balance', v: U.money(sum.opening, cur) }].concat(byCat)
              .concat([{ k: 'Closing balance', v: U.money(sum.closing, cur) }])),
          el('h2.p-h2', { text: 'Entries' }),
          pTable([
            { key: 'date', label: 'Date', width: '16%', render: function (t) { return U.fmtDate(t.date); } },
            { key: 'kind', label: 'Type', width: '14%', render: function (t) { return t.kind === 'income' ? 'Receipt' : 'Expense'; } },
            { key: 'category', label: 'Category', width: '32%' },
            { key: 'note', label: 'Note' },
            { key: 'amount', label: 'Amount', num: true, render: function (t) { return U.money(t.amount, cur); } }
          ], U.sortBy(sum.rows, function (r) { return r.date; })),
          sheetFoot()
        ])];
      }
    },

    attendance: {
      name: 'Attendance record',
      hint: 'Every meeting count for the service year, with monthly averages.',
      options: [],
      build: function () {
        var sy = U.serviceYear(U.period(U.today()));
        var periods = U.serviceYearPeriods(sy);
        var rows = periods.map(function (p) {
          return {
            p: p,
            mid: Store.attendanceAverage(p, 'midweek'),
            wknd: Store.attendanceAverage(p, 'weekend'),
            n: Store.attendance().filter(function (a) { return U.period(a.date) === p; }).length
          };
        });
        return [sheet([
          sheetHead('Meeting attendance', 'Service year ' + (sy - 1) + '/' + sy),
          pTable([
            { key: 'm', label: 'Month', width: '34%', render: function (r) { return U.periodLabel(r.p); } },
            { key: 'n', label: 'Meetings counted', num: true, width: '22%' },
            { key: 'mid', label: 'Midweek average', num: true, width: '22%', render: function (r) { return r.mid || ''; } },
            { key: 'w', label: 'Weekend average', num: true, render: function (r) { return r.wknd || ''; } }
          ], rows),
          sheetFoot()
        ])];
      }
    },

    agenda: {
      name: "Elders' meeting agenda",
      hint: 'Everything put on the agenda, with who is caring for it.',
      options: [],
      build: function () {
        var items = Store.tasks().filter(function (t) { return t.agendaFor === 'next' && t.status !== 'done'; });
        var open = Store.tasks().filter(function (t) { return t.status !== 'done' && t.agendaFor !== 'next'; });
        return [sheet([
          sheetHead("Elders' meeting agenda"),
          items.length ? el('ol.p-ol', items.map(function (t) {
            return el('li', [
              el('strong', { text: t.title }),
              el('div.small', { text: t.category + (t.dueOn ? ' · due ' + U.fmtDate(t.dueOn) : '')
                + (t.assigneeIds.length ? ' · ' + t.assigneeIds.map(function (id) { return Store.name(id); }).join(', ') : '') }),
              t.detail ? el('div.small', { text: t.detail }) : null
            ]);
          })) : el('p', { text: 'Nothing on the agenda.' }),
          el('h2.p-h2', { text: 'Other open matters' }),
          pTable([
            { key: 't', label: 'Task', width: '46%', render: function (t) { return t.title; } },
            { key: 'c', label: 'Category', width: '20%', render: function (t) { return t.category; } },
            { key: 'd', label: 'Due', width: '14%', render: function (t) { return t.dueOn ? U.fmtDate(t.dueOn) : ''; } },
            { key: 'w', label: 'With', render: function (t) {
              return t.assigneeIds.map(function (id) { return Store.name(id, 'short'); }).join(', '); } }
          ], open),
          sheetFoot('Confidential — body of elders')
        ])];
      }
    }
  };

  /* ---------- the view ---------- */

  Views.print = {
    title: 'printing',
    perm: 'schedule.view',
    render: function (root, params) {
      if (params.id && DOCS[params.id]) state.doc = params.id;
      var doc = DOCS[state.doc];

      var controls = el('div.no-print');
      controls.appendChild(UI.pageHead({
        crumbs: [{ label: Store.cong().name }, { label: 'Print & PDF' }],
        title: 'Print & PDF',
        sub: 'Pick a document, then Print. Choosing “Save as PDF” as the destination writes a PDF file you can email or keep.',
        actions: [
          UI.btn('Print / Save as PDF', { variant: 'primary', icon: 'print', onClick: function () { global.print(); } })
        ]
      }));

      var picker = el('div.grid.c3', { style: 'margin-bottom:20px' });
      Object.keys(DOCS).forEach(function (id) {
        var d = DOCS[id];
        var card = el('button.card', {
          style: 'text-align:left;cursor:pointer;border-color:' + (id === state.doc ? 'var(--B400)' : 'var(--border)')
            + (id === state.doc ? ';box-shadow:0 0 0 1px var(--B400)' : ''),
          onclick: function () { state.doc = id; App.go('print', id); App.render(); }
        }, [
          el('div.row', [U.icon('print', 16), el('strong', { text: d.name })]),
          el('div.small.muted', { style: 'margin-top:6px', text: d.hint })
        ]);
        picker.appendChild(card);
      });
      controls.appendChild(picker);

      /* per-document options */
      var opts = el('div.row', { style: 'margin-bottom:16px' });
      if (doc.options.indexOf('weeks') !== -1) {
        opts.appendChild(el('span.small.muted', { text: 'Weeks' }));
        opts.appendChild(UI.btnGroup([{ id: '2', label: '2' }, { id: '4', label: '4' }, { id: '8', label: '8' }, { id: '12', label: '12' }],
          String(state.weeks), function (v) { state.weeks = +v; App.render(); }));
      }
      if (doc.options.indexOf('period') !== -1) {
        opts.appendChild(el('span.small.muted', { text: 'Month' }));
        opts.appendChild(UI.dateNav(U.periodLabel(period()),
          function () { state.period = U.prevPeriod(period()); App.render(); },
          function () { state.period = U.nextPeriod(period()); App.render(); },
          function () { state.period = U.prevPeriod(U.period(U.today())); App.render(); }));
      }
      if (doc.options.indexOf('person') !== -1) {
        opts.appendChild(el('span.small.muted', { text: 'Publisher' }));
        var sel = UI.select([{ id: '', name: 'Everyone' }].concat(U.sortBy(Store.people(), function (p) { return p.lastName; })
          .map(function (p) { return { id: p.id, name: Store.name(p.id, 'last') }; })), state.personId, function (v) {
          state.personId = v; App.render();
        });
        sel.style.maxWidth = '240px';
        opts.appendChild(sel);
      }
      opts.appendChild(el('span.small.muted', { style: 'margin-left:auto', text: 'Paper' }));
      opts.appendChild(UI.btnGroup([{ id: 'A4', label: 'A4' }, { id: 'Letter', label: 'Letter' }],
        state.paper, function (v) { state.paper = v; App.render(); }));
      controls.appendChild(opts);
      root.appendChild(controls);

      /* the printable area itself */
      var pages;
      try {
        pages = doc.build();
      } catch (e) {
        console.error(e);
        pages = [sheet([sheetHead('Could not build this document'), el('p', { text: String(e.message || e) })])];
      }
      var printable = el('div#printable', { dataset: { paper: state.paper } }, pages);
      root.appendChild(el('style', { text: '@page { size: ' + state.paper + '; margin: 12mm; }' }));
      root.appendChild(printable);

      root.appendChild(el('p.small.muted.no-print', { style: 'margin-top:16px',
        text: U.plural(pages.length, 'page') + '. On a phone use the browser menu → Print; on a computer Ctrl/⌘+P. '
          + 'Choose “Save as PDF” (or “Microsoft Print to PDF”) as the destination to get a file instead of paper.' }));
    },
    DOCS: DOCS
  };
})(typeof window !== 'undefined' ? window : globalThis);
