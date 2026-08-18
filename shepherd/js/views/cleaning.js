/* Cleaning the Kingdom Hall: the group whose turn it is after a meeting, and
   the monthly general cleaning the whole congregation is invited to. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App, Clean = global.Clean;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var state = { months: 3 };

  function canEdit() { return Auth.can('cleaning.manage'); }

  function range() {
    var from = U.weekStart(U.today());
    return { from: from, to: U.addDays(from, state.months * 31) };
  }

  function save(action, fn) {
    Store.update({ action: action, summary: 'Cleaning' }, fn);
  }

  function put(item) {
    save('cleaning.set', function (st) {
      var i = st.cleaning.map(function (c) { return c.id; }).indexOf(item.id);
      if (i === -1) st.cleaning.push(item); else st.cleaning[i] = item;
    });
  }

  function remove(item) {
    save('cleaning.removed', function (st) {
      st.cleaning = st.cleaning.filter(function (c) { return c.id !== item.id; });
    });
  }

  /* ---------- the schedule ---------- */

  Views.cleaning = {
    title: 'cleaning the hall',
    perm: 'cleaning.view',
    render: function (root) {
      var set = Clean.settings();
      var r = range();
      var items = Clean.between(r.from, r.to);

      root.appendChild(UI.pageHead({
        title: 'Cleaning the hall',
        sub: 'Whose turn it is after the meeting, and when the congregation cleans together.',
        actions: canEdit() ? [
          UI.btn('Settings', { icon: 'cog', onClick: settings }),
          UI.btn('Add a date', { icon: 'plus', onClick: function () { edit(null); } }),
          global.Sync && global.Sync.mode === 'server'
            ? UI.btn('Tell them now', { icon: 'bell', onClick: function () {
              global.Sync.api('POST', 'api/reminders/run', {}).then(function (out) {
                UI.flag('Sent', out.queued
                  ? U.plural(out.queued, 'message') + ' on the way, and the pop-ups have gone.'
                  : 'Nothing was due yet — everyone concerned has already been told.', 'success');
              }, function (err) { UI.flag('Could not send', err.message, 'danger'); });
            } })
            : null,
          UI.btn('Fill the rota', { variant: 'primary', icon: 'sparkle', onClick: fill })
        ].filter(Boolean) : []
      }));

      var next = items.filter(function (c) { return c.date >= U.today(); })[0];
      var me = Store.me();
      var mine = me ? Clean.forPerson(me, U.today(), r.to) : [];

      root.appendChild(el('div.grid.c3', [
        UI.stat('Next turn', next ? Clean.label(next) : '—',
          next ? U.fmtDate(next.date, 'day') : 'Nothing on the rota'),
        UI.stat('On the rota', String(items.length), 'over the next ' + state.months + ' months'),
        UI.stat('You are expected', mine.length ? U.fmtDate(mine[0].date, 'day') : '—',
          mine.length ? Clean.label(mine[0]) : 'Nothing yet')
      ]));

      if (!Store.groups().length) {
        root.appendChild(UI.banner('warn', 'No service groups yet',
          'The rota goes round the service groups, so add them under Publishers first.'));
      }

      root.appendChild(UI.sectionTitle('The rota',
        UI.btnGroup([{ id: 2, name: '2 months' }, { id: 3, name: '3 months' }, { id: 6, name: '6 months' }],
          state.months, function (v) { state.months = +v; App.render(); })));

      if (!items.length) {
        root.appendChild(UI.empty('Nothing on the rota yet',
          canEdit() ? 'Press “Fill the rota” and every group is put in turn, after the meeting your congregation cleans.'
            : 'The cleaning servant has not put the rota up yet.'));
      } else {
        root.appendChild(UI.table([
          { key: 'date', label: 'When', sort: function (c) { return c.date; }, render: function (c) {
            return el('div', [
              el('strong', { text: U.fmtDate(c.date, 'day') }),
              el('div.small.muted', { text: c.kind === 'general'
                ? (c.time || '09:00') + (c.minutes ? ' · about ' + Math.round(c.minutes / 60) + ' hours' : '')
                : 'after the ' + (c.meeting === 'midweek' ? 'midweek meeting' : 'weekend meeting') })
            ]);
          } },
          { key: 'what', label: 'Who is on', render: function (c) {
            var kind = S.cleaningKind(c.kind);
            return el('div', [
              el('div', [UI.lozenge(kind.name, kind.tone), el('span', { text: ' ' + Clean.label(c) })]),
              c.kind === 'general'
                ? el('div.small.muted', { text: 'Everyone who can come' })
                : el('div.small.muted', { text: U.plural(Clean.peopleFor(c).length, 'publisher') })
            ]);
          } },
          { key: 'state', label: '', render: function (c) {
            if (c.doneAt) return UI.lozenge('Done', 'success');
            if (c.date < U.today()) return UI.lozenge('Past', '');
            return el('span.small.muted', { text: U.plural(U.diffDays(U.today(), c.date), 'day') + ' away' });
          } },
          { key: 'notes', label: 'Note', render: function (c) { return c.notes || '—'; } },
          { key: 'actions', label: '', render: function (c) {
            if (!canEdit()) return '';
            return el('div.row', [
              UI.btn('Change', { sm: true, variant: 'subtle', onClick: function () { edit(c); } }),
              c.date <= U.today() && !c.doneAt
                ? UI.btn('Mark done', { sm: true, variant: 'subtle', onClick: function () {
                  var copy = U.clone(c);
                  copy.doneAt = Date.now();
                  copy.doneBy = Store.me() ? Store.me().id : null;
                  put(copy);
                } })
                : null
            ]);
          } }
        ], items, { minWidth: 760 }));
      }

      /* how evenly it has gone round */
      root.appendChild(UI.sectionTitle('How it has gone round'));
      var bal = Clean.balance(U.addDays(U.today(), -365), U.addDays(U.today(), 365));
      root.appendChild(bal.length ? UI.table([
        { key: 'group', label: 'Group', render: function (b) { return b.group.name; } },
        { key: 'turns', label: 'Turns in the year', render: function (b) { return String(b.turns); } },
        { key: 'last', label: 'Most recent', render: function (b) { return b.last ? U.fmtDate(b.last) : 'Not yet'; } }
      ], bal) : UI.empty('No groups', 'Add service groups and the rota will go round them.'));
    }
  };

  /* ---------- filling it ---------- */

  function fill() {
    var weeks = state.months * 4;
    var plan = Clean.plan(U.weekStart(U.today()), weeks);
    if (!plan.items.length) {
      UI.flag('Nothing to add', plan.skipped.length ? plan.skipped[0].reason
        : 'Every date in that stretch is already on the rota.', 'warn');
      return;
    }
    var body = [
      el('p.small.muted', { text: 'Each group takes its turn in order, carrying on from whoever was on last. Change anything afterwards — a swap sticks, and the rotation carries on from it.' }),
      UI.table([
        { key: 'date', label: 'When', render: function (c) { return U.fmtDate(c.date, 'day'); } },
        { key: 'kind', label: 'What', render: function (c) {
          return c.kind === 'general' ? 'General cleaning' : 'After the ' + (c.meeting === 'midweek' ? 'midweek' : 'weekend') + ' meeting';
        } },
        { key: 'who', label: 'Who', render: function (c) {
          return c.kind === 'general' ? 'Everyone' : (c.groupIds || []).map(function (id) {
            var g = Store.group(id); return g ? g.name : '—';
          }).join(', ');
        } }
      ], plan.items, { minWidth: 520 })
    ];
    UI.modal({
      wide: true,
      title: 'Fill the rota',
      sub: U.plural(plan.items.length, 'date') + ' to add',
      body: body,
      actions: [{ label: 'Put these on the rota', variant: 'primary', onClick: function () {
        save('cleaning.filled', function (st) {
          plan.items.forEach(function (i) { st.cleaning.push(i); });
        });
        UI.flag('On the rota', U.plural(plan.items.length, 'date') + ' added. Everyone concerned will be reminded.', 'success');
      } }]
    });
  }

  /* ---------- one date ---------- */

  function edit(item) {
    var isNew = !item;
    var draft = item ? U.clone(item) : {
      id: U.uid('cln'), congId: Store.congId(), date: U.today(), kind: 'group',
      groupIds: [], meeting: 'weekend', time: '', notes: '', doneAt: null, doneBy: null,
      createdAt: Date.now()
    };
    var groups = Clean.groupsInOrder();
    var body = el('div');

    function draw() {
      U.clear(body);
      body.appendChild(el('div.grid.c2', [
        UI.field('Date', UI.input({ type: 'date', value: draft.date, onInput: function (e) { draft.date = e.target.value; } })),
        UI.field('What kind', UI.select(S.CLEANING_KINDS, draft.kind, function (v) { draft.kind = v; draw(); }))
      ]));
      if (draft.kind === 'general') {
        body.appendChild(el('div.grid.c2', [
          UI.field('Start', UI.input({ type: 'time', value: draft.time || '09:00', onInput: function (e) { draft.time = e.target.value; } })),
          UI.field('Roughly how long', UI.select(
            [{ id: 90, name: 'An hour and a half' }, { id: 120, name: 'Two hours' },
              { id: 180, name: 'Three hours' }, { id: 240, name: 'Four hours' }],
            draft.minutes || 180, function (v) { draft.minutes = +v; }))
        ]));
        body.appendChild(el('p.small.muted', { text: 'Everyone in the congregation is invited to a general cleaning, and everyone will be reminded.' }));
      } else {
        body.appendChild(UI.field('After which meeting', UI.select(
          [{ id: 'midweek', name: 'The midweek meeting' }, { id: 'weekend', name: 'The weekend meeting' }],
          draft.meeting || 'weekend', function (v) { draft.meeting = v; })));
        body.appendChild(UI.field('Which group', el('div', groups.map(function (g) {
          return UI.checkbox(g.name, (draft.groupIds || []).indexOf(g.id) !== -1, function (on) {
            draft.groupIds = (draft.groupIds || []).filter(function (id) { return id !== g.id; });
            if (on) draft.groupIds.push(g.id);
          });
        })), 'More than one group can be put on together — small congregations often do.'));
      }
      body.appendChild(UI.field('Note', UI.input({
        value: draft.notes, placeholder: 'Windows this time, bring a ladder…',
        onInput: function (e) { draft.notes = e.target.value; }
      })));
    }
    draw();

    UI.modal({
      title: isNew ? 'Add a cleaning date' : 'Change this date',
      body: body,
      actions: [
        !isNew ? { label: 'Take it off', variant: 'subtle', onClick: function () { remove(item); } } : null,
        { label: 'Save', variant: 'primary', onClick: function () {
          if (!draft.date) { UI.flag('Which day?', 'Pick a date first.', 'danger'); return false; }
          if (draft.kind === 'group' && !(draft.groupIds || []).length) {
            UI.flag('Whose turn?', 'Choose at least one group.', 'danger');
            return false;
          }
          put(draft);
          UI.flag('Saved', null, 'success');
        } }
      ].filter(Boolean)
    });
  }

  /* ---------- how this congregation runs it ---------- */

  function settings() {
    var cong = Store.cong();
    var draft = Object.assign({}, S.cleaningFor(cong));
    UI.modal({
      wide: true,
      title: 'How your congregation cleans',
      sub: 'The rota follows this, and so do the reminders.',
      body: [
        el('div.grid.c2', [
          UI.field('The group stays behind after', UI.select([
            { id: 'weekend', name: 'The weekend meeting' },
            { id: 'midweek', name: 'The midweek meeting' },
            { id: 'both', name: 'Both meetings' }
          ], draft.after, function (v) { draft.after = v; })),
          UI.field('Groups on together', UI.select([
            { id: 1, name: 'One group' }, { id: 2, name: 'Two groups' }, { id: 3, name: 'Three groups' }
          ], draft.groupsPerTurn, function (v) { draft.groupsPerTurn = +v; }),
          'A small congregation often puts two together.')
        ]),
        UI.divider(),
        el('p.small.muted', { text: 'The general cleaning everyone is invited to:' }),
        el('div.grid.c3', [
          UI.field('Which week', UI.select(S.WEEK_OF_MONTH, draft.generalWeek, function (v) { draft.generalWeek = v; })),
          UI.field('Which day', UI.select(S.WEEKDAYS.map(function (n, i) { return { id: i, name: n }; }),
            draft.generalDay, function (v) { draft.generalDay = +v; })),
          UI.field('Start', UI.input({ type: 'time', value: draft.generalTime, onInput: function (e) { draft.generalTime = e.target.value; } }))
        ]),
        UI.divider(),
        el('p.small.muted', { text: 'Reminders:' }),
        el('div.grid.c2', [
          UI.field('First reminder', UI.select([
            { id: 1, name: 'The day before' }, { id: 2, name: 'Two days before' },
            { id: 3, name: 'Three days before' }, { id: 7, name: 'A week before' }
          ], draft.remindDaysBefore, function (v) { draft.remindDaysBefore = +v; })),
          el('div', [UI.checkbox('And a reminder on the morning itself', draft.remindOnTheDay,
            function (v) { draft.remindOnTheDay = v; },
            'A pop-up on the phones of everyone expected.')])
        ])
      ],
      actions: [{ label: 'Save', variant: 'primary', onClick: function () {
        Store.update({ action: 'cleaning.settings', summary: cong.name }, function () {
          cong.cleaning = draft;
        });
        UI.flag('Saved', 'The rota and the reminders follow this now.', 'success');
      } }]
    });
  }

  /* ---------- what a publisher sees ---------- */

  Views['my-cleaning'] = {
    title: 'cleaning',
    render: function (root) {
      var me = Store.me();
      root.appendChild(UI.pageHead({
        title: 'Cleaning the hall',
        sub: 'When your group is on, and when the congregation cleans together.'
      }));
      var mine = me ? Clean.forPerson(me, U.today(), U.addDays(U.today(), 180)) : [];
      if (!mine.length) {
        root.appendChild(UI.empty('Nothing yet',
          'When your group’s turn is put on the rota it will appear here, and you will be reminded beforehand.'));
        return;
      }
      root.appendChild(UI.table([
        { key: 'date', label: 'When', render: function (c) {
          return el('div', [
            el('strong', { text: U.fmtDate(c.date, 'day') }),
            el('div.small.muted', { text: c.kind === 'general' ? (c.time || '09:00')
              : 'after the ' + (c.meeting === 'midweek' ? 'midweek meeting' : 'weekend meeting') })
          ]);
        } },
        { key: 'what', label: 'What', render: function (c) {
          var kind = S.cleaningKind(c.kind);
          return el('div', [UI.lozenge(kind.name, kind.tone),
            el('div.small.muted', { text: c.kind === 'general' ? 'The whole congregation is invited' : Clean.label(c) })]);
        } },
        { key: 'note', label: 'Note', render: function (c) { return c.notes || '—'; } },
        { key: 'cal', label: '', render: function (c) {
          return UI.btn('Add to my calendar', { sm: true, variant: 'subtle', icon: 'calendar', onClick: function () {
            U.ics('cleaning', [{
              uid: c.id, title: Clean.label(c) + ' — cleaning',
              date: c.date, time: c.kind === 'general' ? (c.time || '09:00') : (c.time || '19:00'),
              minutes: c.minutes || 90,
              location: (Store.cong().hallAddress || Store.cong().name || ''),
              description: c.notes || ''
            }]);
          } });
        } }
      ], mine, { minWidth: 620 }));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
