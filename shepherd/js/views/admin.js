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

      root.appendChild(UI.sectionTitle('What each capability means'));
      var rows = Object.keys(S.PERMISSIONS).map(function (cap) {
        return { cap: cap, roles: S.PERMISSIONS[cap] };
      });
      root.appendChild(UI.table([
        { key: 'cap', label: 'Capability', render: function (r) { return el('code.mono', { text: r.cap }); } },
        { key: 'roles', label: 'Held by', render: function (r) {
          return el('div', r.roles.length ? r.roles.map(function (x) { return UI.tag(S.roleName(x)); })
            : [UI.lozenge('Account administrator only', 'removed')]);
        } }
      ], rows));
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
