/* Meeting attendance: record the count each meeting, see the monthly averages. */
(function (global) {
  'use strict';

  var U = global.U, Store = global.Store, Auth = global.Auth, UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var state = { period: null };

  function period() { return state.period || U.period(U.today()); }

  function record(date, meeting, existing) {
    var count = UI.input({ type: 'number', min: 0, max: 2000, value: existing ? existing.count : '' });
    var note = UI.input({ value: existing ? existing.note : '', placeholder: 'Optional — e.g. includes 6 by video link' });
    UI.modal({
      title: 'Attendance',
      sub: U.fmtDate(date, 'long') + ' — ' + (meeting === 'midweek' ? 'midweek meeting' : 'weekend meeting'),
      body: [UI.field('Number present', count), UI.field('Note', note)],
      actions: [{ label: 'Save', variant: 'primary', onClick: function () {
        var n = +count.value;
        if (!count.value || n < 0) { UI.flag('Enter a count', null, 'danger'); return false; }
        Store.update({ action: 'attendance.recorded', summary: U.fmtDate(date) + ' — ' + n }, function (st) {
          if (existing) { existing.count = n; existing.note = note.value; return; }
          st.attendance.push({
            id: U.uid('att'), congId: Store.congId(), date: date, meeting: meeting,
            count: n, note: note.value.trim()
          });
        });
      } }]
    });
  }

  Views.attendance = {
    title: 'attendance records',
    perm: 'attendance.edit',
    render: function (root) {
      var per = period();
      var cong = Store.cong();

      root.appendChild(UI.pageHead({
        crumbs: [{ label: cong.name }, { label: 'Attendance' }],
        title: 'Attendance',
        sub: 'Counted at each meeting and averaged for the monthly report.',
        actions: [
          UI.dateNav(U.periodLabel(per),
            function () { state.period = U.prevPeriod(per); App.render(); },
            function () { state.period = U.nextPeriod(per); App.render(); },
            function () { state.period = U.period(U.today()); App.render(); }),
          UI.btn('Export CSV', { variant: 'subtle', icon: 'download', onClick: exportCsv })
        ]
      }));

      var mid = Store.attendanceAverage(per, 'midweek');
      var wknd = Store.attendanceAverage(per, 'weekend');
      var prevMid = Store.attendanceAverage(U.prevPeriod(per), 'midweek');
      var prevWknd = Store.attendanceAverage(U.prevPeriod(per), 'weekend');

      root.appendChild(el('div.grid.c4', [
        UI.stat('Midweek average', mid || '—',
          prevMid ? (mid - prevMid >= 0 ? '+' : '') + (mid - prevMid) + ' on last month' : 'No comparison',
          prevMid && mid >= prevMid ? 'up' : prevMid ? 'down' : ''),
        UI.stat('Weekend average', wknd || '—',
          prevWknd ? (wknd - prevWknd >= 0 ? '+' : '') + (wknd - prevWknd) + ' on last month' : 'No comparison',
          prevWknd && wknd >= prevWknd ? 'up' : prevWknd ? 'down' : ''),
        UI.stat('Publishers', Store.activePeople().length, 'On the roll'),
        UI.stat('Weekend vs roll', wknd ? Math.round(100 * wknd / Math.max(1, Store.activePeople().length)) + '%' : '—',
          'Attendance against publishers')
      ]));

      /* meetings in this month */
      var dates = [];
      Store.weeks().forEach(function (w) {
        [['midweek', w.midweek], ['weekend', w.weekend]].forEach(function (pair) {
          if (U.period(pair[1].date) !== per) return;
          if (pair[1].cancelled) return;
          var existing = Store.attendance().filter(function (a) { return a.date === pair[1].date && a.meeting === pair[0]; })[0];
          dates.push({ date: pair[1].date, meeting: pair[0], record: existing });
        });
      });

      root.appendChild(UI.sectionTitle('Meetings in ' + U.periodLabel(per)));
      root.appendChild(UI.table([
        { key: 'date', label: 'Date', sort: function (r) { return r.date; }, render: function (r) { return U.fmtDate(r.date, 'long'); } },
        { key: 'meeting', label: 'Meeting', render: function (r) { return r.meeting === 'midweek' ? cong.meetings.midweek.name : cong.meetings.weekend.name; } },
        { key: 'count', label: 'Present', num: true, render: function (r) {
          return r.record ? el('strong', { text: String(r.record.count) }) : el('span.muted', { text: 'Not recorded' });
        } },
        { key: 'note', label: 'Note', render: function (r) { return r.record && r.record.note ? r.record.note : '—'; } },
        { key: 'actions', label: '', render: function (r) {
          return UI.btn(r.record ? 'Edit' : 'Record', { sm: true, variant: r.record ? 'subtle' : '',
            onClick: function () { record(r.date, r.meeting, r.record); } });
        } }
      ], dates, { sortKey: 'date', empty: 'No meetings fall in this month yet.' }));

      /* twelve-month history */
      root.appendChild(UI.sectionTitle('Twelve-month history'));
      var hist = [];
      var p = per;
      for (var i = 0; i < 12; i++) {
        hist.unshift({ period: p, mid: Store.attendanceAverage(p, 'midweek'), wknd: Store.attendanceAverage(p, 'weekend') });
        p = U.prevPeriod(p);
      }
      var max = Math.max.apply(null, hist.map(function (h) { return Math.max(h.mid || 0, h.wknd || 0); }).concat([1]));
      root.appendChild(UI.card(null, el('div.stack', hist.map(function (h) {
        return el('div', [
          el('div.row', [
            el('span.small', { style: 'width:120px', text: U.periodLabel(h.period) }),
            el('span', { style: 'flex:1' }, UI.meter((h.mid || 0) / max)),
            el('span.small.muted', { style: 'width:60px;text-align:right', text: h.mid ? String(h.mid) : '—' }),
            el('span', { style: 'flex:1' }, UI.meter((h.wknd || 0) / max, 'good')),
            el('span.small.muted', { style: 'width:60px;text-align:right', text: h.wknd ? String(h.wknd) : '—' })
          ])
        ]);
      }))));
      root.appendChild(el('p.small.muted', { style: 'margin-top:8px', text: 'Blue: midweek · green: weekend.' }));
    }
  };

  function exportCsv() {
    var rows = [['Date', 'Meeting', 'Present', 'Note']];
    U.sortBy(Store.attendance(), function (a) { return a.date; }).forEach(function (a) {
      rows.push([a.date, a.meeting, a.count, a.note || '']);
    });
    U.download('attendance-' + U.today() + '.csv', U.csv(rows), 'text/csv');
  }
})(typeof window !== 'undefined' ? window : globalThis);
