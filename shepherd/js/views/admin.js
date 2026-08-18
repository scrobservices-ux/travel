/* Administration: the account owner's view — congregations, users and roles,
   where meeting programs come from, subscription, backups and the audit log. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App, Seed = global.Seed;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var PERM = 'admin.manage';

  /* ---------- overview ---------- */

  Views.admin = {
    title: 'the account overview',
    perm: PERM,
    render: function (root) {
      var st = Store.state;
      var plan = S.plan(st.account.plan);
      var totalPeople = st.people.length;

      root.appendChild(UI.pageHead({
        crumbs: [{ label: 'Administration' }],
        title: st.account.name,
        sub: 'Account owner view — everything below spans all congregations on this account.',
        actions: [UI.btn('Add a congregation', { variant: 'primary', icon: 'plus', onClick: addCongregation })]
      }));

      root.appendChild(el('div.grid.c4', [
        UI.stat('Congregations', st.congregations.length, 'Plan allows ' + plan.limits.congregations),
        UI.stat('People on the roll', totalPeople, 'Across all congregations'),
        UI.stat('Plan', plan.name, plan.price ? '£' + plan.price + ' / ' + plan.period : 'No charge'),
        UI.stat('Storage', Math.round(JSON.stringify(st).length / 1024) + ' KB', 'In this browser')
      ]));

      root.appendChild(UI.sectionTitle('Congregations'));
      root.appendChild(UI.table([
        { key: 'name', label: 'Congregation', render: function (c) {
          return el('div', [el('strong', { text: c.name }), el('div.small.muted', { text: [c.number, c.city].filter(Boolean).join(' · ') })]);
        } },
        { key: 'people', label: 'Publishers', num: true, render: function (c) {
          return String(Store.state.people.filter(function (p) { return p.congId === c.id; }).length);
        } },
        { key: 'plan', label: 'Plan', render: function (c) { return S.plan(c.subscription.plan).name; } },
        { key: 'status', label: 'Status', render: function (c) {
          return UI.lozenge(U.titleCase(c.subscription.status), c.subscription.status === 'active' ? 'success' : 'warn');
        } },
        { key: 'actions', label: '', render: function (c) {
          return el('div.row', [
            UI.btn('Open', { sm: true, onClick: function () { Store.setCong(c.id); Auth.setWorkspace('elders'); App.go('dashboard'); } }),
            UI.btn('Settings', { sm: true, variant: 'subtle', onClick: function () { App.go('admin-congregations', c.id); } })
          ]);
        } }
      ], st.congregations));

      root.appendChild(UI.sectionTitle('Recent activity'));
      root.appendChild(auditTable(st.audit.slice(0, 12)));
    }
  };

  /* ---------- congregations ---------- */

  Views['admin-congregations'] = {
    title: 'congregation settings',
    perm: PERM,
    render: function (root, params) {
      var st = Store.state;
      var cong = params.id ? U.by(st.congregations, params.id) : Store.cong();
      if (!cong) { root.appendChild(UI.empty('No such congregation')); return; }

      root.appendChild(UI.pageHead({
        crumbs: [{ label: 'Administration', href: App.href('admin') }, { label: cong.name }],
        title: cong.name,
        sub: 'Meeting times, report deadline and the details used on printed schedules.',
        actions: [
          UI.btn('Add a congregation', { icon: 'plus', onClick: addCongregation }),
          st.congregations.length > 1 ? UI.btn('Delete', { variant: 'danger', icon: 'trash', onClick: function () {
            UI.confirm({ title: 'Delete ' + cong.name + '?', danger: true, confirmLabel: 'Delete everything',
              body: 'Every publisher record, schedule, report and territory for this congregation is removed. This cannot be undone.' },
            function () {
              Store.update({ action: 'congregation.deleted', summary: cong.name }, function (s) {
                ['people', 'groups', 'weeks', 'duties', 'territories', 'reports', 'attendance',
                  'tasks', 'visits', 'transactions', 'announcements'].forEach(function (k) {
                  s[k] = s[k].filter(function (r) { return r.congId !== cong.id; });
                });
                s.congregations = s.congregations.filter(function (c) { return c.id !== cong.id; });
                if (s.session.congId === cong.id) s.session.congId = s.congregations[0].id;
              });
              App.go('admin');
            });
          } }) : null
        ].filter(Boolean)
      }));

      var draft = U.clone(cong);
      function inp(key, opts) {
        return UI.input(Object.assign({ value: draft[key] || '', onInput: function (e) { draft[key] = e.target.value; } }, opts || {}));
      }

      root.appendChild(el('div.grid.c2', [
        UI.card('Details', [
          UI.field('Name', inp('name')),
          el('div.grid.c2', [UI.field('Congregation number', inp('number')), UI.field('Circuit', inp('circuit'))]),
          el('div.grid.c2', [UI.field('City', inp('city')), UI.field('Country', inp('country'))]),
          UI.field('Kingdom Hall address', inp('hallAddress')),
          el('div.grid.c2', [
            UI.field('Language', inp('language')),
            UI.field('Currency symbol', inp('currency'))
          ])
        ], { icon: 'building' }),
        UI.card('Meetings & deadlines', [
          el('strong', { text: 'Midweek meeting' }),
          el('div.grid.c2', [
            UI.field('Day', UI.select(U.DAYS.map(function (d, i) { return { id: String(i), name: d }; }),
              String(draft.meetings.midweek.dow), function (v) { draft.meetings.midweek.dow = +v; })),
            UI.field('Time', UI.input({ type: 'time', value: draft.meetings.midweek.time,
              onInput: function (e) { draft.meetings.midweek.time = e.target.value; } }))
          ]),
          el('strong', { text: 'Weekend meeting' }),
          el('div.grid.c2', [
            UI.field('Day', UI.select(U.DAYS.map(function (d, i) { return { id: String(i), name: d }; }),
              String(draft.meetings.weekend.dow), function (v) { draft.meetings.weekend.dow = +v; })),
            UI.field('Time', UI.input({ type: 'time', value: draft.meetings.weekend.time,
              onInput: function (e) { draft.meetings.weekend.time = e.target.value; } }))
          ]),
          UI.field('Field service report due by (day of month)',
            UI.input({ type: 'number', min: 1, max: 28, value: draft.reportDueDay,
              onInput: function (e) { draft.reportDueDay = +e.target.value || 6; } }))
        ], { icon: 'calendar' })
      ]));

      /* how this congregation wants to be scheduled */
      var active = Store.state.people.filter(function (p) {
        return p.congId === cong.id && (p.status === 'active' || p.status === 'irregular');
      }).length;
      var sched = Object.assign({}, S.DEFAULT_SCHEDULING, cong.scheduling || {});
      var resolved = S.schedulingFor(cong, active);
      var schedBox = el('div');

      function drawSched() {
        U.clear(schedBox);
        var r = S.schedulingFor(Object.assign({}, cong, { scheduling: sched }), active);
        schedBox.appendChild(UI.banner(r.automatic ? 'neutral' : 'inprogress',
          r.profile.name + (r.automatic ? ' — chosen from your ' + U.plural(active, 'active publisher') : ' — set by hand'),
          r.profile.note));
        schedBox.appendChild(UI.kv([
          ['Most on one meeting', String(r.maxPerMeeting)],
          ['Most in one week', String(r.maxPerWeek)],
          ['Fairness looks back', U.plural(r.windowWeeks, 'week')],
          ['A pool counts as thin under', U.plural(r.thinThreshold, 'person', 'people')]
        ]));
      }

      root.appendChild(UI.sectionTitle('How this congregation is scheduled'));
      root.appendChild(UI.card(null, [
        el('p.small.muted', { style: 'margin-bottom:12px',
          text: 'What is fair depends on how many publishers there are. In a small congregation the same brother '
            + 'takes several parts a meeting because there is nobody else; in a large one he should have one a week. '
            + 'This is picked from your numbers unless you set it yourself.' }),
        UI.field('Congregation size', UI.select(
          [{ id: 'auto', name: 'Work it out from the number of publishers' }].concat(
            S.SIZE_PROFILES.map(function (x) { return { id: x.id, name: x.name }; })),
          sched.profile, function (v) { sched.profile = v; drawSched(); })),
        el('div.grid.c2', [
          UI.field('Most on one meeting (blank for the default)', UI.input({
            type: 'number', min: 1, max: 6, value: sched.maxPerMeeting == null ? '' : sched.maxPerMeeting,
            onInput: function (e) { sched.maxPerMeeting = e.target.value === '' ? null : +e.target.value; drawSched(); }
          })),
          UI.field('Most in one week (blank for the default)', UI.input({
            type: 'number', min: 1, max: 12, value: sched.maxPerWeek == null ? '' : sched.maxPerWeek,
            onInput: function (e) { sched.maxPerWeek = e.target.value === '' ? null : +e.target.value; drawSched(); }
          }))
        ]),
        UI.checkbox('Suggest names automatically', sched.autoSuggest !== false, function (v) { sched.autoSuggest = v; },
          'Off means no auto-fill or balancing anywhere — every assignment is made by hand. The suggested order still shows when you open a slot.'),
        UI.checkbox('Pair demonstration partners of the same sex', sched.pairSameGender !== false,
          function (v) { sched.pairSameGender = v; }),
        schedBox,
        el('div', { style: 'margin-top:12px' }, UI.btn('Save scheduling', { onClick: function () {
          Store.update({ action: 'congregation.scheduling', summary: cong.name }, function () {
            cong.scheduling = sched;
          });
          UI.flag('Saved', 'The scheduler follows this from now on.', 'success');
        } }))
      ], { icon: 'sparkle' }));
      drawSched();

      root.appendChild(el('div.row', { style: 'margin-top:16px' }, [
        UI.btn('Save settings', { variant: 'primary', onClick: function () {
          Store.update({ action: 'congregation.updated', summary: draft.name }, function () {
            Object.keys(draft).forEach(function (k) { cong[k] = draft[k]; });
          });
          UI.flag('Saved', 'Congregation settings updated.', 'success');
        } }),
        UI.btn('Re-date future meetings to match', { variant: 'subtle', onClick: function () {
          var n = 0;
          Store.update({ action: 'congregation.redated', summary: cong.name }, function () {
            Store.state.weeks.filter(function (w) { return w.congId === cong.id && w.weekStart >= U.weekStart(U.today()); })
              .forEach(function (w) {
                w.midweek.date = U.dayInWeek(w.weekStart, cong.meetings.midweek.dow);
                w.weekend.date = U.dayInWeek(w.weekStart, cong.meetings.weekend.dow);
                w.midweek.time = cong.meetings.midweek.time;
                w.weekend.time = cong.meetings.weekend.time;
                n++;
              });
          });
          UI.flag('Updated', U.plural(n, 'week') + ' re-dated.', 'success');
        } })
      ]));
    }
  };

  function addCongregation() {
    var name = UI.input({ placeholder: 'e.g. Northgate Congregation' });
    var city = UI.input({ placeholder: 'Town or city' });
    UI.modal({
      title: 'Add a congregation',
      sub: 'Starts empty — add publishers, or import a backup afterwards.',
      body: [UI.field('Name', name), UI.field('City', city)],
      actions: [{ label: 'Create', variant: 'primary', onClick: function () {
        if (!name.value.trim()) return false;
        var cong = Seed.empty(name.value.trim(), city.value.trim());
        Store.update({ action: 'congregation.created', summary: cong.name }, function (st) {
          st.congregations.push(cong);
          st.groups.push({ id: U.uid('grp'), congId: cong.id, name: 'Group 1', overseerId: null, assistantId: null });
        });
        Store.setCong(cong.id);
        App.go('admin-congregations', cong.id);
      } }]
    });
  }

  /* ---------- users & roles ---------- */

  Views['admin-users'] = {
    title: 'users and roles',
    perm: PERM,
    render: function (root) {
      root.appendChild(UI.pageHead({
        crumbs: [{ label: 'Administration', href: App.href('admin') }, { label: 'Users & roles' }],
        title: 'Users & roles',
        sub: 'Roles decide which of the three workspaces a person can open and what they can change.'
      }));

      root.appendChild(UI.banner('neutral', 'How access works',
        'Everyone is a publisher. Add a role — elder, secretary, coordinator, territory servant and so on — and the matching pages appear for that person.'));

      var people = U.sortBy(Store.people(), function (p) { return p.lastName; });
      root.appendChild(UI.table([
        { key: 'name', label: 'Person', sort: function (p) { return p.lastName; },
          render: function (p) { return UI.person(p.id, { sub: true }); } },
        { key: 'roles', label: 'Roles', render: function (p) {
          return el('div', (p.roles || []).map(function (r) { return UI.tag(S.roleName(r)); }));
        } },
        { key: 'ws', label: 'Workspaces', render: function (p) {
          return el('div', Auth.workspaces(p).map(function (w) { return UI.lozenge(w.name, 'inprogress'); }));
        } },
        { key: 'actions', label: '', render: function (p) {
          return el('div.row', [
            UI.btn('Roles', { sm: true, onClick: function () { editRoles(p); } }),
            UI.btn('Sign in as', { sm: true, variant: 'subtle', onClick: function () {
              Auth.signInAs(p.id);
              App.go(App.defaultViewFor(Auth.workspace()));
            } })
          ]);
        } }
      ], people, { sortKey: 'name', empty: 'No people in this congregation yet.' }));

      root.appendChild(UI.sectionTitle('What each role may do',
        UI.btn('Change the arrangement', { sm: true, icon: 'cog', onClick: function () { App.go('admin-roles'); } })));
      root.appendChild(matrixSummary());
    }
  };

  /* read-only view of the congregation's current arrangement */
  function matrixSummary() {
    var matrix = Auth.matrix();
    var rows = S.CAPABILITIES.map(function (cap) {
      var holders = S.ROLES.filter(function (r) {
        return S.grantFor(matrix, cap.id, r.id) !== 'none';
      }).map(function (r) {
        return { role: r, grant: S.grantFor(matrix, cap.id, r.id) };
      });
      return { cap: cap, holders: holders };
    });
    return UI.table([
      { key: 'area', label: 'Area', width: '150px', render: function (r) { return r.cap.area; } },
      { key: 'cap', label: 'Can', render: function (r) {
        return el('div', [
          el('div', { text: r.cap.name }),
          r.cap.note ? el('div.small.muted', { text: r.cap.note }) : null
        ]);
      } },
      { key: 'who', label: 'Cared for by', render: function (r) {
        if (!r.holders.length) return UI.lozenge('Administrator only', 'removed');
        return el('div', r.holders.map(function (h) {
          return h.grant === 'group'
            ? UI.lozenge(S.roleName(h.role.id) + ' · own group', 'warn')
            : UI.tag(S.roleName(h.role.id));
        }));
      } }
    ], rows);
  }

  /* ---------- roles & responsibilities ---------- */

  Views['admin-roles'] = {
    title: 'roles and responsibilities',
    perm: PERM,
    render: function (root) {
      var cong = Store.cong();
      var custom = !!cong.roleMatrix;
      var matrix = U.clone(S.matrixFor(cong));

      root.appendChild(UI.pageHead({
        crumbs: [{ label: 'Administration', href: App.href('admin') }, { label: 'Roles & responsibilities' }],
        title: 'Roles & responsibilities',
        sub: 'How ' + cong.name + ' divides the work. This is the body of elders’ decision, not ours — change anything here and both the app and the server follow it.',
        actions: [
          UI.btn('Back to the default arrangement', { icon: 'sparkle', onClick: function () {
            UI.confirm({
              title: 'Use the default arrangement?',
              body: 'Everything goes back to the usual division of work. Nothing else about the congregation changes.',
              confirmLabel: 'Reset'
            }, function () {
              Store.update({ action: 'roles.reset', summary: cong.name }, function () {
                delete cong.roleMatrix;
              });
              UI.flag('Reset', 'The default arrangement is back.', 'success');
            });
          } })
        ]
      }));

      root.appendChild(UI.banner(custom ? 'inprogress' : 'neutral',
        custom ? 'This congregation has its own arrangement' : 'Using the default arrangement',
        custom ? 'Changed from the default. The server enforces exactly what is set here.'
          : 'A starting point that follows how the work is usually divided. Adjust it to match how your body of elders has assigned things.'));

      root.appendChild(UI.banner('neutral', 'How to read it',
        '“Whole congregation” gives the role that work for everyone. “Own service group” narrows it — a group overseer collecting his own group’s reports and seeing his own group’s records, and nobody else’s. The account administrator always holds everything.'));

      var dirty = { value: false };
      var saveBar = el('div.row', { style: 'margin:16px 0' });

      function markDirty() {
        dirty.value = true;
        U.clear(saveBar);
        saveBar.appendChild(UI.btn('Save the arrangement', { variant: 'primary', icon: 'check', onClick: save }));
        saveBar.appendChild(el('span.small.muted', { text: 'Not saved yet.' }));
      }

      function save() {
        Store.update({ action: 'roles.updated', summary: cong.name + ' role arrangement changed' },
          function () { cong.roleMatrix = matrix; });
        UI.flag('Saved', 'Everyone’s access follows the new arrangement from now on.', 'success');
        App.go('admin-roles');
      }

      root.appendChild(saveBar);

      var roles = S.ROLES.filter(function (r) { return r.id !== 'admin' && r.id !== 'publisher'; });

      S.capabilityAreas().forEach(function (area) {
        root.appendChild(UI.sectionTitle(area));
        var caps = S.CAPABILITIES.filter(function (c) { return c.area === area; });
        var columns = [{
          key: 'cap', label: 'Can', width: '280px', minWidth: '260px', render: function (cap) {
            return el('div', [
              el('div', { text: cap.name }),
              cap.note ? el('div.small.muted', { style: 'max-width:34ch', text: cap.note }) : null,
              cap.scope ? el('div', { style: 'margin-top:4px' }, UI.lozenge('Can be narrowed to a group', '')) : null
            ]);
          }
        }].concat(roles.map(function (role) {
          return {
            key: role.id,
            label: S.roleName(role.id),
            minWidth: '140px',
            render: function (cap) {
              var options = cap.scope
                ? [{ id: 'none', name: '—' }, { id: 'group', name: 'Own group' }, { id: 'all', name: 'Whole cong.' }]
                : [{ id: 'none', name: '—' }, { id: 'all', name: 'Yes' }];
              var current = S.grantFor(matrix, cap.id, role.id);
              var sel = UI.select(options, current, function (v) {
                matrix[cap.id] = matrix[cap.id] || {};
                if (v === 'none') delete matrix[cap.id][role.id];
                else matrix[cap.id][role.id] = v;
                markDirty();
              });
              sel.style.minWidth = '120px';
              if (current !== 'none') sel.style.fontWeight = '600';
              return sel;
            }
          };
        }));
        root.appendChild(UI.table(columns, caps));
      });

      root.appendChild(UI.sectionTitle('Who this affects right now'));
      var people = Store.people().filter(function (p) {
        return (p.roles || []).some(function (r) { return r !== 'publisher'; });
      });
      root.appendChild(UI.table([
        { key: 'name', label: 'Person', render: function (p) { return UI.person(p.id, { sub: true }); } },
        { key: 'roles', label: 'Roles', render: function (p) {
          return el('div', (p.roles || []).filter(function (r) { return r !== 'publisher'; })
            .map(function (r) { return UI.tag(S.roleName(r)); }));
        } },
        { key: 'holds', label: 'Which means they can', render: function (p) {
          var held = S.CAPABILITIES.filter(function (c) { return Auth.can(c.id, p); });
          if (!held.length) return el('span.muted', { text: 'the same as any publisher' });
          return el('div.small', { text: held.map(function (c) {
            var g = Auth.grant(c.id, p);
            return c.name.toLowerCase() + (g === 'group' ? ' (own group)' : '');
          }).join(' · ') });
        } }
      ], people, { empty: 'Nobody has a role beyond publisher yet.' }));
    }
  };

  function editRoles(person) {
    var draft = (person.roles || []).slice();
    var grid = el('div.checkgrid');
    S.ROLES.forEach(function (r) {
      if (r.id === 'publisher') return;
      grid.appendChild(UI.checkbox(r.name, draft.indexOf(r.id) !== -1, function (v) {
        draft = draft.filter(function (x) { return x !== r.id; });
        if (v) draft.push(r.id);
      }, r.workspaces.join(', ')));
    });
    UI.modal({
      wide: true,
      title: 'Roles — ' + Store.name(person.id),
      sub: 'Everyone keeps the publisher workspace; these add to it.',
      body: grid,
      actions: [{ label: 'Save', variant: 'primary', onClick: function () {
        if (draft.indexOf('publisher') === -1) draft.push('publisher');
        Store.update({ action: 'person.roles', summary: Store.name(person.id) + ' → ' + draft.join(', ') },
          function () { person.roles = draft; });
        UI.flag('Roles updated', Store.name(person.id), 'success');
      } }]
    });
  }

  /* ---------- program source ---------- */

  Views['admin-program'] = {
    title: 'the program source',
    perm: PERM,
    render: function (root) {
      var cong = Store.cong();
      var src = cong.programSource;
      var draft = U.clone(src);

      root.appendChild(UI.pageHead({
        crumbs: [{ label: 'Administration', href: App.href('admin') }, { label: 'Program source' }],
        title: 'Where meeting programs come from',
        sub: 'How the weekly program reaches ' + cong.name + '.'
      }));

      root.appendChild(UI.banner('warn', 'Shepherd does not copy the publisher’s material',
        'The meeting workbook and Watchtower study articles are copyrighted, and their terms of use do not permit a third-party service to scrape or redistribute them. So this app ships the standard week structure and lets your congregation bring in the program it already has.'));

      root.appendChild(el('div.grid.c2', [
        UI.card('The four ways in', [
          el('ol', { style: 'padding-left:18px;list-style:decimal' }, [
            el('li', { style: 'margin-bottom:8px' }, [el('strong', { text: 'Standard structure. ' }),
              document.createTextNode('Every week is created with the usual parts and timings, so you can schedule people before the program is in.')]),
            el('li', { style: 'margin-bottom:8px' }, [el('strong', { text: 'Paste. ' }),
              document.createTextNode('An elder copies the week from the material the congregation already holds; the parser recognises headings, numbered parts and timings.')]),
            el('li', { style: 'margin-bottom:8px' }, [el('strong', { text: 'File import. ' }),
              document.createTextNode('JSON or CSV from whatever tool you already use.')]),
            el('li', [el('strong', { text: 'Configured feed. ' }),
              document.createTextNode('Point Shepherd at an endpoint your congregation is licensed to read. Off unless you set it below.')])
          ])
        ], { icon: 'book' }),
        UI.card('Feed configuration', [
          UI.field('Feed endpoint (JSON)', UI.input({
            value: draft.endpoint, placeholder: 'https://…',
            onInput: function (e) { draft.endpoint = e.target.value; }
          }), 'Must return [{ "week": "2026-11-03", "parts": [ … ] }].'),
          UI.checkbox('I confirm this congregation is permitted to read this source',
            draft.acknowledged, function (v) { draft.acknowledged = v; },
            'Nothing is fetched until this is ticked.'),
          el('div.row', { style: 'margin-top:12px' }, [
            UI.btn('Save', { variant: 'primary', onClick: function () {
              Store.update({ action: 'program.source', summary: draft.endpoint || 'cleared' }, function () {
                cong.programSource.endpoint = draft.endpoint.trim();
                cong.programSource.acknowledged = draft.acknowledged;
                cong.programSource.mode = draft.endpoint.trim() ? 'feed' : 'manual';
              });
              UI.flag('Saved', 'Program source updated.', 'success');
            } }),
            UI.btn('Test the feed', { variant: 'subtle', icon: 'download', onClick: function () {
              global.Program.fetchFeed(cong).then(function (weeks) {
                UI.flag('Feed reachable', U.plural(weeks.length, 'week') + ' returned.', 'success');
              }, function (err) { UI.flag('Feed failed', err.message, 'danger'); });
            } })
          ]),
          el('div.small.muted', { style: 'margin-top:12px',
            text: 'Last import: ' + (src.lastImportedAt ? U.fmtDateTime(src.lastImportedAt) : 'never') })
        ], { icon: 'upload' })
      ]));

      root.appendChild(UI.sectionTitle('Program coverage'));
      var weeks = Store.weeks().filter(function (w) { return w.weekStart >= U.weekStart(U.today()); }).slice(0, 12);
      root.appendChild(UI.table([
        { key: 'week', label: 'Week', render: function (w) { return U.fmtWeek(w.weekStart); } },
        { key: 'source', label: 'Program', render: function (w) {
          return UI.lozenge(w.source === 'imported' ? 'Imported' : 'Standard structure',
            w.source === 'imported' ? 'success' : 'warn');
        } },
        { key: 'reading', label: 'Bible reading', render: function (w) { return w.bibleReading || '—'; } },
        { key: 'parts', label: 'Parts', num: true, render: function (w) {
          return String(w.midweek.parts.length + w.weekend.parts.length);
        } },
        { key: 'actions', label: '', render: function (w) {
          return UI.btn('Open', { sm: true, variant: 'subtle', onClick: function () { App.go('meetings', w.weekStart); } });
        } }
      ], weeks, { empty: 'No weeks created yet.' }));
    }
  };

  /* ---------- logins & sharing ---------- */

  Views['admin-access'] = {
    title: 'logins and sharing',
    perm: PERM,
    render: function (root) {
      var Sync = global.Sync;

      root.appendChild(UI.pageHead({
        crumbs: [{ label: 'Administration', href: App.href('admin') }, { label: 'Logins & sharing' }],
        title: 'Logins & sharing',
        sub: 'Who can sign in, and how the congregation shares one set of records.'
      }));

      if (Sync.mode !== 'server') {
        root.appendChild(UI.banner('warn', 'Running in this browser only',
          'Records are stored in this browser and nobody else can reach them. Start the bundled server on one computer to share them.'));
        root.appendChild(UI.card('Share it with the congregation', [
          el('ol', { style: 'padding-left:18px;list-style:decimal;line-height:1.9' }, [
            el('li', [el('strong', { text: 'Pick a computer that stays on' }),
              document.createTextNode(' — a laptop at the hall, a spare desktop, or a small box like a Raspberry Pi.')]),
            el('li', [document.createTextNode('Copy the '), el('code.mono', { text: 'shepherd' }),
              document.createTextNode(' folder onto it and install Node.js (nothing else — the server has no dependencies).')]),
            el('li', 'Run it:'),
          ]),
          el('pre.mono', { style: 'background:var(--bg-sunken);padding:12px;border-radius:4px;overflow-x:auto;margin:8px 0',
            text: 'cd shepherd\nnode server/server.js --port 8080' }),
          el('ol', { style: 'padding-left:18px;list-style:decimal;line-height:1.9', start: '4' }, [
            el('li', 'It prints an address such as http://192.168.1.20:8080 — that is what everyone opens.'),
            el('li', 'The first person to open it creates the administrator account, then adds a login for each publisher here.')
          ]),
          UI.banner('neutral', 'Where the data lives',
            'One JSON file in server/data on that machine. Nothing is sent anywhere else — back it up by copying that folder, or from Backup & restore.')
        ], { icon: 'shield' }));
        root.appendChild(UI.card('Moving what is already here', [
          el('p.small.muted', { text: 'Take a backup from Administration → Backup & restore in this browser, open the app on the server address, sign in as the administrator, and restore that file. Everyone else then sees it.' })
        ], { icon: 'upload' }));
        return;
      }

      var box = el('div');
      root.appendChild(box);

      function draw() {
        U.clear(box);
        box.appendChild(el('div.muted', { text: 'Loading…' }));
        Sync.api('GET', 'api/accounts').then(function (out) {
          U.clear(box);
          var byPerson = {};
          out.logins.forEach(function (l) { byPerson[l.personId] = l; });
          out.invites = out.invites || {};
          var sessionsBy = {};
          out.sessions.forEach(function (s) {
            if (!sessionsBy[s.personId] || s.lastSeenAt > sessionsBy[s.personId]) sessionsBy[s.personId] = s.lastSeenAt;
          });

          box.appendChild(el('div.grid.c4', [
            UI.stat('Logins', out.logins.length, 'Of ' + Store.people().length + ' on the roll'),
            UI.stat('Signed in now', Object.keys(sessionsBy).length, 'Active sessions'),
            UI.stat('Server', 'Connected', 'Change no. ' + Sync.seq),
            UI.stat('Waiting to send', Sync.pendingCount(), Sync.status === 'offline' ? 'Offline' : 'Up to date')
          ]));

          box.appendChild(UI.banner('neutral', 'How a publisher gets in',
            'Create a login, read them the one-time password, and they change it the first time they sign in.'));

          var people = U.sortBy(Store.people(), function (p) { return p.lastName; });
          box.appendChild(UI.table([
            { key: 'name', label: 'Person', sort: function (p) { return p.lastName; },
              render: function (p) { return UI.person(p.id, { sub: true }); } },
            { key: 'login', label: 'Login', render: function (p) {
              var l = byPerson[p.id];
              if (!l) return UI.lozenge('None', '');
              return el('div', [
                el('div.small', { text: l.email }),
                l.mustChange ? UI.lozenge('Must change password', 'warn') : null
              ]);
            } },
            { key: 'last', label: 'Last signed in', sort: function (p) {
              var l = byPerson[p.id]; return l && l.lastLoginAt || 0;
            }, render: function (p) {
              var l = byPerson[p.id];
              if (!l || !l.lastLoginAt) return el('span.muted', { text: '—' });
              return U.relative(l.lastLoginAt);
            } },
            { key: 'now', label: 'Open now', render: function (p) {
              return sessionsBy[p.id] ? UI.lozenge('Active', 'success') : el('span.muted', { text: '—' });
            } },
            { key: 'invite', label: 'Invitation', render: function (p) {
              var inv = (out.invites || {})[p.id];
              if (!inv) return el('span.muted', { text: '—' });
              if (inv.state === 'accepted') return UI.lozenge('Accepted ' + U.fmtDate(U.iso(new Date(inv.acceptedAt))), 'success');
              if (inv.state === 'expired') return UI.lozenge('Expired', 'removed');
              return UI.lozenge('Sent ' + U.relative(inv.invitedAt), 'warn');
            } },
            { key: 'actions', label: '', render: function (p) {
              var l = byPerson[p.id];
              return el('div.row', [
                UI.btn(l ? 'Re-invite' : 'Invite by email', { sm: true, variant: l ? 'subtle' : '',
                  onClick: function () { invitePerson(p, draw); } }),
                UI.btn(l ? 'Reset password' : 'Set a password', { sm: true, variant: 'subtle',
                  onClick: function () { createLogin(p, !!l, draw); } }),
                l && p.id !== Sync.user.personId
                  ? UI.btn('Remove', { sm: true, variant: 'subtle', onClick: function () {
                    UI.confirm({ title: 'Remove the login for ' + Store.name(p.id) + '?',
                      body: 'Their publisher record stays; only the ability to sign in is removed.',
                      danger: true, confirmLabel: 'Remove login' }, function () {
                      Sync.api('POST', 'api/accounts/remove', { personId: p.id }).then(function () {
                        UI.flag('Login removed', Store.name(p.id), 'success');
                        draw();
                      }, function (e) { UI.flag('Could not remove it', e.message, 'danger'); });
                    });
                  } })
                  : null
              ]);
            } }
          ], people, { sortKey: 'name' }));
        }, function (err) {
          U.clear(box);
          box.appendChild(UI.banner('danger', 'Could not read the login list', err.message));
        });
      }
      draw();
    }
  };

  /* The ordinary way in: the person gets an email, picks their own password, and
     the elders never handle it. */
  function invitePerson(person, done) {
    var Sync = global.Sync;
    var email = UI.input({ type: 'email', value: person.email || '' });
    UI.modal({
      title: 'Invite ' + Store.name(person.id),
      sub: 'They receive an email with a link, choose their own password, and land in their own view of the congregation. Nobody else sees the password.',
      body: [
        UI.field('Email address', email, 'This becomes what they sign in with, and is saved to their record.'),
        UI.banner('neutral', 'What they will be able to do',
          'See the parts and duties they are given and confirm them, tell you when they are away, hand in their field service report, and read announcements. Nothing else until you give them a role.')
      ],
      actions: [{ label: 'Send the invitation', variant: 'primary', onClick: function () {
        if (!email.value.trim() || email.value.indexOf('@') === -1) {
          UI.flag('A valid email address is needed', null, 'danger');
          return false;
        }
        Sync.api('POST', 'api/invite', { personId: person.id, email: email.value.trim() })
          .then(function (out) {
            if (out.configured) {
              UI.flag('Invitation sent', email.value.trim(), 'success');
            } else {
              // email is not set up yet, so hand over the link to pass on another way
              UI.modal({
                title: 'Invitation ready',
                sub: 'Email is not set up on this server yet, so pass this link to '
                  + person.firstName + ' yourself — by message, or in person.',
                body: [
                  el('div.mono', { style: 'padding:12px;background:var(--bg-sunken);border-radius:6px;word-break:break-all',
                    text: out.link }),
                  el('div.row', { style: 'margin-top:12px' }, [
                    UI.copyBtn(function () { return out.link; }, 'Copy the link'),
                    UI.btn('Set up email', { variant: 'subtle', icon: 'cog',
                      onClick: function () { App.go('admin-email'); } })
                  ])
                ],
                closeLabel: 'Done'
              });
            }
            if (done) done();
          }, function (err) { UI.flag('Could not send it', err.message, 'danger'); });
      } }]
    });
  }

  function createLogin(person, exists, done) {
    var Sync = global.Sync;
    var email = UI.input({ type: 'email', value: person.email || '' });
    var pw = UI.input({ type: 'password', placeholder: 'Leave blank to generate one' });
    var mustChange = { value: true };
    UI.modal({
      title: (exists ? 'Reset the password for ' : 'Create a login for ') + Store.name(person.id),
      sub: 'They sign in with this email address at the same web address you are using now.',
      body: [
        UI.field('Email address', email),
        UI.field('Password', pw, 'At least 8 characters, or leave it blank and one will be generated.'),
        UI.checkbox('Make them choose a new password when they first sign in', true, function (v) { mustChange.value = v; })
      ],
      actions: [{ label: exists ? 'Reset' : 'Create', variant: 'primary', onClick: function () {
        if (!email.value.trim()) { UI.flag('An email address is needed', null, 'danger'); return false; }
        if (pw.value && pw.value.length < 8) { UI.flag('Too short', 'Use at least 8 characters.', 'danger'); return false; }
        Sync.api('POST', 'api/password', {
          personId: person.id, email: email.value.trim(),
          password: pw.value || undefined, mustChange: mustChange.value
        }).then(function (out) {
          if (out.password) {
            UI.modal({
              title: 'One-time password',
              sub: 'Read this to ' + Store.name(person.id) + ' — it is not shown again.',
              body: [
                el('div.mono', { style: 'font-size:22px;padding:16px;background:var(--bg-sunken);border-radius:6px;text-align:center;letter-spacing:.02em', text: out.password }),
                el('div', { style: 'margin-top:12px' }, UI.copyBtn(function () {
                  return Store.name(person.id) + ' — sign in at ' + location.origin + '\nEmail: ' + out.email + '\nPassword: ' + out.password;
                }, 'Copy the sign-in details'))
              ],
              closeLabel: 'Done'
            });
          } else {
            UI.flag('Saved', Store.name(person.id) + ' can sign in now.', 'success');
          }
          if (done) done();
        }, function (err) { UI.flag('Could not save it', err.message, 'danger'); });
      } }]
    });
  }

  /* ---------- email ---------- */

  /* Shared hosting sleeps an idle app, and a sleeping app runs no timers. This
     hands the administrator the one line that fixes it. */
  function cronHelp() {
    var Sync = global.Sync;
    Sync.api('GET', 'api/reminders/cron-key').then(function (out) {
      var url = location.origin + location.pathname.replace(/\/[^/]*$/, '')
        + out.path + '?key=' + out.key;
      var line = '0 * * * * curl -fsS "' + url + '" >/dev/null';
      UI.modal({
        wide: true,
        title: 'Keeping the reminders on time',
        sub: 'Only needed on hosting that puts an idle app to sleep — cPanel, shared hosting and the like. On a machine of your own the server does this by itself every hour.',
        body: [
          el('p.small', { text: 'Add this as an hourly cron job (cPanel → Cron Jobs → Once an hour). It wakes the app and sends whatever was due — nothing more.' }),
          el('pre', { style: 'white-space:pre-wrap;word-break:break-all;background:var(--bg-sunken);padding:12px;border-radius:4px;font-size:12px', text: line }),
          el('div.row', [UI.copyBtn(function () { return line; }, 'Copy the line')]),
          el('p.small.muted', { style: 'margin-top:12px',
            text: 'Treat the address as a password: anyone holding it can make the server send the reminders that are already due. It cannot read or change anything. Delete server/data/cron-key to retire it and a new one is made.' })
        ],
        closeLabel: 'Close'
      });
    }, function (err) { UI.flag('Could not fetch it', err.message, 'danger'); });
  }

  Views['admin-email'] = {
    title: 'email and notifications',
    perm: PERM,
    render: function (root) {
      var Sync = global.Sync;

      root.appendChild(UI.pageHead({
        crumbs: [{ label: 'Administration', href: App.href('admin') }, { label: 'Email & notifications' }],
        title: 'Email & notifications',
        sub: 'How invitations and assignment notices reach people.'
      }));

      if (Sync.mode !== 'server') {
        root.appendChild(UI.banner('warn', 'Email needs the server',
          'Messages are sent by the Shepherd server, so this only applies once you are running it. In this browser-only mode you can still print assignment slips or copy a list to send by hand.'));
        return;
      }

      var box = el('div');
      root.appendChild(box);

      /* pop-up reminders: nothing to configure, but the body of elders should be
         able to see whether anyone is actually receiving them */
      var pushBox = el('div');
      root.appendChild(pushBox);
      Sync.api('GET', 'api/push').then(function (info) {
        U.clear(pushBox);
        pushBox.appendChild(UI.sectionTitle('Pop-up reminders'));
        pushBox.appendChild(UI.card(null, [
          UI.kv([
            ['Devices receiving them', String(info.total || 0)],
            ['On this device', info.devices ? 'yes' : 'not yet']
          ]),
          el('p.small.muted', { style: 'margin-top:10px',
            text: 'Nothing to set up: each publisher turns them on for himself under “My details”. They go out for a new assignment, a cleaning turn, and a job due for the circuit overseer’s visit — sealed, through the phone maker’s own notification service.' }),
          el('div.row', { style: 'margin-top:10px' }, [
            UI.btn('How to keep them on time', { variant: 'subtle', icon: 'clock', onClick: cronHelp }),
            UI.btn('Send anything due now', { icon: 'bell', onClick: function () {
              Sync.api('POST', 'api/reminders/run', {}).then(function (out) {
                UI.flag('Sent', out.queued
                  ? U.plural(out.queued, 'message') + ' queued, and the pop-ups have gone.'
                  : 'Nothing was due — everyone has already been told.', 'success');
              }, function (err) { UI.flag('Could not send', err.message, 'danger'); });
            } })
          ])
        ], { icon: 'bell' }));
      }, function () { /* an older server without reminders */ });

      function draw() {
        U.clear(box);
        box.appendChild(el('div.muted', { text: 'Loading…' }));
        Sync.api('GET', 'api/mail').then(function (out) {
          U.clear(box);
          var set = out.settings;
          var draft = {
            transport: set.transport, host: set.host, port: set.port, secure: set.secure,
            user: set.user, pass: '', from: set.from, fromName: set.fromName,
            replyTo: set.replyTo, baseUrl: set.baseUrl,
            digestDay: set.digestDay, digestHour: set.digestHour
          };

          box.appendChild(el('div.grid.c4', [
            UI.stat('Sending', set.transport === 'smtp' ? 'By email'
              : set.transport === 'off' ? 'Turned off' : 'To a folder',
              set.transport === 'smtp' ? set.host : set.transport === 'off' ? 'Nothing is sent' : 'server/data/outbox'),
            UI.stat('Waiting', set.queued, 'In the outbox'),
            UI.stat('Sent', set.sent, 'Since the server started'),
            UI.stat('Failed', set.failed, set.failed ? 'See the list below' : 'None', set.failed ? 'down' : 'up')
          ]));

          if (set.transport !== 'smtp') {
            box.appendChild(UI.banner('warn', 'Nothing is being emailed yet',
              'Until a mail account is entered below, messages are written to files in server/data/outbox so you can see exactly what would have gone out. Invitations still work — you are given the link to pass on yourself.'));
          }

          box.appendChild(UI.card('The mail account to send from', [
            el('p.small.muted', { style: 'margin-bottom:12px',
              text: 'Any ordinary account will do — a Gmail address with an app password, the congregation’s own hosting, or a relay. Shepherd only sends; it never reads mail.' }),
            UI.field('How to send', UI.select([
              { id: 'file', name: 'Write to a folder (nothing is sent)' },
              { id: 'smtp', name: 'Send by email (SMTP)' },
              { id: 'off', name: 'Turn messages off entirely' }
            ], draft.transport, function (v) { draft.transport = v; })),
            el('div.grid.c2', [
              UI.field('Server', UI.input({ value: draft.host, placeholder: 'smtp.gmail.com',
                onInput: function (e) { draft.host = e.target.value; } })),
              UI.field('Port', UI.input({ type: 'number', value: draft.port,
                onInput: function (e) { draft.port = +e.target.value || 587; } }))
            ]),
            UI.checkbox('The port expects TLS immediately (port 465)', draft.secure,
              function (v) { draft.secure = v; }, 'Leave off for 587, which upgrades with STARTTLS.'),
            el('div.grid.c2', [
              UI.field('Username', UI.input({ value: draft.user,
                onInput: function (e) { draft.user = e.target.value; } })),
              UI.field('Password', UI.input({ type: 'password', placeholder: set.hasPassword ? '••••••••  (unchanged)' : '',
                onInput: function (e) { draft.pass = e.target.value; } }))
            ]),
            el('div.grid.c2', [
              UI.field('Send from', UI.input({ type: 'email', value: draft.from,
                placeholder: 'congregation@example.org', onInput: function (e) { draft.from = e.target.value; } })),
              UI.field('Shown as', UI.input({ value: draft.fromName,
                onInput: function (e) { draft.fromName = e.target.value; } }))
            ]),
            UI.field('Replies go to', UI.input({ type: 'email', value: draft.replyTo,
              placeholder: 'the secretary, perhaps', onInput: function (e) { draft.replyTo = e.target.value; } })),
            UI.field('Address to put in links', UI.input({ value: draft.baseUrl,
              placeholder: 'https://shepherd.example.org',
              onInput: function (e) { draft.baseUrl = e.target.value; } }),
              'Leave blank and Shepherd uses whatever address the browser came in on — set it if people open it from outside.')
          ], { icon: 'megaphone' }));

          box.appendChild(UI.card('The weekly summary', [
            el('p.small.muted', { style: 'margin-bottom:12px',
              text: 'Everyone with something coming up gets one message listing it. Nobody with an empty week is emailed.' }),
            el('div.grid.c2', [
              UI.field('Day', UI.select(U.DAYS.map(function (d, i) { return { id: String(i), name: d }; }),
                String(draft.digestDay), function (v) { draft.digestDay = +v; })),
              UI.field('Hour', UI.input({ type: 'number', min: 0, max: 23, value: draft.digestHour,
                onInput: function (e) { draft.digestHour = +e.target.value || 0; } }))
            ])
          ], { icon: 'clock' }));

          box.appendChild(el('div.row', { style: 'margin:16px 0' }, [
            UI.btn('Save', { variant: 'primary', onClick: function () {
              Sync.api('POST', 'api/mail', { settings: draft }).then(function () {
                UI.flag('Saved', null, 'success'); draw();
              }, function (err) { UI.flag('Could not save', err.message, 'danger'); });
            } }),
            UI.btn('Send a test message', { icon: 'megaphone', onClick: function () {
              var to = UI.input({ type: 'email', value: (Auth.me() || {}).email || '' });
              UI.modal({
                title: 'Send a test',
                sub: 'Save your settings first if you have just changed them.',
                body: UI.field('Send it to', to),
                actions: [{ label: 'Send', variant: 'primary', onClick: function () {
                  Sync.api('POST', 'api/mail/test', { to: to.value.trim() }).then(function (out) {
                    if (out.ok) {
                      UI.flag(out.transport === 'smtp' ? 'Sent' : 'Written to the outbox folder',
                        out.transport === 'smtp' ? 'Check the inbox.' : 'server/data/outbox', 'success');
                    } else {
                      UI.flag('It did not go', out.error, 'danger');
                    }
                    draw();
                  }, function (err) { UI.flag('It did not go', err.message, 'danger'); });
                } }]
              });
            } })
          ]));

          box.appendChild(UI.sectionTitle('Recent messages'));
          box.appendChild(UI.table([
            { key: 'when', label: 'When', render: function (m) { return U.relative(m.createdAt); } },
            { key: 'to', label: 'To' },
            { key: 'subject', label: 'Subject' },
            { key: 'kind', label: 'Kind', render: function (m) { return UI.tag(m.kind); } },
            { key: 'state', label: 'State', render: function (m) {
              if (m.sentAt) return UI.lozenge('Sent', 'success');
              if (m.failedAt) return el('div', [UI.lozenge('Failed', 'removed'),
                el('div.small.muted', { text: m.error || '' })]);
              return UI.lozenge(m.attempts ? 'Retrying' : 'Waiting', 'warn');
            } }
          ], out.recent, { empty: 'Nothing has been sent yet.' }));
        }, function (err) {
          U.clear(box);
          box.appendChild(UI.banner('danger', 'Could not read the email settings', err.message));
        });
      }
      draw();
    }
  };

  /* ---------- billing ---------- */

  Views['admin-billing'] = {
    title: 'the subscription',
    perm: PERM,
    render: function (root) {
      var st = Store.state;
      var cong = Store.cong();
      var current = S.plan(cong.subscription.plan);
      var people = Store.people().length;

      root.appendChild(UI.pageHead({
        crumbs: [{ label: 'Administration', href: App.href('admin') }, { label: 'Subscription' }],
        title: 'Subscription',
        sub: cong.name + ' is on the ' + current.name + ' plan.'
      }));

      root.appendChild(el('div.grid.c4', [
        UI.stat('Plan', current.name, current.price ? '£' + current.price + ' / ' + current.period : 'Free'),
        UI.stat('Status', U.titleCase(cong.subscription.status),
          cong.subscription.renewsOn ? 'Renews ' + U.fmtDate(cong.subscription.renewsOn) : ''),
        UI.stat('Publishers', people, 'Limit ' + current.limits.publishers,
          people > current.limits.publishers ? 'down' : 'up'),
        UI.stat('Congregations', st.congregations.length, 'Limit ' + current.limits.congregations)
      ]));

      if (people > current.limits.publishers) {
        root.appendChild(UI.banner('warn', 'Over the plan limit',
          'This congregation has more publishers than the ' + current.name + ' plan covers.'));
      }

      root.appendChild(UI.sectionTitle('Plans'));
      root.appendChild(el('div.grid.c3', S.PLANS.map(function (p) {
        var isCurrent = p.id === cong.subscription.plan;
        return UI.card(p.name, [
          el('div', { style: 'font-size:26px;font-weight:600;color:var(--text-strong)',
            text: p.price ? '£' + p.price : 'Free' }),
          el('div.small.muted', { text: p.price ? 'per congregation, per ' + p.period : 'one congregation' }),
          el('ul', { style: 'margin:16px 0' }, p.features.map(function (f) {
            return el('li.row', { style: 'align-items:flex-start;margin-bottom:6px' },
              [U.icon('check', 14), el('span.small', { text: f })]);
          })),
          isCurrent ? UI.lozenge('Current plan', 'success')
            : UI.btn('Switch to ' + p.name, { variant: 'primary', onClick: function () {
              Store.update({ action: 'billing.plan', summary: cong.name + ' → ' + p.name }, function () {
                cong.subscription.plan = p.id;
                cong.subscription.status = 'active';
                cong.subscription.renewsOn = U.addMonths(U.today(), 1);
                Store.state.account.plan = p.id;
              });
              UI.flag('Plan changed', cong.name + ' is now on ' + p.name + '.', 'success');
            } })
        ], { icon: 'cash' });
      })));

      root.appendChild(UI.banner('neutral', 'About billing in this build',
        'This build stores everything in your browser, so there is no payment processing wired up — switching plans changes the limits and features shown. On a hosted account this page is where the card and invoices live.'));
    }
  };

  /* ---------- data ---------- */

  Views['admin-data'] = {
    title: 'backup and restore',
    perm: PERM,
    render: function (root) {
      root.appendChild(UI.pageHead({
        crumbs: [{ label: 'Administration', href: App.href('admin') }, { label: 'Backup & restore' }],
        title: 'Backup & restore',
        sub: 'Everything lives in this browser. Take a backup regularly and keep it somewhere safe.'
      }));

      var fileInput = el('input', { type: 'file', accept: '.json' });
      fileInput.addEventListener('change', function (e) {
        var f = e.target.files[0];
        if (!f) return;
        U.readFile(f, function (err, text) {
          if (err) { UI.flag('Could not read the file', String(err), 'danger'); return; }
          UI.confirm({
            title: 'Restore from this backup?',
            body: 'Everything currently in the browser is replaced by the contents of ' + f.name + '.',
            danger: true, confirmLabel: 'Restore'
          }, function () {
            try {
              Store.importAll(text);
              UI.flag('Restored', 'The backup has been loaded.', 'success');
              App.go('admin');
            } catch (ex) {
              UI.flag('That file could not be read', ex.message, 'danger');
            }
          });
        });
      });

      root.appendChild(el('div.grid.c2', [
        UI.card('Backup', [
          el('p.small.muted', { text: 'A single JSON file with every congregation, record, schedule and ledger entry.' }),
          el('div.row', { style: 'margin-top:12px' }, [
            UI.btn('Download a backup', { variant: 'primary', icon: 'download', onClick: function () {
              U.download('shepherd-backup-' + U.today() + '.json', Store.exportAll(), 'application/json');
              UI.flag('Backup downloaded', null, 'success');
            } }),
            UI.copyBtn(function () { return Store.exportAll(); }, 'Copy as JSON')
          ])
        ], { icon: 'download' }),
        UI.card('Restore', [
          el('p.small.muted', { text: 'Load a backup on any device — this is also how you move to a new phone or laptop.' }),
          el('div', { style: 'margin-top:12px' }, fileInput)
        ], { icon: 'upload' })
      ]));

      root.appendChild(UI.sectionTitle('Start again'));
      root.appendChild(el('div.grid.c2', [
        UI.card('Reset to the demo congregation', [
          el('p.small.muted', { text: 'Puts back Riverside and Northgate with sample people, schedules and records.' }),
          el('div', { style: 'margin-top:12px' }, UI.btn('Reset to demo data', {
            onClick: function () {
              UI.confirm({ title: 'Reset to the demo?', body: 'Your current data is discarded.', danger: true, confirmLabel: 'Reset' },
                function () { Store.resetDemo(); UI.flag('Demo data restored', null, 'success'); App.go('admin'); });
            }
          }))
        ]),
        UI.card('Empty account', [
          el('p.small.muted', { text: 'One blank congregation and nothing else — this is how a real congregation would start.' }),
          el('div', { style: 'margin-top:12px' }, UI.btn('Clear everything', {
            variant: 'danger',
            onClick: function () {
              UI.confirm({ title: 'Clear everything?', body: 'Every record on this account is deleted from this browser. Take a backup first.', danger: true, confirmLabel: 'Clear everything' },
                function () { Store.resetBlank(); UI.flag('Account cleared', null, 'success'); location.hash = '#/admin'; });
            }
          }))
        ])
      ]));

      var size = JSON.stringify(Store.state).length;
      root.appendChild(el('div', { style: 'margin-top:24px' }, UI.kv([
        ['Data size', Math.round(size / 1024) + ' KB'],
        ['Congregations', String(Store.state.congregations.length)],
        ['People', String(Store.state.people.length)],
        ['Weeks scheduled', String(Store.state.weeks.length)],
        ['Reports', String(Store.state.reports.length)],
        ['Audit entries', String(Store.state.audit.length)]
      ])));
    }
  };

  /* ---------- audit ---------- */

  function auditTable(rows) {
    return UI.table([
      { key: 'at', label: 'When', sort: function (a) { return a.at; }, render: function (a) { return U.fmtDateTime(a.at); } },
      { key: 'who', label: 'Who', render: function (a) { return a.personId ? UI.person(a.personId) : el('span.muted', { text: 'system' }); } },
      { key: 'action', label: 'Action', render: function (a) { return el('code.mono', { text: a.action }); } },
      { key: 'summary', label: 'Detail', render: function (a) { return a.summary || '—'; } }
    ], rows, { sortKey: 'at', sortDir: 'desc', empty: 'Nothing recorded yet.' });
  }

  Views['admin-audit'] = {
    title: 'the audit log',
    perm: PERM,
    render: function (root) {
      root.appendChild(UI.pageHead({
        crumbs: [{ label: 'Administration', href: App.href('admin') }, { label: 'Audit log' }],
        title: 'Audit log',
        sub: 'Every change made through the app, newest first. The last 500 entries are kept.',
        actions: [UI.btn('Export CSV', { variant: 'subtle', icon: 'download', onClick: function () {
          var rows = [['When', 'Who', 'Action', 'Detail']];
          Store.state.audit.forEach(function (a) {
            rows.push([new Date(a.at).toISOString(), a.personId ? Store.name(a.personId) : 'system', a.action, a.summary || '']);
          });
          U.download('audit-' + U.today() + '.csv', U.csv(rows), 'text/csv');
        } })]
      }));
      root.appendChild(auditTable(Store.state.audit));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
