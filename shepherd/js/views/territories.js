/* Territories: the register, check-out / check-in, and the publisher's own list. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var filter = { q: '', status: '', type: '' };
  var DUE_DAYS = 120;

  function statusLoz(t) {
    var s = Store.territoryStatus(t);
    var meta = S.TERRITORY_STATUS.filter(function (x) { return x.id === s; })[0];
    return UI.lozenge(meta ? meta.name : s, meta ? meta.tone : '');
  }

  function checkOut(t) {
    var candidates = U.sortBy(Store.activePeople(), function (p) { return p.lastName; }).map(function (p) {
      var holding = Store.territories().filter(function (x) { return x.assigneeId === p.id; }).length;
      return {
        person: p,
        blocked: false,
        reasons: holding ? [U.plural(holding, 'territory', 'territories') + ' out'] : ['None out'],
        note: UI.personSub(p)
      };
    });
    UI.personPicker({
      title: 'Check out territory ' + t.number,
      sub: t.name + ' — due back in ' + DUE_DAYS + ' days',
      candidates: candidates,
      allowClear: !!t.assigneeId,
      onPick: function (personId) {
        Store.update({
          action: personId ? 'territory.out' : 'territory.in',
          summary: 'Territory ' + t.number + (personId ? ' → ' + Store.name(personId) : ' returned')
        }, function () {
          if (!personId) {
            t.history = t.history || [];
            if (t.assigneeId) {
              t.history.push({ personId: t.assigneeId, from: t.checkedOutOn, to: U.today() });
            }
            t.lastCompletedOn = U.today();
            t.assigneeId = null; t.checkedOutOn = null; t.dueOn = null; t.status = 'available';
          } else {
            t.assigneeId = personId;
            t.checkedOutOn = U.today();
            t.dueOn = U.addDays(U.today(), DUE_DAYS);
            t.status = 'out';
          }
        });
        UI.flag(personId ? 'Checked out' : 'Checked back in', 'Territory ' + t.number, 'success');
      }
    });
  }

  function editTerritory(t) {
    var isNew = !t;
    var draft = t ? U.clone(t) : {
      number: '', name: '', type: 'House-to-house', households: 0, mapUrl: '', notes: '',
      status: 'available', assigneeId: null, checkedOutOn: null, dueOn: null, lastCompletedOn: null, history: []
    };
    UI.modal({
      title: isNew ? 'Add a territory' : 'Territory ' + t.number,
      body: [
        el('div.grid.c2', [
          UI.field('Number', UI.input({ value: draft.number, onInput: function (e) { draft.number = e.target.value; } })),
          UI.field('Type', UI.select(S.TERRITORY_TYPES, draft.type, function (v) { draft.type = v; }))
        ]),
        UI.field('Name / boundaries', UI.input({ value: draft.name, onInput: function (e) { draft.name = e.target.value; } })),
        el('div.grid.c2', [
          UI.field('Households (approx.)', UI.input({ type: 'number', value: draft.households, onInput: function (e) { draft.households = +e.target.value || 0; } })),
          UI.field('Map link', UI.input({ value: draft.mapUrl, placeholder: 'https://…', onInput: function (e) { draft.mapUrl = e.target.value; } }))
        ]),
        UI.field('Notes', UI.textarea({ value: draft.notes, onInput: function (e) { draft.notes = e.target.value; } })),
        UI.checkbox('Restricted — do not work', draft.status === 'do_not_call', function (v) {
          draft.status = v ? 'do_not_call' : 'available';
        })
      ],
      actions: [
        !isNew ? { label: 'Delete', variant: 'danger', onClick: function () {
          Store.update({ action: 'territory.deleted', summary: 'Territory ' + t.number }, function (st) {
            st.territories = st.territories.filter(function (x) { return x.id !== t.id; });
          });
          App.go('territories');
        } } : null,
        { label: 'Save', variant: 'primary', onClick: function () {
          if (!draft.number.trim()) { UI.flag('Number required', null, 'danger'); return false; }
          Store.update({ action: isNew ? 'territory.added' : 'territory.updated', summary: 'Territory ' + draft.number },
            function (st) {
              if (isNew) {
                draft.id = U.uid('terr'); draft.congId = Store.congId(); st.territories.push(draft);
              } else Object.keys(draft).forEach(function (k) { t[k] = draft[k]; });
            });
        } }
      ].filter(Boolean)
    });
  }

  /* ---------- register ---------- */

  Views.territories = {
    title: 'the territory register',
    perm: 'territories.view',
    render: function (root, params) {
      if (params.id) {
        var one = U.by(Store.territories(), params.id);
        if (one) { detail(root, one); return; }
      }
      var canManage = Auth.can('territories.manage');
      var all = Store.territories();
      var overdue = Store.overdueTerritories();

      root.appendChild(UI.pageHead({
        crumbs: [{ label: Store.cong().name }, { label: 'Territories' }],
        title: 'Territories',
        sub: U.plural(all.length, 'territory', 'territories') + ' · '
          + all.filter(function (t) { return Store.territoryStatus(t) === 'out'; }).length + ' out · '
          + overdue.length + ' overdue',
        actions: [
          UI.btn('Export CSV', { variant: 'subtle', icon: 'download', onClick: exportCsv }),
          canManage ? UI.btn('Add territory', { variant: 'primary', icon: 'plus', onClick: function () { editTerritory(null); } }) : null
        ].filter(Boolean)
      }));

      if (overdue.length) {
        root.appendChild(UI.banner('danger', U.plural(overdue.length, 'territory', 'territories') + ' held too long',
          overdue.map(function (t) {
            return t.number + ' (' + Store.name(t.assigneeId) + ', ' + Math.abs(U.diffDays(t.dueOn, U.today())) + ' days over)';
          }).join(' · ')));
      }

      root.appendChild(el('div.grid.c4', [
        UI.stat('Available', all.filter(function (t) { return Store.territoryStatus(t) === 'available'; }).length, 'Ready to hand out'),
        UI.stat('Checked out', all.filter(function (t) { return Store.territoryStatus(t) === 'out'; }).length, 'Being worked'),
        UI.stat('Overdue', overdue.length, 'Past ' + DUE_DAYS + ' days', overdue.length ? 'down' : 'up'),
        UI.stat('Households', U.sum(all, function (t) { return t.households || 0; }), 'Across the territory')
      ]));

      var bar = el('div.row', { style: 'margin:16px 0' }, [
        UI.search('Search number or street', function (v) { filter.q = v; App.render(); }, filter.q),
        UI.select([{ id: '', name: 'Any status' }].concat(S.TERRITORY_STATUS), filter.status, function (v) { filter.status = v; App.render(); }),
        UI.select([{ id: '', name: 'Any type' }].concat(S.TERRITORY_TYPES), filter.type, function (v) { filter.type = v; App.render(); })
      ]);
      U.$$('select', bar).forEach(function (s) { s.style.maxWidth = '180px'; });
      root.appendChild(bar);

      var rows = all.filter(function (t) {
        if (filter.q && !U.matches(t.number + ' ' + t.name, filter.q)) return false;
        if (filter.status && Store.territoryStatus(t) !== filter.status) return false;
        if (filter.type && t.type !== filter.type) return false;
        return true;
      });

      root.appendChild(UI.table([
        { key: 'number', label: 'No.', sort: function (t) { return t.number; },
          render: function (t) { return el('strong', { text: t.number }); } },
        { key: 'name', label: 'Boundaries', sort: function (t) { return t.name; } },
        { key: 'type', label: 'Type', sort: function (t) { return t.type; } },
        { key: 'status', label: 'Status', sort: function (t) { return Store.territoryStatus(t); }, render: statusLoz },
        { key: 'who', label: 'Held by', render: function (t) { return t.assigneeId ? UI.person(t.assigneeId) : el('span.muted', { text: '—' }); } },
        { key: 'due', label: 'Due', sort: function (t) { return t.dueOn || '9999'; },
          render: function (t) {
            if (!t.dueOn) return '—';
            var over = t.dueOn < U.today();
            return el('span', { style: over ? 'color:var(--R400);font-weight:600' : '', text: U.fmtDate(t.dueOn) });
          } },
        { key: 'last', label: 'Last worked', sort: function (t) { return t.lastCompletedOn || '0'; },
          render: function (t) { return t.lastCompletedOn ? U.fmtDate(t.lastCompletedOn) : '—'; } },
        { key: 'actions', label: '', render: function (t) {
          if (!Auth.can('territories.manage')) return el('span');
          return el('div.row', [
            UI.btn(t.assigneeId ? 'Check in' : 'Check out', { sm: true, onClick: function () { checkOut(t); } })
          ]);
        } }
      ], rows, { sortKey: 'number', empty: 'No territories match.', onRow: function (t) { App.go('territories', t.id); } }));
    }
  };

  function detail(root, t) {
    root.appendChild(UI.pageHead({
      crumbs: [{ label: 'Territories', href: App.href('territories') }, { label: 'Territory ' + t.number }],
      title: 'Territory ' + t.number + ' — ' + t.name,
      sub: t.type + ' · ' + U.plural(t.households || 0, 'household'),
      actions: [
        Auth.can('territories.manage') ? UI.btn(t.assigneeId ? 'Check in' : 'Check out',
          { variant: 'primary', icon: 'map', onClick: function () { checkOut(t); } }) : null,
        Auth.can('territories.manage') ? UI.btn('Edit', { icon: 'edit', onClick: function () { editTerritory(t); } }) : null
      ].filter(Boolean)
    }));

    root.appendChild(el('div.grid.c2', [
      UI.card('Current status', UI.kv([
        ['Status', statusLoz(t)],
        ['Held by', t.assigneeId ? UI.person(t.assigneeId) : null],
        ['Checked out', t.checkedOutOn ? U.fmtDate(t.checkedOutOn, 'long') : null],
        ['Due back', t.dueOn ? U.fmtDate(t.dueOn, 'long') : null],
        ['Last completed', t.lastCompletedOn ? U.fmtDate(t.lastCompletedOn, 'long') : null],
        ['Map', t.mapUrl ? el('a', { href: t.mapUrl, target: '_blank', rel: 'noopener', text: 'Open the map' }) : null],
        ['Notes', t.notes || null]
      ]), { icon: 'map' }),
      UI.card('History', (t.history && t.history.length)
        ? el('ul.timeline', U.sortBy(t.history, function (h) { return h.to; }, 'desc').map(function (h) {
          return el('li', [
            el('strong', { text: Store.name(h.personId) }),
            el('div.small.muted', { text: U.fmtDate(h.from) + ' → ' + U.fmtDate(h.to) + ' (' + U.diffDays(h.from, h.to) + ' days)' })
          ]);
        }))
        : el('div.muted', { text: 'No completed rounds recorded yet.' }), { icon: 'clock' })
    ]));
  }

  function exportCsv() {
    var rows = [['Number', 'Boundaries', 'Type', 'Status', 'Held by', 'Checked out', 'Due', 'Last worked', 'Households']];
    Store.territories().forEach(function (t) {
      rows.push([t.number, t.name, t.type, Store.territoryStatus(t),
        t.assigneeId ? Store.name(t.assigneeId) : '', t.checkedOutOn || '', t.dueOn || '',
        t.lastCompletedOn || '', t.households || 0]);
    });
    U.download('territories-' + U.today() + '.csv', U.csv(rows), 'text/csv');
  }

  /* ---------- publisher's own ---------- */

  Views['my-territories'] = {
    title: 'your territories',
    render: function (root) {
      var me = Auth.me();
      var mine = Store.territories().filter(function (t) { return t.assigneeId === me.id; });

      root.appendChild(UI.pageHead({
        title: 'My territories',
        sub: 'Hand a territory back when you have covered it so it can go out again.'
      }));

      if (!mine.length) {
        root.appendChild(UI.empty('No territory checked out',
          'Ask the territory servant for one — they appear here as soon as it is signed out to you.'));
      } else {
        root.appendChild(el('div.grid.c2', mine.map(function (t) {
          var over = Store.territoryStatus(t) === 'overdue';
          return UI.card('Territory ' + t.number + ' — ' + t.name, [
            UI.kv([
              ['Type', t.type],
              ['Households', String(t.households || '—')],
              ['Checked out', U.fmtDate(t.checkedOutOn, 'long')],
              ['Due back', el('span', { style: over ? 'color:var(--R400);font-weight:600' : '', text: U.fmtDate(t.dueOn, 'long') })],
              ['Map', t.mapUrl ? el('a', { href: t.mapUrl, target: '_blank', rel: 'noopener', text: 'Open' }) : null]
            ]),
            over ? UI.banner('danger', 'This is overdue', 'Please return it or ask for an extension.') : null,
            el('div', { style: 'margin-top:12px' }, UI.btn('Hand it back', {
              icon: 'check',
              onClick: function () {
                UI.confirm({ title: 'Return territory ' + t.number + '?',
                  body: 'It is marked as worked today and goes back into the pool.', confirmLabel: 'Hand it back' },
                function () {
                  Store.update({ action: 'territory.in', summary: 'Territory ' + t.number + ' returned by ' + Store.name(me.id) },
                    function () {
                      t.history = t.history || [];
                      t.history.push({ personId: me.id, from: t.checkedOutOn, to: U.today() });
                      t.lastCompletedOn = U.today();
                      t.assigneeId = null; t.checkedOutOn = null; t.dueOn = null; t.status = 'available';
                    });
                  UI.flag('Thank you', 'Territory ' + t.number + ' is back in the register.', 'success');
                });
              }
            }))
          ], { icon: 'map' });
        })));
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
