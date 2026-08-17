/* Who is being used, and who is being left out.
 *
 * The scheduler already spreads the work; this is where you check that it has,
 * and see the two things it cannot decide for you: someone nobody has marked as
 * qualified for anything, and someone carrying far more than their share. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App, Sch = global.Scheduler;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var RANGES = [
    { id: 'past13', label: 'Last 3 months' },
    { id: 'past26', label: 'Last 6 months' },
    { id: 'next8', label: 'Next 8 weeks' },
    { id: 'year', label: 'Service year' }
  ];
  var state = { range: 'past26', only: 'all' };

  function window_() {
    var thisWeek = U.weekStart(U.today());
    if (state.range === 'past13') return { from: U.addDays(thisWeek, -91), to: thisWeek, label: 'the last three months' };
    if (state.range === 'next8') return { from: thisWeek, to: U.addDays(thisWeek, 56), label: 'the next eight weeks' };
    if (state.range === 'year') {
      var sy = U.serviceYear(U.period(U.today()));
      return { from: U.weekStart((sy - 1) + '-09-01'), to: U.addDays(thisWeek, 56), label: 'this service year' };
    }
    return { from: U.addDays(thisWeek, -182), to: thisWeek, label: 'the last six months' };
  }

  Views.fairness = {
    title: 'the workload report',
    perm: 'schedule.view',
    render: function (root) {
      var w = window_();
      var f = Sch.fairness({ from: w.from, to: w.to });
      var canEdit = Auth.can('publishers.edit');

      root.appendChild(UI.pageHead({
        crumbs: [{ label: Store.cong().name }, { label: 'Who is being used' }],
        title: 'Who is being used',
        sub: 'Every active publisher over ' + w.label + ' — parts, assistant parts and duties together.',
        actions: [
          UI.btnGroup(RANGES, state.range, function (v) { state.range = v; App.render(); }),
          UI.btn('Export CSV', { variant: 'subtle', icon: 'download', onClick: function () { exportCsv(f, w); } })
        ]
      }));

      root.appendChild(el('div.grid.c4', [
        UI.stat('Assignments', f.total, 'Across ' + U.plural(f.windowWeeks, 'week')),
        UI.stat('Fair share each', f.fairShare.toFixed(1), 'If it were level'),
        UI.stat('Nothing at all', f.notUsedInWindow.length,
          f.notUsedInWindow.length ? 'Qualified but unused' : 'Everyone had something',
          f.notUsedInWindow.length ? 'down' : 'up'),
        UI.stat('Carrying a lot', f.overFairShare.length, 'Well above the share',
          f.overFairShare.length ? 'down' : 'up')
      ]));

      /* the two things worth acting on */
      if (f.notUsedInWindow.length) {
        root.appendChild(UI.banner('warn',
          U.plural(f.notUsedInWindow.length, 'publisher') + ' had nothing in ' + w.label,
          f.notUsedInWindow.slice(0, 10).map(function (r) { return Store.name(r.person.id); }).join(', ')
            + (f.notUsedInWindow.length > 10 ? '…' : '')));
      }
      if (f.nothingOpen.length) {
        root.appendChild(UI.banner('danger',
          U.plural(f.nothingOpen.length, 'publisher') + ' cannot be given anything at all',
          'Nobody has marked them for any part or duty, so the scheduler can never reach them: '
            + f.nothingOpen.map(function (r) { return Store.name(r.person.id); }).join(', ')
            + (canEdit ? '. Open their record and tick what they can care for.' : '.'),
          canEdit ? UI.btn('Open publishers', { sm: true, onClick: function () { App.go('publishers'); } }) : null));
      }
      if (f.overFairShare.length) {
        root.appendChild(UI.banner('neutral',
          U.plural(f.overFairShare.length, 'publisher') + ' carrying well over the share',
          f.overFairShare.map(function (r) { return Store.name(r.person.id) + ' (' + r.past + ')'; }).join(', ')
            + ' — usually the elders taking the parts only they are qualified for.'));
      }
      if (!f.notUsedInWindow.length && !f.nothingOpen.length) {
        root.appendChild(UI.banner('success', 'Everyone has had a share',
          'No active publisher went without an assignment in ' + w.label + '.'));
      }

      /* why someone is carrying a lot is nearly always this */
      var thin = Sch.thinPools(4);
      if (thin.length) {
        var card = UI.card('Where the rotation is thin', [
          el('p.small.muted', { style: 'margin-bottom:12px',
            text: 'Fewer than four people are marked for each of these, so the same few keep coming round. '
              + 'Marking one or two more on their record card is the single thing that spreads the work further.' }),
          UI.table([
            { key: 'name', label: 'Part or duty', render: function (r) {
              return el('div', [
                el('div', { text: r.name }),
                el('div.small.muted', { text: r.kind === 'duty' ? 'Duty rota' : 'Meeting part' })
              ]);
            } },
            { key: 'count', label: 'People marked', num: true, render: function (r) {
              return UI.lozenge(String(r.count), r.count === 0 ? 'removed' : r.count < 3 ? 'warn' : '');
            } },
            { key: 'who', label: 'Who', render: function (r) {
              return r.people.length
                ? el('div', r.people.map(function (p) { return UI.tag(Store.name(p.id, 'short')); }))
                : UI.lozenge('Nobody — this can never be filled', 'removed');
            } }
          ], thin)
        ], { icon: 'warn' });
        root.appendChild(el('div', { style: 'margin-top:20px' }, card));
      }

      /* filters */
      root.appendChild(el('div.row', { style: 'margin:16px 0' }, [
        UI.btnGroup([
          { id: 'all', label: 'Everyone' },
          { id: 'unused', label: 'Had nothing' },
          { id: 'heavy', label: 'Carrying most' },
          { id: 'limited', label: 'With limits set' }
        ], state.only, function (v) { state.only = v; App.render(); })
      ]));

      var rows = f.rows.filter(function (r) {
        if (state.only === 'unused') return r.past === 0;
        if (state.only === 'heavy') return f.fairShare && r.past > f.fairShare;
        if (state.only === 'limited') {
          return r.availability.maxPerMonth != null || !r.availability.midweek
            || !r.availability.weekend || !r.availability.duties
            || (r.person.unavailable || []).length;
        }
        return true;
      });

      var max = Math.max.apply(null, f.rows.map(function (r) { return r.past; }).concat([1]));

      root.appendChild(UI.table([
        { key: 'name', label: 'Publisher', minWidth: '210px', sort: function (r) { return r.person.lastName; },
          render: function (r) { return UI.person(r.person.id, { sub: true }); } },
        { key: 'count', label: 'Assignments', num: true, sort: function (r) { return r.past; },
          render: function (r) {
            return el('strong', { style: r.past === 0 ? 'color:var(--R400)' : '', text: String(r.past) });
          } },
        { key: 'bar', label: 'Share', minWidth: '140px', render: function (r) {
          var tone = r.past === 0 ? 'bad' : (f.fairShare && r.past > f.fairShare * 1.75 ? 'warn' : '');
          return el('div', { style: 'min-width:120px' }, UI.meter(r.past / max, tone));
        } },
        { key: 'last', label: 'Last used', sort: function (r) { return r.lastAt || '0000'; },
          render: function (r) {
            if (!r.lastAt) return UI.lozenge('Never', 'removed');
            return el('span', { text: U.fmtDate(r.lastAt) });
          } },
        { key: 'next', label: 'Next', sort: function (r) { return r.nextDate || '9999'; },
          render: function (r) {
            if (!r.nextDate) return el('span.muted', { text: 'nothing booked' });
            return el('span', { text: U.fmtDate(r.nextDate, 'day') + (r.upcoming > 1 ? ' (+' + (r.upcoming - 1) + ')' : '') });
          } },
        { key: 'limits', label: 'Availability', render: function (r) {
          var bits = [];
          if (!r.availability.midweek) bits.push(UI.lozenge('No midweek', 'warn'));
          if (!r.availability.weekend) bits.push(UI.lozenge('No weekend', 'warn'));
          if (!r.availability.duties) bits.push(UI.lozenge('No duties', 'warn'));
          if (r.availability.maxPerMonth != null) bits.push(UI.lozenge('Max ' + r.availability.maxPerMonth + '/month', ''));
          var away = (r.person.unavailable || []).filter(function (u) { return u.to >= U.today(); });
          if (away.length) bits.push(UI.lozenge('Away ' + U.fmtDate(away[0].from), 'moved'));
          return bits.length ? el('div', bits) : el('span.muted', { text: '—' });
        } },
        { key: 'open', label: 'Can be given', render: function (r) {
          if (!r.openTo.length) return UI.lozenge('Nothing marked', 'removed');
          return el('span.small.muted', {
            title: r.openTo.join(', '),
            text: r.openTo.length > 3
              ? r.openTo.slice(0, 3).join(', ') + ' +' + (r.openTo.length - 3)
              : r.openTo.join(', ')
          });
        } },
        { key: 'actions', label: '', render: function (r) {
          return UI.btn('Open', { sm: true, variant: 'subtle',
            onClick: function () { App.go('publishers', r.person.id); } });
        } }
      ], rows, { sortKey: 'count', empty: 'Nobody matches.' }));

      root.appendChild(el('p.small.muted', { style: 'margin-top:12px',
        text: 'The scheduler picks whoever is carrying least first, so this list should level out on its own. '
          + 'Elders normally sit above the share because a few parts can only go to them.' }));
    }
  };

  function exportCsv(f, w) {
    var rows = [['Publisher', 'Group', 'Assignments ' + w.from + ' to ' + w.to, 'Last used', 'Next', 'Midweek', 'Weekend', 'Duties', 'Max per month', 'Can be given']];
    f.rows.forEach(function (r) {
      rows.push([
        Store.name(r.person.id, 'last'),
        (Store.group(r.person.serviceGroupId) || {}).name || '',
        r.past,
        r.lastAt || '',
        r.nextDate || '',
        r.availability.midweek ? 'yes' : 'no',
        r.availability.weekend ? 'yes' : 'no',
        r.availability.duties ? 'yes' : 'no',
        r.availability.maxPerMonth == null ? '' : r.availability.maxPerMonth,
        r.openTo.join(' | ')
      ]);
    });
    U.download('workload-' + U.today() + '.csv', U.csv(rows), 'text/csv');
  }

  /* ---------- availability editor, used from the record card and My details ---------- */

  Views.fairness.availabilityEditor = function (person, onSaved) {
    var av = S.availabilityOf(person);
    var draft = {
      midweek: av.midweek, weekend: av.weekend, duties: av.duties,
      maxPerMonth: av.maxPerMonth, notes: av.notes
    };
    var maxInput = UI.input({
      type: 'number', min: 1, max: 30,
      value: draft.maxPerMonth == null ? '' : draft.maxPerMonth,
      placeholder: 'No limit',
      onInput: function (e) { draft.maxPerMonth = e.target.value === '' ? null : +e.target.value; }
    });
    UI.modal({
      title: 'How ' + person.firstName + ' can serve',
      sub: 'The scheduler follows this. Away dates are separate — they say when someone is not here at all.',
      body: [
        UI.checkbox('Available for the midweek meeting', draft.midweek, function (v) { draft.midweek = v; }),
        UI.checkbox('Available for the weekend meeting', draft.weekend, function (v) { draft.weekend = v; }),
        UI.checkbox('Willing to be on the duty rota', draft.duties, function (v) { draft.duties = v; },
          'Attendants, audio and video, microphones, car park, security.'),
        UI.field('Most assignments in a month', maxInput,
          'Leave blank unless they have asked for a limit — health, work, a young family.'),
        UI.field('Note for the elders', UI.textarea({
          value: draft.notes, rows: 3,
          placeholder: 'e.g. works nights on Thursdays, can only manage the weekend',
          onInput: function (e) { draft.notes = e.target.value; }
        }))
      ],
      actions: [{ label: 'Save', variant: 'primary', onClick: function () {
        Store.update({ action: 'person.availability', summary: Store.name(person.id) }, function () {
          person.availability = {
            midweek: draft.midweek, weekend: draft.weekend, duties: draft.duties,
            maxPerMonth: draft.maxPerMonth, notes: draft.notes.trim()
          };
        });
        UI.flag('Saved', 'The scheduler will follow it from now on.', 'success');
        if (onSaved) onSaved();
      } }]
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
