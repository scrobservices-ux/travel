/* Shepherding: visit planning and confidential notes, elders only. */
(function (global) {
  'use strict';

  var U = global.U, Store = global.Store, Auth = global.Auth, UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var VISIT_TYPES = [
    { id: 'shepherding', name: 'Shepherding visit' },
    { id: 'encouragement', name: 'Encouragement call' },
    { id: 'reactivation', name: 'Reactivation visit' },
    { id: 'welcome', name: 'Welcome / new publisher' },
    { id: 'study', name: 'Bible study visit' }
  ];

  function newVisit(personId) {
    var elders = Store.people().filter(function (p) { return p.appointment === 'elder'; });
    var draft = {
      personId: personId || (Store.activePeople()[0] || {}).id,
      type: 'shepherding',
      date: U.today(),
      elderIds: [Auth.me().id].filter(Boolean),
      notes: '',
      followUpOn: U.addDays(U.today(), 90)
    };

    var elderGrid = el('div.checkgrid');
    elders.forEach(function (e) {
      elderGrid.appendChild(UI.checkbox(Store.name(e.id), draft.elderIds.indexOf(e.id) !== -1, function (v) {
        draft.elderIds = draft.elderIds.filter(function (x) { return x !== e.id; });
        if (v) draft.elderIds.push(e.id);
      }));
    });

    UI.modal({
      wide: true,
      title: 'Record a visit',
      sub: 'Kept to the body of elders. Write what helps the next elder care for the family, nothing more.',
      body: [
        el('div.grid.c2', [
          UI.field('Publisher / family', UI.select(U.sortBy(Store.people(), function (p) { return p.lastName; })
            .map(function (p) { return { id: p.id, name: Store.name(p.id, 'last') }; }), draft.personId,
          function (v) { draft.personId = v; })),
          UI.field('Type', UI.select(VISIT_TYPES, draft.type, function (v) { draft.type = v; }))
        ]),
        el('div.grid.c2', [
          UI.field('Date of visit', UI.input({ type: 'date', value: draft.date, onInput: function (e) { draft.date = e.target.value; } })),
          UI.field('Follow up by', UI.input({ type: 'date', value: draft.followUpOn, onInput: function (e) { draft.followUpOn = e.target.value; } }))
        ]),
        el('fieldset', [el('legend', { text: 'Elders who called' }), elderGrid]),
        UI.field('Notes', UI.textarea({ rows: 6, value: draft.notes, onInput: function (e) { draft.notes = e.target.value; } }))
      ],
      actions: [{ label: 'Save the visit', variant: 'primary', onClick: function () {
        if (!draft.personId) return false;
        Store.update({ action: 'visit.recorded', summary: Store.name(draft.personId) + ' — ' + draft.type },
          function (st) {
            st.visits.push({
              id: U.uid('visit'), congId: Store.congId(), personId: draft.personId, type: draft.type,
              date: draft.date, elderIds: draft.elderIds, notes: draft.notes.trim(),
              followUpOn: draft.followUpOn, createdBy: Auth.me().id, createdAt: Date.now()
            });
          });
        UI.flag('Visit recorded', Store.name(draft.personId), 'success');
      } }]
    });
  }

  Views.shepherding = {
    title: 'shepherding records',
    perm: 'shepherding.view',
    render: function (root) {
      var people = Auth.peopleInScope('shepherding.view').filter(function (p) {
        return p.status === 'active' || p.status === 'irregular';
      });
      var visits = U.sortBy(Store.visits().filter(function (v) {
        return Auth.reaches('shepherding.view', v.personId);
      }), function (v) { return v.date; }, 'desc');
      var dueFollowUps = visits.filter(function (v) { return v.followUpOn && v.followUpOn <= U.today(); });

      root.appendChild(UI.pageHead({
        crumbs: [{ label: Store.cong().name }, { label: 'Shepherding' }],
        title: 'Shepherding',
        sub: 'Visit planning and confidential notes for the body of elders.'
          + (Auth.scopeLabel('shepherding.view') ? ' You see ' + Auth.scopeLabel('shepherding.view') + '.' : ''),
        actions: [UI.btn('Record a visit', { variant: 'primary', icon: 'plus', onClick: function () { newVisit(null); } })]
      }));

      root.appendChild(UI.banner('neutral', 'Confidential',
        'Only elders can open this page. Notes are stored with the congregation record and appear on the publisher’s card.'));

      /* who has not been visited */
      var lastVisit = {};
      visits.forEach(function (v) {
        if (!lastVisit[v.personId] || v.date > lastVisit[v.personId]) lastVisit[v.personId] = v.date;
      });
      var never = people.filter(function (p) { return !lastVisit[p.id]; });
      var stale = people.filter(function (p) {
        return lastVisit[p.id] && U.diffDays(lastVisit[p.id], U.today()) > 365;
      });

      root.appendChild(el('div.grid.c4', [
        UI.stat('Visits recorded', visits.length, 'All time'),
        UI.stat('Follow-ups due', dueFollowUps.length, dueFollowUps.length ? 'Needs attention' : 'Nothing outstanding',
          dueFollowUps.length ? 'down' : 'up'),
        UI.stat('Not yet visited', never.length, 'No record on file'),
        UI.stat('Over a year', stale.length, 'Since the last call')
      ]));

      if (dueFollowUps.length) {
        root.appendChild(el('div', { style: 'margin-top:16px' },
          UI.banner('warn', U.plural(dueFollowUps.length, 'follow-up') + ' due',
            dueFollowUps.slice(0, 6).map(function (v) { return Store.name(v.personId); }).join(', '))));
      }

      root.appendChild(UI.sectionTitle('Visit history'));
      root.appendChild(UI.table([
        { key: 'date', label: 'Date', sort: function (v) { return v.date; }, render: function (v) { return U.fmtDate(v.date); } },
        { key: 'person', label: 'Publisher', sort: function (v) { return Store.name(v.personId, 'last'); },
          render: function (v) { return UI.person(v.personId, { sub: true }); } },
        { key: 'type', label: 'Type', render: function (v) {
          return (VISIT_TYPES.filter(function (t) { return t.id === v.type; })[0] || {}).name || v.type;
        } },
        { key: 'elders', label: 'Elders', render: function (v) { return UI.avatarGroup(v.elderIds, 3); } },
        { key: 'notes', label: 'Notes', render: function (v) {
          return el('span.trunc', { style: 'display:block;max-width:340px', title: v.notes, text: v.notes || '—' });
        } },
        { key: 'follow', label: 'Follow up', sort: function (v) { return v.followUpOn || '9999'; },
          render: function (v) {
            if (!v.followUpOn) return '—';
            var due = v.followUpOn <= U.today();
            return el('span', { style: due ? 'color:var(--R400);font-weight:600' : '', text: U.fmtDate(v.followUpOn) });
          } }
      ], visits, { sortKey: 'date', sortDir: 'desc', empty: 'No visits recorded yet.',
        onRow: function (v) { App.go('publishers', v.personId); } }));

      root.appendChild(UI.sectionTitle('Coverage by service group'));
      var grid = el('div.grid.c2');
      var groupsInScope = Auth.scope('shepherding.view') === 'group'
        ? Store.groups().filter(function (g) { return g.id === Auth.me().serviceGroupId; })
        : Store.groups();
      groupsInScope.forEach(function (g) {
        var members = people.filter(function (p) { return p.serviceGroupId === g.id; });
        var visited = members.filter(function (p) {
          return lastVisit[p.id] && U.diffDays(lastVisit[p.id], U.today()) <= 365;
        });
        grid.appendChild(UI.card(g.name, [
          el('div.row', [
            el('span', { style: 'flex:1' }, UI.meter(visited.length / Math.max(1, members.length),
              visited.length === members.length ? 'good' : visited.length ? 'warn' : 'bad')),
            el('span.small.muted', { text: visited.length + ' / ' + members.length })
          ]),
          el('div.small.muted', { style: 'margin-top:8px',
            text: 'Overseer: ' + (g.overseerId ? Store.name(g.overseerId) : 'not appointed') }),
          members.filter(function (p) { return !lastVisit[p.id]; }).length
            ? el('div', { style: 'margin-top:8px' }, members.filter(function (p) { return !lastVisit[p.id]; })
              .map(function (p) { return UI.tag(Store.name(p.id)); }))
            : null
        ]));
      });
      root.appendChild(grid);
    },
    newVisit: newVisit
  };
})(typeof window !== 'undefined' ? window : globalThis);
