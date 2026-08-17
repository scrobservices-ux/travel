/* Publisher directory and the individual record card. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var filter = { q: '', group: '', status: 'active', type: '' };

  /* ---------- directory ---------- */

  function directory(root) {
    var canEdit = Auth.can('publishers.edit');
    root.appendChild(UI.pageHead({
      crumbs: [{ label: Store.cong().name }, { label: 'Publishers' }],
      title: 'Publishers',
      sub: U.plural(Auth.peopleInScope('publishers.view').length, 'person', 'people')
        + (Auth.scope('publishers.view') === 'group' ? ' in your service group' : ' on the roll'),
      actions: [
        UI.btn('Export CSV', { variant: 'subtle', icon: 'download', onClick: exportCsv }),
        canEdit ? UI.btn('Add publisher', { variant: 'primary', icon: 'plus', onClick: function () { editPerson(null); } }) : null
      ].filter(Boolean)
    }));

    var bar = el('div.row', { style: 'margin-bottom:16px' }, [
      UI.search('Search by name', function (v) { filter.q = v; App.render(); }, filter.q),
      UI.select([{ id: '', name: 'All groups' }].concat(Store.groups()), filter.group, function (v) { filter.group = v; App.render(); }),
      UI.select([{ id: '', name: 'Any status' }].concat(S.STATUSES), filter.status, function (v) { filter.status = v; App.render(); }),
      UI.select([{ id: '', name: 'Any type' }].concat(S.PUBLISHER_TYPES), filter.type, function (v) { filter.type = v; App.render(); })
    ]);
    U.$$('select', bar).forEach(function (s) { s.style.maxWidth = '170px'; });
    root.appendChild(bar);

    var scoped = Auth.peopleInScope('publishers.view');
    var scopeNote = Auth.scopeLabel('publishers.view');
    if (scopeNote) {
      root.appendChild(UI.banner('neutral', 'You are seeing ' + scopeNote,
        'Your congregation has given the group overseer these records for his own group. The secretary or coordinator sees everyone.'));
    }
    var rows = scoped.filter(function (p) {
      if (filter.q && !U.matches(Store.name(p.id) + ' ' + p.email + ' ' + p.phone, filter.q)) return false;
      if (filter.group && p.serviceGroupId !== filter.group) return false;
      if (filter.status && p.status !== filter.status) return false;
      if (filter.type && p.publisherType !== filter.type) return false;
      return true;
    });

    var lastPeriod = U.prevPeriod(U.period(U.today()));

    root.appendChild(UI.table([
      { key: 'name', label: 'Name', sort: function (p) { return p.lastName + p.firstName; },
        render: function (p) { return UI.person(p.id, { sub: true, size: '' }); } },
      { key: 'type', label: 'Type', sort: function (p) { return p.publisherType; },
        render: function (p) {
          var t = S.PUBLISHER_TYPES.filter(function (x) { return x.id === p.publisherType; })[0];
          return UI.lozenge(t ? t.short : p.publisherType, p.publisherType === 'regular' ? 'inprogress' : '');
        } },
      { key: 'group', label: 'Group', sort: function (p) { return (Store.group(p.serviceGroupId) || {}).name || ''; },
        render: function (p) { return (Store.group(p.serviceGroupId) || {}).name || '—'; } },
      { key: 'status', label: 'Status', sort: function (p) { return p.status; },
        render: function (p) { return UI.statusLozenge(S.STATUSES, p.status); } },
      { key: 'report', label: U.periodLabel(lastPeriod), sort: function (p) { return Store.report(p.id, lastPeriod) ? 1 : 0; },
        render: function (p) {
          var r = Store.report(p.id, lastPeriod);
          if (!r) return UI.lozenge('Not in', 'warn');
          return UI.lozenge(r.shared ? 'Reported' : 'No activity', r.shared ? 'success' : '');
        } },
      { key: 'quiet', label: 'Months quiet', num: true, sort: function (p) { return Store.inactiveMonths(p.id); },
        render: function (p) {
          var n = Store.inactiveMonths(p.id);
          return n >= 2 ? UI.lozenge(String(n), n >= 6 ? 'removed' : 'warn') : String(n);
        } },
      { key: 'contact', label: 'Contact', render: function (p) {
        return el('div.small', [
          p.phone ? el('div', { text: p.phone }) : null,
          p.email ? el('div.muted.trunc', { style: 'max-width:180px', text: p.email }) : null
        ]);
      } }
    ], rows, {
      sortKey: 'name',
      empty: 'No one matches those filters.',
      onRow: function (p) { App.go('publishers', p.id); }
    }));

    /* service groups */
    if (Auth.scope('publishers.view') !== 'all') return;
    root.appendChild(UI.sectionTitle('Service groups', canEdit
      ? UI.btn('Add group', { sm: true, icon: 'plus', onClick: function () { editGroup(null); } }) : null));
    var grid = el('div.grid.c3');
    Store.groups().forEach(function (g) {
      var members = Store.people().filter(function (p) { return p.serviceGroupId === g.id; });
      grid.appendChild(UI.card(g.name, [
        UI.kv([
          ['Overseer', g.overseerId ? UI.person(g.overseerId) : null],
          ['Assistant', g.assistantId ? UI.person(g.assistantId) : null],
          ['Members', U.plural(members.length, 'publisher')]
        ]),
        canEdit ? el('div', { style: 'margin-top:12px' },
          UI.btn('Edit', { sm: true, variant: 'subtle', icon: 'edit', onClick: function () { editGroup(g); } })) : null
      ], { icon: 'people' }));
    });
    root.appendChild(grid);
  }

  /* ---------- record card ---------- */

  function record(root, person) {
    var canEdit = Auth.can('publishers.edit');
    var me = Auth.me();
    root.appendChild(UI.pageHead({
      crumbs: [{ label: 'Publishers', href: App.href('publishers') }, { label: Store.name(person.id) }],
      title: Store.name(person.id),
      sub: UI.personSub(person),
      actions: [
        Auth.can('shepherding.view') ? UI.btn('Record a visit', { icon: 'heart', onClick: function () {
          Views.shepherding.newVisit(person.id);
        } }) : null,
        canEdit ? UI.btn('Edit record', { variant: 'primary', icon: 'edit', onClick: function () { editPerson(person); } }) : null
      ].filter(Boolean)
    }));

    var cols = el('div.grid.c2');

    /* details */
    cols.appendChild(UI.card('Record card', [
      UI.kv([
        ['Status', UI.statusLozenge(S.STATUSES, person.status)],
        ['Publisher type', (S.PUBLISHER_TYPES.filter(function (t) { return t.id === person.publisherType; })[0] || {}).name],
        ['Appointment', person.appointment === 'none' ? 'None' : U.titleCase(person.appointment)],
        ['Roles', Auth.roleLabel(person)],
        ['Service group', (Store.group(person.serviceGroupId) || {}).name],
        ['Baptized', person.baptizedOn ? U.fmtDate(person.baptizedOn) : 'Not baptized'],
        ['Date of birth', person.birthOn ? U.fmtDate(person.birthOn) : null],
        ['Phone', person.phone],
        ['Email', person.email],
        ['Address', person.address],
        ['Emergency contact', person.emergencyContact]
      ])
    ], { icon: 'user' }));

    /* qualifications */
    var qualCard = el('div');
    if (canEdit) {
      var grid = el('div.checkgrid');
      S.QUALIFICATIONS.forEach(function (q) {
        grid.appendChild(UI.checkbox(q.name, (person.qualifications || []).indexOf(q.id) !== -1, function (v) {
          Store.update({ action: 'person.qualifications', summary: Store.name(person.id) + ' — ' + q.name + (v ? ' added' : ' removed') },
            function () {
              var list = person.qualifications || (person.qualifications = []);
              if (v && list.indexOf(q.id) === -1) list.push(q.id);
              if (!v) person.qualifications = list.filter(function (x) { return x !== q.id; });
            });
        }));
      });
      qualCard.appendChild(grid);
    } else {
      qualCard.appendChild(el('div', (person.qualifications || []).map(function (q) {
        var meta = S.QUALIFICATIONS.filter(function (x) { return x.id === q; })[0];
        return UI.tag(meta ? meta.name : q);
      })));
    }
    cols.appendChild(UI.card('Qualifications', [
      el('p.small.muted', { style: 'margin-bottom:8px',
        text: 'The scheduler only proposes someone for a part they are marked for here.' }),
      qualCard
    ], { icon: 'check' }));

    root.appendChild(cols);

    /* service record */
    root.appendChild(UI.sectionTitle('Field service record'));
    var sy = U.serviceYear(U.period(U.today()));
    var periods = U.serviceYearPeriods(sy);
    var recs = periods.map(function (p) {
      var r = Store.report(person.id, p);
      return { period: p, report: r };
    });
    root.appendChild(UI.table([
      { key: 'period', label: 'Month', render: function (r) { return U.periodLabel(r.period); } },
      { key: 'shared', label: 'Shared in the ministry', render: function (r) {
        if (!r.report) return el('span.muted', { text: r.period <= U.period(U.today()) ? 'Not handed in' : '—' });
        return UI.lozenge(r.report.shared ? 'Yes' : 'No', r.report.shared ? 'success' : '');
      } },
      { key: 'studies', label: 'Bible studies', num: true, render: function (r) { return r.report ? String(r.report.studies || 0) : '—'; } },
      { key: 'hours', label: 'Hours (pioneers)', num: true, render: function (r) { return r.report && r.report.hours != null ? String(r.report.hours) : '—'; } },
      { key: 'comments', label: 'Comments', render: function (r) { return r.report && r.report.comments ? r.report.comments : '—'; } }
    ], recs, { empty: 'No record yet for this service year.' }));

    var yearReports = recs.filter(function (r) { return r.report && r.report.shared; });
    root.appendChild(el('div.grid.c4', { style: 'margin-top:16px' }, [
      UI.stat('Months reported', yearReports.length, 'Service year ' + (sy - 1) + '/' + sy),
      UI.stat('Bible studies', U.sum(yearReports, function (r) { return r.report.studies || 0; }), 'Total this year'),
      UI.stat('Hours', U.sum(yearReports, function (r) { return r.report.hours || 0; }), 'Pioneer hours only'),
      UI.stat('Months quiet', Store.inactiveMonths(person.id), 'Since the last report')
    ]));

    /* assignments */
    root.appendChild(UI.sectionTitle('Assignments'));
    var assigns = Store.assignmentsFor(person.id, {});
    root.appendChild(UI.table([
      { key: 'date', label: 'Date', sort: function (r) { return r.date; }, render: function (r) { return U.fmtDate(r.date, 'day'); } },
      { key: 'what', label: 'Assignment', render: function (r) {
        return r.duty ? S.dutyType(r.duty.type, Store.cong()).name : r.part.title + (r.role === 'assistant' ? ' (assistant)' : '');
      } },
      { key: 'meeting', label: 'Meeting', render: function (r) { return r.meeting === 'midweek' ? 'Midweek' : 'Weekend'; } },
      { key: 'status', label: 'Status', render: function (r) {
        return r.duty ? UI.lozenge('Duty', 'moved') : UI.statusLozenge(S.PART_STATUS, r.part.status);
      } }
    ], assigns, { sortKey: 'date', sortDir: 'desc', empty: 'No assignments recorded.' }));

    /* availability */
    var av = S.availabilityOf(person);
    root.appendChild(UI.sectionTitle('Availability', canEdit
      ? UI.btn('Change', { sm: true, icon: 'edit', onClick: function () {
        Views.fairness.availabilityEditor(person);
      } }) : null));
    root.appendChild(UI.card(null, [
      el('p.small.muted', { style: 'margin-bottom:10px',
        text: 'The scheduler only proposes this person when these allow it.' }),
      el('div.row', [
        UI.lozenge('Midweek: ' + (av.midweek ? 'yes' : 'no'), av.midweek ? 'success' : 'removed'),
        UI.lozenge('Weekend: ' + (av.weekend ? 'yes' : 'no'), av.weekend ? 'success' : 'removed'),
        UI.lozenge('Duty rota: ' + (av.duties ? 'yes' : 'no'), av.duties ? 'success' : 'removed'),
        UI.lozenge(av.maxPerMonth == null ? 'No monthly limit' : 'At most ' + av.maxPerMonth + ' a month',
          av.maxPerMonth == null ? '' : 'warn')
      ]),
      av.notes ? el('p.small', { style: 'margin-top:10px', text: '“' + av.notes + '”' }) : null
    ]));

    root.appendChild(UI.sectionTitle('Away dates', (canEdit || me.id === person.id)
      ? UI.btn('Add', { sm: true, icon: 'plus', onClick: function () { addAway(person); } }) : null));
    root.appendChild(awayList(person, canEdit || me.id === person.id));

    /* shepherding */
    if (Auth.reaches('shepherding.view', person.id)) {
      var visits = Store.visits().filter(function (v) { return v.personId === person.id; });
      root.appendChild(UI.sectionTitle('Shepherding history'));
      root.appendChild(UI.card(null, [
        UI.banner('neutral', 'Confidential', 'Visible to the body of elders only.'),
        visits.length ? el('ul.timeline', U.sortBy(visits, function (v) { return v.date; }, 'desc').map(function (v) {
          return el('li', [
            el('strong', { text: U.titleCase(v.type) + ' — ' + U.fmtDate(v.date, 'long') }),
            el('div.small.muted', { text: v.elderIds.map(function (id) { return Store.name(id); }).join(' & ') }),
            el('p', { style: 'margin-top:4px', text: v.notes })
          ]);
        })) : el('div.muted', { text: 'No visits recorded.' })
      ]));
    }
  }

  function awayList(person, canEdit) {
    var rows = (person.unavailable || []).slice();
    if (!rows.length) return UI.empty('No away dates', 'Add holidays or work travel and the scheduler will skip those weeks.');
    return UI.table([
      { key: 'from', label: 'From', render: function (r) { return U.fmtDate(r.from); } },
      { key: 'to', label: 'To', render: function (r) { return U.fmtDate(r.to); } },
      { key: 'note', label: 'Note', render: function (r) { return r.note || '—'; } },
      { key: 'actions', label: '', render: function (r) {
        if (!canEdit) return el('span');
        return UI.btn('Remove', { sm: true, variant: 'subtle', onClick: function () {
          Store.update({ action: 'person.away.removed', summary: Store.name(person.id) }, function () {
            person.unavailable = person.unavailable.filter(function (x) { return x !== r; });
          });
        } });
      } }
    ], rows);
  }

  function addAway(person) {
    var from = UI.input({ type: 'date', value: U.today() });
    var to = UI.input({ type: 'date', value: U.addDays(U.today(), 7) });
    var note = UI.input({ placeholder: 'Holiday, work, health…' });
    UI.modal({
      title: 'Away dates',
      sub: Store.name(person.id) + ' will be skipped by the scheduler between these dates.',
      body: [el('div.grid.c2', [UI.field('From', from), UI.field('To', to)]), UI.field('Note', note)],
      actions: [{ label: 'Save', variant: 'primary', onClick: function () {
        if (!from.value || !to.value || to.value < from.value) {
          UI.flag('Check the dates', 'The end date must be on or after the start date.', 'danger');
          return false;
        }
        Store.update({ action: 'person.away.added', summary: Store.name(person.id) + ' away ' + from.value + '–' + to.value },
          function () {
            person.unavailable = person.unavailable || [];
            person.unavailable.push({ from: from.value, to: to.value, note: note.value.trim() });
          });
      } }]
    });
  }

  /* ---------- editors ---------- */

  function editPerson(person) {
    var isNew = !person;
    var p = person || {
      firstName: '', lastName: '', gender: 'm', appointment: 'none', roles: ['publisher'],
      qualifications: [], publisherType: 'publisher', status: 'active', email: '', phone: '',
      address: '', baptizedOn: '', birthOn: '', serviceGroupId: (Store.groups()[0] || {}).id,
      emergencyContact: '', unavailable: [], notes: ''
    };
    var draft = U.clone(p);

    function input(key, opts) {
      return UI.input(Object.assign({ value: draft[key] || '', onInput: function (e) { draft[key] = e.target.value; } }, opts || {}));
    }

    var rolesGrid = el('div.checkgrid');
    S.ROLES.filter(function (r) { return r.id !== 'publisher'; }).forEach(function (r) {
      rolesGrid.appendChild(UI.checkbox(r.name, (draft.roles || []).indexOf(r.id) !== -1, function (v) {
        draft.roles = (draft.roles || []).filter(function (x) { return x !== r.id; });
        if (v) draft.roles.push(r.id);
      }));
    });

    UI.modal({
      wide: true,
      title: isNew ? 'Add a publisher' : 'Edit ' + Store.name(p.id),
      body: [
        el('div.grid.c2', [
          UI.field('First name', input('firstName')),
          UI.field('Last name', input('lastName'))
        ]),
        el('div.grid.c3', [
          UI.field('Gender', UI.select([{ id: 'm', name: 'Brother' }, { id: 'f', name: 'Sister' }], draft.gender, function (v) { draft.gender = v; })),
          UI.field('Publisher type', UI.select(S.PUBLISHER_TYPES, draft.publisherType, function (v) { draft.publisherType = v; })),
          UI.field('Status', UI.select(S.STATUSES, draft.status, function (v) { draft.status = v; }))
        ]),
        el('div.grid.c3', [
          UI.field('Appointment', UI.select([{ id: 'none', name: 'None' }, { id: 'servant', name: 'Ministerial servant' }, { id: 'elder', name: 'Elder' }],
            draft.appointment, function (v) { draft.appointment = v; })),
          UI.field('Service group', UI.select(Store.groups(), draft.serviceGroupId, function (v) { draft.serviceGroupId = v; })),
          UI.field('Baptism date', input('baptizedOn', { type: 'date' }))
        ]),
        el('div.grid.c2', [
          UI.field('Phone', input('phone', { type: 'tel' })),
          UI.field('Email', input('email', { type: 'email' }))
        ]),
        UI.field('Address', input('address')),
        el('div.grid.c2', [
          UI.field('Date of birth', input('birthOn', { type: 'date' })),
          UI.field('Emergency contact', input('emergencyContact'))
        ]),
        el('fieldset', [el('legend', { text: 'Roles — these decide which workspaces and pages this person can open' }), rolesGrid])
      ],
      actions: [
        !isNew ? { label: 'Remove from the roll', variant: 'danger', onClick: function () {
          UI.confirm({ title: 'Remove ' + Store.name(p.id) + '?',
            body: 'The record is deleted. Reports and assignment history stay in the ledger.', danger: true, confirmLabel: 'Remove' },
          function () {
            Store.update({ action: 'person.removed', summary: Store.name(p.id) }, function (st) {
              st.people = st.people.filter(function (x) { return x.id !== p.id; });
            });
            App.go('publishers');
          });
        } } : null,
        { label: isNew ? 'Add' : 'Save', variant: 'primary', onClick: function () {
          if (!draft.firstName.trim() || !draft.lastName.trim()) {
            UI.flag('Name required', 'Enter a first and last name.', 'danger');
            return false;
          }
          if (draft.roles.indexOf('publisher') === -1) draft.roles.push('publisher');
          Store.update({ action: isNew ? 'person.added' : 'person.updated', summary: draft.firstName + ' ' + draft.lastName },
            function (st) {
              // every publisher belongs to a service group; make the first one if needed
              if (!draft.serviceGroupId || !U.by(st.groups, draft.serviceGroupId)) {
                var g = st.groups.filter(function (x) { return x.congId === Store.congId(); })[0];
                if (!g) {
                  g = { id: U.uid('grp'), congId: Store.congId(), name: 'Group 1',
                    overseerId: null, assistantId: null };
                  st.groups.push(g);
                }
                draft.serviceGroupId = g.id;
              }
              if (isNew) {
                draft.id = U.uid('p');
                draft.congId = Store.congId();
                draft.createdAt = Date.now();
                st.people.push(draft);
              } else {
                Object.keys(draft).forEach(function (k) { p[k] = draft[k]; });
              }
            });
          UI.flag('Saved', draft.firstName + ' ' + draft.lastName, 'success');
        } }
      ].filter(Boolean)
    });
  }

  function editGroup(group) {
    var isNew = !group;
    var draft = group ? U.clone(group) : { name: '', overseerId: null, assistantId: null };
    var elders = Store.people().filter(function (p) { return p.appointment === 'elder' || p.appointment === 'servant'; });
    var opts = [{ id: '', name: '—' }].concat(elders.map(function (p) { return { id: p.id, name: Store.name(p.id) }; }));
    UI.modal({
      title: isNew ? 'Add a service group' : 'Edit group',
      body: [
        UI.field('Name', UI.input({ value: draft.name, onInput: function (e) { draft.name = e.target.value; } })),
        el('div.grid.c2', [
          UI.field('Group overseer', UI.select(opts, draft.overseerId || '', function (v) { draft.overseerId = v || null; })),
          UI.field('Assistant', UI.select(opts, draft.assistantId || '', function (v) { draft.assistantId = v || null; }))
        ])
      ],
      actions: [
        !isNew ? { label: 'Delete', variant: 'danger', onClick: function () {
          Store.update({ action: 'group.deleted', summary: group.name }, function (st) {
            st.groups = st.groups.filter(function (g) { return g.id !== group.id; });
          });
        } } : null,
        { label: 'Save', variant: 'primary', onClick: function () {
          if (!draft.name.trim()) return false;
          Store.update({ action: isNew ? 'group.added' : 'group.updated', summary: draft.name }, function (st) {
            if (isNew) {
              draft.id = U.uid('grp'); draft.congId = Store.congId(); st.groups.push(draft);
            } else Object.keys(draft).forEach(function (k) { group[k] = draft[k]; });
          });
        } }
      ].filter(Boolean)
    });
  }

  function exportCsv() {
    var rows = [['Last name', 'First name', 'Type', 'Status', 'Appointment', 'Group', 'Phone', 'Email', 'Baptized', 'Months quiet']];
    Store.people().forEach(function (p) {
      rows.push([p.lastName, p.firstName, p.publisherType, p.status, p.appointment,
        (Store.group(p.serviceGroupId) || {}).name || '', p.phone, p.email, p.baptizedOn || '',
        Store.inactiveMonths(p.id)]);
    });
    U.download('publishers-' + U.today() + '.csv', U.csv(rows), 'text/csv');
  }

  Views.publishers = {
    title: 'the publisher records',
    perm: 'publishers.view',
    render: function (root, params) {
      var person = params.id ? Store.person(params.id) : null;
      if (params.id && !person) {
        root.appendChild(UI.empty('No such publisher', 'The record may have been removed.'));
        return;
      }
      if (person && !Auth.reaches('publishers.view', person.id)) {
        root.appendChild(UI.empty('Not in your service group',
          'Your congregation has given you publisher records for ' + (Auth.scopeLabel('publishers.view') || 'your own group') + '.'));
        return;
      }
      if (person) record(root, person);
      else directory(root);
    },
    editPerson: editPerson
  };
})(typeof window !== 'undefined' ? window : globalThis);
