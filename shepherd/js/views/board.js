/* Assignment board: every upcoming part and duty as a card, moved between
   Unassigned → Proposed → Notified → Confirmed by dragging. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var COLUMNS = [
    { id: 'unassigned', name: 'Unassigned' },
    { id: 'proposed', name: 'Proposed' },
    { id: 'notified', name: 'Notified' },
    { id: 'confirmed', name: 'Confirmed' }
  ];

  var filter = { weeks: 4, meeting: 'all', person: '' };

  function cards() {
    var out = [];
    var horizon = U.addDays(U.weekStart(U.today()), filter.weeks * 7);
    Store.weeks().forEach(function (w) {
      if (w.weekStart < U.weekStart(U.today()) || w.weekStart >= horizon) return;
      Store.allParts(w).forEach(function (row) {
        if (filter.meeting !== 'all' && filter.meeting !== row.meeting) return;
        var p = row.part;
        if (filter.person && p.assigneeId !== filter.person && p.assistantId !== filter.person) return;
        out.push({
          kind: 'part', id: p.id, title: p.title, status: p.status,
          personId: p.assigneeId, assistantId: p.assistantId,
          date: row.meeting === 'midweek' ? w.midweek.date : w.weekend.date,
          week: w, meeting: row.meeting
        });
      });
    });
    Store.duties().forEach(function (d) {
      if (d.date < U.today() || d.date >= horizon) return;
      if (filter.meeting !== 'all' && filter.meeting !== d.meeting) return;
      if (filter.person && d.personId !== filter.person) return;
      out.push({
        kind: 'duty', id: d.id, title: S.dutyType(d.type, Store.cong()).name,
        status: d.status === 'confirmed' ? 'confirmed' : (d.personId || d.groupId ? 'proposed' : 'unassigned'),
        personId: d.personId, groupId: d.groupId, date: d.date, duty: d, meeting: d.meeting
      });
    });
    return U.sortBy(out, function (c) { return c.date; });
  }

  function moveCard(card, status) {
    if (card.kind === 'part') {
      if (status === 'unassigned') {
        Store.setAssignment(card.id, 'assigneeId', null);
      } else {
        var found = Store.findPart(card.id);
        if (found && !found.part.assigneeId) {
          UI.flag('Assign someone first', 'A part cannot move past “Unassigned” without a name on it.', 'danger');
          return;
        }
        Store.setPartStatus(card.id, status);
      }
    } else {
      Store.update({ action: 'duty.status', summary: card.title + ' → ' + status }, function () {
        card.duty.status = status === 'unassigned' ? 'proposed' : status;
        if (status === 'unassigned') { card.duty.personId = null; card.duty.groupId = null; }
      });
    }
  }

  function cardNode(card) {
    var node = el('div.tile' + (card.kind === 'duty' ? '.duty' : ''), {
      draggable: Auth.can('schedule.edit') ? 'true' : null,
      onclick: function () {
        if (card.kind === 'part') App.go('meetings', card.week.weekStart);
        else App.go('duties');
      },
      ondragstart: function (e) {
        e.dataTransfer.setData('text/plain', card.kind + ':' + card.id);
        e.dataTransfer.effectAllowed = 'move';
        node.classList.add('dragging');
      },
      ondragend: function () { node.classList.remove('dragging'); }
    }, [
      el('div.tile-t', { text: card.title }),
      el('div.tile-m', [
        U.icon('calendar', 12),
        el('span', { text: U.fmtDate(card.date, 'day') }),
        card.personId ? UI.avatar(Store.person(card.personId), 'sm')
          : (card.groupId ? UI.tag((Store.group(card.groupId) || {}).name || 'Group')
            : UI.lozenge('No one', 'removed')),
        card.assistantId ? UI.avatar(Store.person(card.assistantId), 'sm') : null
      ])
    ]);
    return node;
  }

  Views.board = {
    title: 'the assignment board',
    perm: 'schedule.view',
    render: function (root) {
      var all = cards();

      root.appendChild(UI.pageHead({
        crumbs: [{ label: Store.cong().name }, { label: 'Assignment board' }],
        title: 'Assignment board',
        sub: 'Everything scheduled in the next ' + filter.weeks + ' weeks. Drag a card as you invite people and they accept.',
        actions: [
          UI.btnGroup([
            { id: 2, label: '2 wks' }, { id: 4, label: '4 wks' }, { id: 8, label: '8 wks' }
          ].map(function (o) { return { id: String(o.id), label: o.label }; }), String(filter.weeks), function (v) {
            filter.weeks = +v; App.render();
          }),
          UI.btnGroup([
            { id: 'all', label: 'Both' }, { id: 'midweek', label: 'Midweek' }, { id: 'weekend', label: 'Weekend' }
          ], filter.meeting, function (v) { filter.meeting = v; App.render(); })
        ]
      }));

      var byPerson = el('div.row', { style: 'margin-bottom:16px' }, [
        el('span.small.muted', { text: 'Filter by person' }),
        UI.select([{ id: '', name: 'Everyone' }].concat(U.sortBy(Store.activePeople(), function (p) { return p.lastName; })
          .map(function (p) { return { id: p.id, name: Store.name(p.id) }; })), filter.person, function (v) {
          filter.person = v; App.render();
        })
      ]);
      byPerson.querySelector('select').style.maxWidth = '240px';
      root.appendChild(byPerson);

      var board = el('div.board');
      COLUMNS.forEach(function (col) {
        var list = all.filter(function (c) { return c.status === col.id; });
        var body = el('div.col-body');
        list.forEach(function (c) { body.appendChild(cardNode(c)); });
        if (!list.length) body.appendChild(el('div.muted.small', { style: 'padding:12px;text-align:center', text: 'Empty' }));

        var column = el('div.col', {
          ondragover: function (e) {
            if (!Auth.can('schedule.edit')) return;
            e.preventDefault(); column.classList.add('drop-target');
          },
          ondragleave: function () { column.classList.remove('drop-target'); },
          ondrop: function (e) {
            e.preventDefault();
            column.classList.remove('drop-target');
            var raw = e.dataTransfer.getData('text/plain');
            var card = all.filter(function (c) { return c.kind + ':' + c.id === raw; })[0];
            if (card && card.status !== col.id) moveCard(card, col.id);
          }
        }, [
          el('div.col-head', [
            el('span', { text: col.name }),
            el('span.count', { text: String(list.length) })
          ]),
          body
        ]);
        board.appendChild(column);
      });
      root.appendChild(board);

      root.appendChild(el('p.small.muted', { style: 'margin-top:8px',
        text: 'A card cannot leave “Unassigned” until someone is on it — open the week from the card to assign.' }));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
