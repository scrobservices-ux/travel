/* Field service reports: the publisher's monthly submission and the
   secretary's collection, review and congregation summary. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var state = { period: null, group: '', only: 'all' };

  function period() {
    return state.period || U.prevPeriod(U.period(U.today()));
  }

  /* ---------- entry form ---------- */

  function reportForm(personId, per, onSaved) {
    var person = Store.person(personId);
    var existing = Store.report(personId, per);
    var pioneer = ['regular', 'auxiliary', 'special'].indexOf(person.publisherType) !== -1;
    var draft = {
      shared: existing ? existing.shared : true,
      studies: existing ? existing.studies : 0,
      hours: existing ? existing.hours : (pioneer ? 0 : null),
      credit: existing ? existing.credit : 0,
      comments: existing ? existing.comments : ''
    };

    var sharedBox = UI.checkbox('I shared in the ministry this month', draft.shared, function (v) { draft.shared = v; });
    var studies = UI.input({ type: 'number', min: 0, max: 99, value: draft.studies,
      onInput: function (e) { draft.studies = +e.target.value || 0; } });
    var hours = UI.input({ type: 'number', min: 0, max: 400, value: draft.hours == null ? '' : draft.hours,
      onInput: function (e) { draft.hours = e.target.value === '' ? null : +e.target.value; } });
    var credit = UI.input({ type: 'number', min: 0, max: 200, value: draft.credit,
      onInput: function (e) { draft.credit = +e.target.value || 0; } });
    var comments = UI.textarea({ value: draft.comments, placeholder: 'Anything the elders should know (optional).',
      onInput: function (e) { draft.comments = e.target.value; } });

    var body = [
      UI.banner('neutral', 'What is asked for',
        'Every publisher reports whether they shared in the ministry and the number of Bible studies conducted. Pioneers also report hours; anyone with a theocratic-facility assignment can add credit hours.'),
      sharedBox,
      UI.field('Bible studies conducted', studies, 'Count each student, not each session.'),
      pioneer ? UI.field('Hours', hours, (person.publisherType === 'regular' ? 'Regular' : 'Auxiliary') + ' pioneer') : null,
      pioneer ? UI.field('Credit hours', credit, 'Theocratic facility work, if any.') : null,
      UI.field('Comments', comments)
    ];

    UI.modal({
      title: 'Report for ' + U.periodLabel(per),
      sub: Store.name(personId),
      body: body,
      actions: [{ label: existing ? 'Update' : 'Submit', variant: 'primary', onClick: function () {
        if (!pioneer) draft.hours = null;
        Store.saveReport(personId, per, draft);
        UI.flag('Report saved', Store.name(personId) + ' — ' + U.periodLabel(per), 'success');
        if (onSaved) onSaved();
      } }]
    });
  }

  /* ---------- secretary view ---------- */

  Views.reports = {
    title: 'field service reports',
    perm: 'reports.review',
    render: function (root) {
      var per = period();
      var sum = Store.reportSummary(per);
      var cong = Store.cong();

      root.appendChild(UI.pageHead({
        crumbs: [{ label: cong.name }, { label: 'Field service reports' }],
        title: 'Field service reports',
        sub: 'Due by the ' + cong.reportDueDay + 'th of the following month.',
        actions: [
          UI.dateNav(U.periodLabel(per),
            function () { state.period = U.prevPeriod(per); App.render(); },
            function () { state.period = U.nextPeriod(per); App.render(); },
            function () { state.period = U.prevPeriod(U.period(U.today())); App.render(); }),
          UI.btn('Reminder text', { icon: 'megaphone', onClick: function () { reminder(per); } }),
          UI.btn('Export CSV', { variant: 'subtle', icon: 'download', onClick: function () { exportCsv(per); } })
        ]
      }));

      root.appendChild(el('div.grid.c4', [
        UI.stat('Handed in', sum.submitted + ' / ' + sum.expected,
          sum.expected - sum.submitted > 0 ? (sum.expected - sum.submitted) + ' outstanding' : 'Complete',
          sum.expected - sum.submitted > 0 ? 'down' : 'up'),
        UI.stat('Publishers who shared', sum.publishers, 'Reported activity'),
        UI.stat('Bible studies', sum.studies, 'Congregation total'),
        UI.stat('Pioneer hours', sum.pioneerHours, sum.regular + ' regular · ' + sum.auxiliary + ' auxiliary')
      ]));

      var missing = Store.missingReports(per);
      if (missing.length) {
        root.appendChild(el('div', { style: 'margin-top:16px' },
          UI.banner('warn', U.plural(missing.length, 'report') + ' still outstanding',
            missing.map(function (p) { return Store.name(p.id); }).join(', '))));
      }

      var bar = el('div.row', { style: 'margin:16px 0' }, [
        UI.select([{ id: '', name: 'All groups' }].concat(Store.groups()), state.group, function (v) { state.group = v; App.render(); }),
        UI.btnGroup([
          { id: 'all', label: 'Everyone' },
          { id: 'missing', label: 'Outstanding' },
          { id: 'pioneers', label: 'Pioneers' }
        ], state.only, function (v) { state.only = v; App.render(); })
      ]);
      bar.querySelector('select').style.maxWidth = '200px';
      root.appendChild(bar);

      var rows = Store.activePeople().filter(function (p) {
        if (state.group && p.serviceGroupId !== state.group) return false;
        if (state.only === 'missing' && Store.report(p.id, per)) return false;
        if (state.only === 'pioneers' && ['regular', 'auxiliary', 'special'].indexOf(p.publisherType) === -1) return false;
        return true;
      }).map(function (p) { return { person: p, report: Store.report(p.id, per) }; });

      root.appendChild(UI.table([
        { key: 'name', label: 'Publisher', sort: function (r) { return r.person.lastName; },
          render: function (r) { return UI.person(r.person.id, { sub: true }); } },
        { key: 'group', label: 'Group', render: function (r) { return (Store.group(r.person.serviceGroupId) || {}).name || '—'; } },
        { key: 'status', label: 'Report', sort: function (r) { return r.report ? (r.report.shared ? 2 : 1) : 0; },
          render: function (r) {
            if (!r.report) return UI.lozenge('Outstanding', 'warn');
            return UI.lozenge(r.report.shared ? 'Shared' : 'No activity', r.report.shared ? 'success' : '');
          } },
        { key: 'studies', label: 'Studies', num: true, sort: function (r) { return r.report ? r.report.studies : -1; },
          render: function (r) { return r.report ? String(r.report.studies || 0) : '—'; } },
        { key: 'hours', label: 'Hours', num: true, sort: function (r) { return r.report && r.report.hours || -1; },
          render: function (r) { return r.report && r.report.hours != null ? String(r.report.hours) : '—'; } },
        { key: 'submitted', label: 'Received', render: function (r) { return r.report ? U.relative(r.report.submittedAt) : '—'; } },
        { key: 'actions', label: '', render: function (r) {
          return UI.btn(r.report ? 'Edit' : 'Record', { sm: true, variant: r.report ? 'subtle' : '',
            onClick: function () { reportForm(r.person.id, per); } });
        } }
      ], rows, { sortKey: 'status', empty: 'Nobody matches those filters.' }));

      /* congregation summary */
      root.appendChild(UI.sectionTitle('Congregation summary — ' + U.periodLabel(per)));
      root.appendChild(UI.card(null, [
        UI.kv([
          ['Active publishers', String(sum.expected)],
          ['Reports received', sum.submitted + ' (' + Math.round(100 * sum.submitted / Math.max(1, sum.expected)) + '%)'],
          ['Publishers who shared', String(sum.publishers)],
          ['Bible studies', String(sum.studies)],
          ['Auxiliary pioneers', String(sum.auxiliary)],
          ['Regular pioneers', String(sum.regular)],
          ['Total pioneer hours', String(sum.pioneerHours)],
          ['Average midweek attendance', String(Store.attendanceAverage(per, 'midweek') || '—')],
          ['Average weekend attendance', String(Store.attendanceAverage(per, 'weekend') || '—')]
        ]),
        el('div', { style: 'margin-top:16px' }, UI.copyBtn(function () { return summaryText(per); }, 'Copy the summary'))
      ]));

      /* twelve-month trend */
      root.appendChild(UI.sectionTitle('Twelve-month trend'));
      var trend = [];
      var p = per;
      for (var i = 0; i < 12; i++) { trend.unshift(Store.reportSummary(p)); p = U.prevPeriod(p); }
      var max = Math.max.apply(null, trend.map(function (t) { return t.publishers; }).concat([1]));
      root.appendChild(UI.card(null, el('div.stack', trend.map(function (t) {
        return el('div.row', [
          el('span.small', { style: 'width:120px', text: U.periodLabel(t.period) }),
          el('span', { style: 'flex:1' }, UI.meter(t.publishers / max)),
          el('span.small.muted', { style: 'width:150px;text-align:right',
            text: t.publishers + ' publishers · ' + t.studies + ' studies' })
        ]);
      }))));
    }
  };

  function summaryText(per) {
    var s = Store.reportSummary(per);
    return [
      Store.cong().name + ' — congregation report for ' + U.periodLabel(per),
      'Active publishers: ' + s.expected,
      'Publishers who shared: ' + s.publishers,
      'Bible studies: ' + s.studies,
      'Auxiliary pioneers: ' + s.auxiliary,
      'Regular pioneers: ' + s.regular,
      'Pioneer hours: ' + s.pioneerHours,
      'Average attendance — midweek ' + (Store.attendanceAverage(per, 'midweek') || '—') +
        ', weekend ' + (Store.attendanceAverage(per, 'weekend') || '—')
    ].join('\n');
  }

  function reminder(per) {
    var missing = Store.missingReports(per);
    var text = 'Reminder: field service reports for ' + U.periodLabel(per) + ' are due by the '
      + Store.cong().reportDueDay + 'th. Still outstanding: '
      + (missing.length ? missing.map(function (p) { return Store.name(p.id); }).join(', ') : 'none — thank you!');
    UI.modal({
      title: 'Reminder text',
      sub: 'Copy this into your group chat or read it to the group.',
      body: [UI.textarea({ value: text, rows: 6 }), el('div', { style: 'margin-top:12px' }, UI.copyBtn(function () { return text; }))],
      closeLabel: 'Close'
    });
  }

  function exportCsv(per) {
    var rows = [['Publisher', 'Group', 'Type', 'Shared', 'Studies', 'Hours', 'Credit', 'Comments', 'Received']];
    Store.activePeople().forEach(function (p) {
      var r = Store.report(p.id, per);
      rows.push([Store.name(p.id, 'last'), (Store.group(p.serviceGroupId) || {}).name || '', p.publisherType,
        r ? (r.shared ? 'yes' : 'no') : '', r ? r.studies : '', r && r.hours != null ? r.hours : '',
        r ? r.credit : '', r ? r.comments : '', r ? U.fmtDateTime(r.submittedAt) : '']);
    });
    U.download('reports-' + per + '.csv', U.csv(rows), 'text/csv');
  }

  /* ---------- publisher view ---------- */

  Views['my-report'] = {
    title: 'your monthly report',
    render: function (root) {
      var me = Auth.me();
      var cong = Store.cong();
      var current = U.period(U.today());
      var last = U.prevPeriod(current);

      root.appendChild(UI.pageHead({
        title: 'My monthly report',
        sub: 'Reports are due by the ' + cong.reportDueDay + 'th of the following month.',
        actions: [UI.btn('Submit ' + U.periodLabel(last), { variant: 'primary', icon: 'report',
          onClick: function () { reportForm(me.id, last); } })]
      }));

      var lastRep = Store.report(me.id, last);
      root.appendChild(lastRep
        ? UI.banner('success', U.periodLabel(last) + ' is in',
          (lastRep.shared ? 'Shared in the ministry' : 'No activity reported') + ' · '
          + U.plural(lastRep.studies || 0, 'Bible study', 'Bible studies')
          + (lastRep.hours != null ? ' · ' + lastRep.hours + ' hours' : '')
          + ' · received ' + U.relative(lastRep.submittedAt),
          UI.btn('Change it', { sm: true, onClick: function () { reportForm(me.id, last); } }))
        : UI.banner('warn', U.periodLabel(last) + ' has not been handed in',
          'It takes about ten seconds.',
          UI.btn('Submit now', { sm: true, variant: 'primary', onClick: function () { reportForm(me.id, last); } })));

      root.appendChild(UI.sectionTitle('My service year'));
      var sy = U.serviceYear(current);
      var rows = U.serviceYearPeriods(sy).map(function (p) { return { period: p, report: Store.report(me.id, p) }; });
      root.appendChild(UI.table([
        { key: 'period', label: 'Month', render: function (r) { return U.periodLabel(r.period); } },
        { key: 'shared', label: 'Shared', render: function (r) {
          if (!r.report) return el('span.muted', { text: r.period > current ? '—' : 'Not handed in' });
          return UI.lozenge(r.report.shared ? 'Yes' : 'No', r.report.shared ? 'success' : '');
        } },
        { key: 'studies', label: 'Studies', num: true, render: function (r) { return r.report ? String(r.report.studies || 0) : '—'; } },
        { key: 'hours', label: 'Hours', num: true, render: function (r) { return r.report && r.report.hours != null ? String(r.report.hours) : '—'; } },
        { key: 'actions', label: '', render: function (r) {
          if (r.period > current) return el('span');
          return UI.btn(r.report ? 'Edit' : 'Submit', { sm: true, variant: r.report ? 'subtle' : '',
            onClick: function () { reportForm(me.id, r.period); } });
        } }
      ], rows));

      var mine = rows.filter(function (r) { return r.report && r.report.shared; });
      root.appendChild(el('div.grid.c3', { style: 'margin-top:16px' }, [
        UI.stat('Months reported', mine.length, 'Service year ' + (sy - 1) + '/' + sy),
        UI.stat('Bible studies', U.sum(mine, function (r) { return r.report.studies || 0; }), 'Total'),
        UI.stat('Hours', U.sum(mine, function (r) { return r.report.hours || 0; }), 'Pioneers only')
      ]));
    }
  };

  Views.reports.form = reportForm;
})(typeof window !== 'undefined' ? window : globalThis);
