/* Publisher-facing: my assignments and my own details / availability. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App, Program = global.Program;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  Views['my-assignments'] = {
    title: 'your assignments',
    render: function (root) {
      var me = Auth.me();
      var all = Store.assignmentsFor(me.id, {});
      var upcoming = all.filter(function (r) { return r.date >= U.today(); });
      var past = all.filter(function (r) { return r.date < U.today(); });

      root.appendChild(UI.pageHead({
        title: 'My assignments',
        sub: 'Everything you have been given, and what you have cared for before.',
        actions: [UI.copyBtn(function () {
          return upcoming.map(function (r) {
            return U.fmtDate(r.date, 'day') + ' — ' + (r.duty ? S.dutyType(r.duty.type).name : r.part.title);
          }).join('\n') || 'Nothing scheduled.';
        }, 'Copy my list')]
      }));

      var unconfirmed = upcoming.filter(function (r) { return r.part && r.part.status === 'notified'; });
      if (unconfirmed.length) {
        root.appendChild(UI.banner('warn', U.plural(unconfirmed.length, 'assignment') + ' waiting for your confirmation',
          'Tap confirm so the elders know you have it.'));
      }

      root.appendChild(UI.sectionTitle('Coming up'));
      if (!upcoming.length) {
        root.appendChild(UI.empty('Nothing scheduled', 'Assignments appear here as soon as an elder gives you one.'));
      } else {
        root.appendChild(el('div.stack', upcoming.map(function (r) {
          var title = r.duty ? S.dutyType(r.duty.type).name : r.part.title;
          return UI.card(null, [
            el('div.row', [
              el('div', [
                el('div', { style: 'font-weight:600', text: title }),
                el('div.small.muted', { text: U.fmtDate(r.date, 'long') + ' · '
                  + (r.meeting === 'midweek' ? Store.cong().meetings.midweek.name : Store.cong().meetings.weekend.name) })
              ]),
              el('div.right.row', [
                r.part ? UI.statusLozenge(S.PART_STATUS, r.part.status) : UI.lozenge('Duty', 'moved'),
                r.part && r.part.status !== 'confirmed' ? UI.btn('Confirm', {
                  sm: true, variant: 'primary',
                  onClick: function () {
                    Store.setPartStatus(r.part.id, 'confirmed');
                    UI.flag('Confirmed', title, 'success');
                  }
                }) : null,
                r.part ? UI.btn('Cannot do it', { sm: true, variant: 'subtle', onClick: function () {
                  UI.confirm({ title: 'Let the elders know?',
                    body: 'The part is marked as declined so it can be given to someone else.',
                    confirmLabel: 'Mark declined', danger: true }, function () {
                    Store.setPartStatus(r.part.id, 'declined');
                    UI.flag('The elders will see this', title, 'success');
                  });
                } }) : null
              ])
            ]),
            r.part && r.part.notes ? el('p.small', { style: 'margin-top:8px', text: '📝 ' + r.part.notes }) : null,
            r.part && r.part.source ? el('p.small.muted', { style: 'margin-top:4px', text: r.part.source }) : null,
            r.part && r.part.assistantId && r.part.assistantId !== Auth.me().id
              ? el('div.row', { style: 'margin-top:8px' }, [el('span.small.muted', { text: 'With:' }), UI.person(r.part.assistantId)])
              : null,
            r.part && r.role === 'assistant'
              ? el('div.row', { style: 'margin-top:8px' }, [el('span.small.muted', { text: 'Assisting:' }), UI.person(r.part.assigneeId)])
              : null
          ]);
        })));
      }

      root.appendChild(UI.sectionTitle('Previously'));
      root.appendChild(UI.table([
        { key: 'date', label: 'Date', sort: function (r) { return r.date; }, render: function (r) { return U.fmtDate(r.date, 'day'); } },
        { key: 'what', label: 'Assignment', render: function (r) {
          return r.duty ? S.dutyType(r.duty.type).name : r.part.title + (r.role === 'assistant' ? ' (assistant)' : '');
        } },
        { key: 'meeting', label: 'Meeting', render: function (r) { return r.meeting === 'midweek' ? 'Midweek' : 'Weekend'; } }
      ], past, { sortKey: 'date', sortDir: 'desc', empty: 'Nothing yet.' }));
    }
  };

  Views.profile = {
    title: 'your details',
    render: function (root) {
      var me = Auth.me();
      var cong = Store.cong();

      root.appendChild(UI.pageHead({
        title: 'My details',
        sub: 'Keep your contact details and away dates current — the scheduler uses them.'
      }));

      var draft = { phone: me.phone, email: me.email, address: me.address, emergencyContact: me.emergencyContact };

      root.appendChild(el('div.grid.c2', [
        UI.card('Contact details', [
          UI.field('Phone', UI.input({ type: 'tel', value: draft.phone, onInput: function (e) { draft.phone = e.target.value; } })),
          UI.field('Email', UI.input({ type: 'email', value: draft.email, onInput: function (e) { draft.email = e.target.value; } })),
          UI.field('Address', UI.input({ value: draft.address, onInput: function (e) { draft.address = e.target.value; } })),
          UI.field('Emergency contact', UI.input({ value: draft.emergencyContact, onInput: function (e) { draft.emergencyContact = e.target.value; } })),
          UI.btn('Save', { variant: 'primary', onClick: function () {
            Store.update({ action: 'person.self.updated', summary: Store.name(me.id) }, function () {
              me.phone = draft.phone; me.email = draft.email;
              me.address = draft.address; me.emergencyContact = draft.emergencyContact;
            });
            UI.flag('Saved', 'Your details are up to date.', 'success');
          } })
        ], { icon: 'user' }),
        UI.card('In the congregation', UI.kv([
          ['Congregation', cong.name],
          ['Service group', (Store.group(me.serviceGroupId) || {}).name],
          ['Group overseer', (Store.group(me.serviceGroupId) || {}).overseerId
            ? UI.person(Store.group(me.serviceGroupId).overseerId) : null],
          ['Publisher type', (S.PUBLISHER_TYPES.filter(function (t) { return t.id === me.publisherType; })[0] || {}).name],
          ['Roles', Auth.roleLabel(me)],
          ['Workspaces', Auth.workspaces().map(function (w) { return w.name; }).join(', ')]
        ]), { icon: 'building' })
      ]));

      if (global.Sync.mode === 'server') {
        root.appendChild(UI.sectionTitle('Sign-in'));
        root.appendChild(UI.card(null, [
          UI.kv([
            ['Signed in as', global.Sync.user ? global.Sync.user.name : '—'],
            ['This device', global.Sync.label()]
          ]),
          el('div.row', { style: 'margin-top:12px' }, [
            UI.btn('Change my password', { icon: 'lock', onClick: function () { Views.profile.changePassword(false); } }),
            UI.btn('Sign out', { variant: 'subtle', icon: 'logout', onClick: function () { global.Sync.logout(); } })
          ])
        ], { icon: 'lock' }));
      }

      root.appendChild(UI.sectionTitle('When I am not available', UI.btn('Add away dates', {
        sm: true, icon: 'plus', onClick: addAway
      })));
      var rows = (me.unavailable || []);
      root.appendChild(rows.length ? UI.table([
        { key: 'from', label: 'From', render: function (r) { return U.fmtDate(r.from); } },
        { key: 'to', label: 'To', render: function (r) { return U.fmtDate(r.to); } },
        { key: 'note', label: 'Note', render: function (r) { return r.note || '—'; } },
        { key: 'actions', label: '', render: function (r) {
          return UI.btn('Remove', { sm: true, variant: 'subtle', onClick: function () {
            Store.update({ action: 'person.away.removed', summary: Store.name(me.id) }, function () {
              me.unavailable = me.unavailable.filter(function (x) { return x !== r; });
            });
          } });
        } }
      ], rows) : UI.empty('No away dates', 'Add holidays or work travel and you will not be scheduled those weeks.'));

      root.appendChild(UI.sectionTitle('What I am marked for'));
      root.appendChild(UI.card(null, [
        el('p.small.muted', { style: 'margin-bottom:8px',
          text: 'Only the elders can change this list — it decides which parts the scheduler proposes you for.' }),
        (me.qualifications || []).length
          ? el('div', me.qualifications.map(function (q) {
            var meta = S.QUALIFICATIONS.filter(function (x) { return x.id === q; })[0];
            return UI.tag(meta ? meta.name : q);
          }))
          : el('div.muted', { text: 'Nothing recorded yet.' })
      ]));

      function addAway() {
        var from = UI.input({ type: 'date', value: U.today() });
        var to = UI.input({ type: 'date', value: U.addDays(U.today(), 7) });
        var note = UI.input({ placeholder: 'Holiday, work, health…' });
        UI.modal({
          title: 'Away dates',
          sub: 'The elders will see this and the scheduler will skip you.',
          body: [el('div.grid.c2', [UI.field('From', from), UI.field('To', to)]), UI.field('Note', note)],
          actions: [{ label: 'Save', variant: 'primary', onClick: function () {
            if (!from.value || !to.value || to.value < from.value) {
              UI.flag('Check the dates', 'The end date must be on or after the start date.', 'danger');
              return false;
            }
            Store.update({ action: 'person.away.added', summary: Store.name(me.id) }, function () {
              me.unavailable = me.unavailable || [];
              me.unavailable.push({ from: from.value, to: to.value, note: note.value.trim() });
            });
          } }]
        });
      }
    },

    /* forced === true when the administrator issued a one-time password */
    changePassword: function (forced) {
      var Sync = global.Sync;
      if (Sync.mode !== 'server') return;
      var current = UI.input({ type: 'password' });
      var next = UI.input({ type: 'password' });
      var again = UI.input({ type: 'password' });
      UI.modal({
        title: forced ? 'Choose your own password' : 'Change my password',
        sub: forced ? 'You signed in with a password an elder issued. Pick one only you know.' : null,
        hideClose: !!forced,
        body: [
          UI.field('Current password', current),
          UI.field('New password', next, 'At least 8 characters.'),
          UI.field('New password again', again)
        ],
        actions: [{ label: 'Save', variant: 'primary', onClick: function () {
          if (next.value.length < 8) { UI.flag('Too short', 'Use at least 8 characters.', 'danger'); return false; }
          if (next.value !== again.value) { UI.flag('They do not match', null, 'danger'); return false; }
          Sync.changePassword({ current: current.value, password: next.value }).then(function () {
            UI.flag('Password changed', null, 'success');
          }, function (err) { UI.flag('Could not change it', err.message, 'danger'); });
          return true;
        } }]
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
