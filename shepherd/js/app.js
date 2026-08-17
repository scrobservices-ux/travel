/* Shell: workspace rail, sidebar navigation, hash router, quick find. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth, UI = global.UI;
  var el = U.el;
  var App = { route: { view: 'dashboard', params: {} } };
  var Views = global.Views = global.Views || {};

  /* ---------- navigation model ---------- */

  var NAV = {
    publisher: [
      { group: 'My congregation', items: [
        { id: 'home', label: 'Home', icon: 'dashboard' },
        { id: 'my-assignments', label: 'My assignments', icon: 'calendar' },
        { id: 'meetings', label: 'Meeting programs', icon: 'book' },
        { id: 'announcements', label: 'Announcements', icon: 'megaphone' },
        { id: 'files', label: 'Files', icon: 'copy' }
      ] },
      { group: 'My ministry', items: [
        { id: 'my-report', label: 'Monthly report', icon: 'report' },
        { id: 'my-territories', label: 'My territories', icon: 'map' }
      ] },
      { group: 'Me', items: [
        { id: 'profile', label: 'My details & availability', icon: 'user' }
      ] }
    ],
    elders: [
      { group: 'Overview', items: [
        { id: 'dashboard', label: 'Congregation overview', icon: 'dashboard' },
        { id: 'tasks', label: "Elders' tasks", icon: 'check', perm: 'tasks.view', count: countOpenTasks }
      ] },
      { group: 'Meetings', items: [
        { id: 'meetings', label: 'Meeting schedule', icon: 'calendar', perm: 'schedule.view' },
        { id: 'board', label: 'Assignment board', icon: 'board', perm: 'schedule.view' },
        { id: 'duties', label: 'Duty rota', icon: 'duty', perm: 'schedule.view' },
        { id: 'fairness', label: 'Who is being used', icon: 'chart', perm: 'schedule.view' },
        { id: 'attendance', label: 'Attendance', icon: 'chart', perm: 'attendance.edit' }
      ] },
      { group: 'Congregation', items: [
        { id: 'publishers', label: 'Publishers', icon: 'people', perm: 'publishers.view' },
        { id: 'reports', label: 'Field service reports', icon: 'report', perm: 'reports.review', count: countMissingReports },
        { id: 'territories', label: 'Territories', icon: 'map', perm: 'territories.view', count: countOverdueTerritories },
        { id: 'shepherding', label: 'Shepherding', icon: 'heart', perm: 'shepherding.view' }
      ] },
      { group: 'Administration', items: [
        { id: 'accounts', label: 'Accounts', icon: 'cash', perm: 'accounts.view' },
        { id: 'announcements', label: 'Announcements', icon: 'megaphone' },
        { id: 'files', label: 'Files', icon: 'copy' }
      ] },
      { group: 'Paperwork', items: [
        { id: 'print', label: 'Print & PDF', icon: 'print', perm: 'schedule.view' },
        { id: 'import', label: 'Import files', icon: 'upload', perm: 'publishers.edit' }
      ] }
    ],
    admin: [
      { group: 'Account', items: [
        { id: 'admin', label: 'Overview', icon: 'dashboard' },
        { id: 'admin-congregations', label: 'Congregations', icon: 'building' },
        { id: 'admin-users', label: 'Users & roles', icon: 'people' },
        { id: 'admin-roles', label: 'Roles & responsibilities', icon: 'shield' }
      ] },
      { group: 'Configuration', items: [
        { id: 'admin-program', label: 'Program source', icon: 'book' },
        { id: 'admin-access', label: 'Logins & sharing', icon: 'lock' },
        { id: 'admin-billing', label: 'Subscription', icon: 'cash' }
      ] },
      { group: 'Data', items: [
        { id: 'admin-data', label: 'Backup & restore', icon: 'download' },
        { id: 'admin-audit', label: 'Audit log', icon: 'shield' }
      ] }
    ]
  };

  function countOpenTasks() {
    return Store.tasks().filter(function (t) { return t.status !== 'done'; }).length;
  }
  function countMissingReports() {
    var period = U.prevPeriod(U.period(U.today()));
    return { n: Store.missingReports(period).length, alert: true };
  }
  function countOverdueTerritories() {
    var n = Store.overdueTerritories().length;
    return n ? { n: n, alert: true } : 0;
  }

  App.navFor = function (workspace) {
    return (NAV[workspace] || []).map(function (g) {
      return {
        group: g.group,
        items: g.items.filter(function (it) { return !it.perm || Auth.can(it.perm); })
      };
    }).filter(function (g) { return g.items.length; });
  };

  App.defaultViewFor = function (workspace) {
    var nav = App.navFor(workspace);
    return nav.length ? nav[0].items[0].id : 'home';
  };

  /* ---------- routing ---------- */

  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    if (!parts.length) return { view: App.defaultViewFor(Auth.workspace()), params: {} };
    return { view: parts[0], params: { id: parts[1] || null, sub: parts[2] || null } };
  }

  App.go = function (view, id, sub) {
    location.hash = '#/' + view + (id ? '/' + id : '') + (sub ? '/' + sub : '');
  };

  App.href = function (view, id) { return '#/' + view + (id ? '/' + id : ''); };

  /* ---------- chrome ---------- */

  function renderTop() {
    var top = U.clear(U.$('#topnav'));
    var me = Auth.me();

    top.appendChild(el('button.icon-btn', {
      title: 'Menu', 'aria-label': 'Toggle navigation',
      onclick: function () { U.$('#sidebar').classList.toggle('open'); }
    }, U.icon('drag', 18)));

    top.appendChild(el('div.brand', [
      el('span.brand-mark', U.icon('shield', 16)),
      el('span', [
        el('span', { text: 'Shepherd' }),
        el('small', { text: 'Congregation coordination' })
      ])
    ]));

    var cong = Store.cong();
    top.appendChild(el('button.congpicker', {
      title: 'Switch congregation',
      onclick: congPicker
    }, [
      U.icon('building', 16),
      el('span', { text: cong.name }),
      U.icon('chevronDown', 14)
    ]));

    top.appendChild(el('div.top-spacer'));

    top.appendChild(syncChip());

    var search = el('div.search-top', [U.icon('search', 16),
      el('input', { type: 'search', placeholder: 'Quick find  (people, parts, tasks)', 'aria-label': 'Quick find' })]);
    search.querySelector('input').addEventListener('input', U.debounce(function (e) {
      if (e.target.value.length > 1) quickFind(e.target.value);
    }, 300));
    top.appendChild(search);

    top.appendChild(el('button.icon-btn', {
      title: 'Switch theme',
      onclick: function () {
        Store.update(function (st) {
          st.session.theme = st.session.theme === 'dark' ? 'light' : 'dark';
        });
      }
    }, U.icon(Store.state.session.theme === 'dark' ? 'sun' : 'moon', 18)));

    top.appendChild(el('button.icon-btn', { title: 'What needs attention', onclick: function () { App.go('dashboard'); } },
      U.icon('bell', 18)));

    var avatar = me ? UI.avatar(me) : el('span.avatar.ghost', { text: '?' });
    avatar.style.cursor = 'pointer';
    avatar.title = me ? Store.name(me.id) + ' — ' + Auth.roleLabel(me) : 'Sign in';
    avatar.addEventListener('click', accountMenu);
    top.appendChild(avatar);
  }

  function syncChip() {
    var Sync = global.Sync;
    var tone = { synced: 'success', syncing: 'inprogress', offline: 'warn', error: 'removed', local: '' }[Sync.status] || '';
    var chip = el('button.congpicker', {
      title: Sync.mode === 'local'
        ? 'Everything is stored in this browser only. Run the server to share it with the congregation.'
        : 'Signed in as ' + (Sync.user ? Sync.user.name : '—') + (Sync.lastError ? ' — ' + Sync.lastError : ''),
      style: 'gap:6px',
      onclick: syncMenu
    }, [
      U.icon(Sync.mode === 'local' ? 'lock' : (Sync.status === 'offline' ? 'warn' : 'shield'), 15),
      el('span.small', { text: Sync.label() })
    ]);
    if (Sync.mode === 'local') chip.appendChild(UI.lozenge('Local', tone));
    return chip;
  }

  function syncMenu() {
    var Sync = global.Sync;
    var body = el('div.stack');
    if (Sync.mode === 'local') {
      body.appendChild(UI.banner('neutral', 'This browser only',
        'Records live in this browser. Nobody else can see them and they are gone if the browser data is cleared — take backups from Administration → Backup & restore.'));
      body.appendChild(el('div', [
        el('p', { text: 'To let the whole congregation use it, run the bundled server on one computer and open it from everyone’s phone or laptop:' }),
        el('pre.mono', { style: 'background:var(--bg-sunken);padding:12px;border-radius:4px;overflow-x:auto;margin-top:8px',
          text: 'cd shepherd\nnode server/server.js --port 8080' }),
        el('p.small.muted', { style: 'margin-top:8px',
          text: 'It prints the address to share. Everything stays on that machine — no third-party cloud.' })
      ]));
    } else {
      body.appendChild(UI.kv([
        ['Signed in as', Sync.user ? Sync.user.name : '—'],
        ['Status', Sync.label()],
        ['Last sync', Sync.lastSyncAt ? U.relative(Sync.lastSyncAt) : 'never'],
        ['Waiting to send', String(Sync.pendingCount())],
        ['Server change no.', String(Sync.seq)]
      ]));
      if (Sync.lastError) body.appendChild(UI.banner('warn', 'Last problem', Sync.lastError));
      body.appendChild(el('div.row', [
        UI.btn('Sync now', { icon: 'download', onClick: function () { Sync.push(); Sync.pull(); } }),
        UI.btn('Sign out', { variant: 'subtle', icon: 'logout', onClick: function () { Sync.logout(); } })
      ]));
    }
    UI.modal({ title: Sync.mode === 'local' ? 'Storage' : 'Shared database', body: body, closeLabel: 'Close' });
  }

  function renderRail() {
    var rail = U.clear(U.$('#rail'));
    var current = Auth.workspace();
    Auth.workspaces().forEach(function (w) {
      rail.appendChild(el('button.rail-item', {
        title: w.name + ' — ' + w.sub,
        'aria-current': String(w.id === current),
        onclick: function () {
          if (Auth.setWorkspace(w.id)) App.go(App.defaultViewFor(w.id));
        }
      }, U.icon(w.icon, 20)));
    });
    rail.appendChild(el('div.rail-sep'));
    if (global.Sync.mode === 'server') {
      rail.appendChild(el('button.rail-item', {
        title: 'Sign out',
        onclick: function () { global.Sync.logout(); }
      }, U.icon('logout', 20)));
    } else {
      rail.appendChild(el('button.rail-item', {
        title: 'Switch person (local sign-in)',
        onclick: signInPicker
      }, U.icon('logout', 20)));
    }
  }

  function renderSidebar() {
    var side = U.clear(U.$('#sidebar'));
    var ws = Auth.workspace();
    var meta = S.WORKSPACES.filter(function (w) { return w.id === ws; })[0] || S.WORKSPACES[0];

    side.appendChild(el('div.side-head', [
      el('span.side-head-icon', U.icon(meta.icon, 18)),
      el('div', [
        el('div.side-head-t', { text: meta.name }),
        el('div.side-head-s', { text: meta.sub })
      ])
    ]));

    App.navFor(ws).forEach(function (g) {
      var group = el('div.side-group');
      group.appendChild(el('div.side-group-t', { text: g.group }));
      g.items.forEach(function (it) {
        var count = typeof it.count === 'function' ? it.count() : 0;
        var n = typeof count === 'object' ? count.n : count;
        var alert = typeof count === 'object' && count.alert && n > 0;
        group.appendChild(el('a.side-link', {
          href: App.href(it.id),
          'aria-current': App.route.view === it.id ? 'page' : null
        }, [
          U.icon(it.icon, 16),
          el('span', { text: it.label }),
          n ? el('span.count' + (alert ? '.alert' : ''), { text: String(n) }) : null
        ]));
      });
      side.appendChild(group);
    });
  }

  /* ---------- menus ---------- */

  function congPicker() {
    var list = el('div.picker-list');
    Store.state.congregations.forEach(function (c) {
      list.appendChild(el('button.picker-item', {
        type: 'button',
        onclick: function () { close(); Store.setCong(c.id); UI.flag('Switched to ' + c.name); }
      }, [
        U.icon('building', 18),
        el('span', [
          el('div', { text: c.name }),
          el('div.person-sub', { text: [c.number, c.city, S.plan(c.subscription.plan).name].filter(Boolean).join(' · ') })
        ]),
        c.id === Store.congId() ? UI.lozenge('Current', 'inprogress') : null
      ]));
    });
    var close = UI.modal({
      title: 'Congregations',
      sub: 'Everything below the header — schedules, records, territories — is scoped to the congregation you pick here.',
      body: list,
      closeLabel: 'Close'
    });
  }

  function signInPicker() {
    var people = U.sortBy(Store.people(), function (p) { return p.lastName; });
    UI.personPicker({
      title: 'Sign in as',
      sub: 'This build runs entirely in your browser, so switching person is how you see each interface. On a hosted account this is your login.',
      candidates: people.map(function (p) {
        return { person: p, reasons: [Auth.roleLabel(p)], blocked: false, note: UI.personSub(p) };
      }),
      onPick: function (id) {
        if (!id) return;
        Auth.signInAs(id);
        App.go(App.defaultViewFor(Auth.workspace()));
        UI.flag('Signed in as ' + Store.name(id), Auth.roleLabel(Store.person(id)), 'success');
      }
    });
  }

  function accountMenu() {
    var me = Auth.me();
    UI.modal({
      title: me ? Store.name(me.id) : 'Not signed in',
      sub: me ? Auth.roleLabel(me) + ' · ' + Store.cong().name : null,
      body: el('div.stack', [
        me ? UI.kv([
          ['Service group', (Store.group(me.serviceGroupId) || {}).name || '—'],
          ['Workspaces', Auth.workspaces().map(function (w) { return w.name; }).join(', ')],
          ['Email', me.email || '—']
        ]) : null,
        el('div.row', [
          UI.btn('My details', { icon: 'user', onClick: function () { App.go('profile'); } }),
          UI.btn('Switch person', { icon: 'logout', onClick: signInPicker })
        ])
      ]),
      closeLabel: 'Close'
    });
  }

  function quickFind(q) {
    var results = [];
    Store.people().forEach(function (p) {
      if (U.matches(Store.name(p.id), q)) {
        results.push({ label: Store.name(p.id), sub: UI.personSub(p), icon: 'user', go: ['publishers', p.id] });
      }
    });
    Store.tasks().forEach(function (t) {
      if (U.matches(t.title, q)) results.push({ label: t.title, sub: 'Task · ' + t.category, icon: 'check', go: ['tasks', t.id] });
    });
    Store.territories().forEach(function (t) {
      if (U.matches(t.number + ' ' + t.name, q)) {
        results.push({ label: 'Territory ' + t.number + ' — ' + t.name, sub: t.type, icon: 'map', go: ['territories', t.id] });
      }
    });
    Store.weeks().forEach(function (w) {
      Store.allParts(w).forEach(function (row) {
        if (U.matches(row.part.title, q)) {
          results.push({ label: row.part.title, sub: 'Part · ' + U.fmtWeek(w.weekStart), icon: 'calendar', go: ['meetings', w.weekStart] });
        }
      });
    });

    var list = el('div.picker-list');
    results.slice(0, 30).forEach(function (r) {
      list.appendChild(el('button.picker-item', {
        type: 'button',
        onclick: function () { close(); App.go(r.go[0], r.go[1]); }
      }, [
        U.icon(r.icon, 18),
        el('span', [el('div', { text: r.label }), el('div.person-sub', { text: r.sub })])
      ]));
    });
    var close = UI.modal({
      title: 'Quick find',
      sub: results.length ? U.plural(results.length, 'match', 'matches') + ' for “' + q + '”' : 'Nothing matches “' + q + '”.',
      body: list,
      closeLabel: 'Close'
    });
  }

  /* ---------- sign-in / first-run screens (server mode) ---------- */

  function gateShell(title, sub, form) {
    U.clear(U.$('#topnav')).appendChild(el('div.brand', [
      el('span.brand-mark', U.icon('shield', 16)),
      el('span', [el('span', { text: 'Shepherd' }), el('small', { text: 'Congregation coordination' })])
    ]));
    U.clear(U.$('#rail'));
    U.clear(U.$('#sidebar'));
    var content = U.clear(U.$('#content'));
    content.appendChild(el('div', { style: 'max-width:440px;margin:6vh auto' }, [
      el('h1.page-title', { style: 'margin-bottom:6px', text: title }),
      el('p.page-sub', { style: 'margin-bottom:24px', text: sub }),
      UI.card(null, form)
    ]));
  }

  function loginScreen() {
    var email = UI.input({ type: 'email', placeholder: 'you@example.org' });
    var password = UI.input({ type: 'password' });
    var error = el('div');
    function submit() {
      U.clear(error);
      if (!email.value || !password.value) {
        error.appendChild(UI.banner('danger', 'Enter your email address and password'));
        return;
      }
      global.Sync.login(email.value.trim(), password.value).then(function (out) {
        UI.flag('Signed in', null, 'success');
        if (out && out.mustChangePassword) {
          setTimeout(function () { Views.profile.changePassword(true); }, 400);
        }
        App.render();
      }, function (err) {
        U.clear(error);
        error.appendChild(UI.banner('danger', 'Could not sign in', err.message));
      });
    }
    [email, password].forEach(function (f) {
      f.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });
    gateShell('Sign in', Store.state.congregations.length && Store.state.congregations[0].name
      ? 'Shared congregation records.' : 'Shared congregation records.', [
      error,
      UI.field('Email address', email),
      UI.field('Password', password),
      UI.btn('Sign in', { variant: 'primary', onClick: submit }),
      el('p.small.muted', { style: 'margin-top:16px',
        text: 'No login yet? An elder with administrator access creates one for you in Administration → Logins & sharing.' })
    ]);
  }

  function setupScreen() {
    var d = { firstName: '', lastName: '', email: '', password: '', congregationName: '', city: '', demo: false };
    function inp(key, opts) {
      return UI.input(Object.assign({ value: d[key], onInput: function (e) { d[key] = e.target.value; } }, opts || {}));
    }
    var error = el('div');
    gateShell('Set up this server', 'This is the first time anyone has opened it. Create the administrator account — everything is stored on this machine.', [
      error,
      el('div.grid.c2', [UI.field('Your first name', inp('firstName')), UI.field('Last name', inp('lastName'))]),
      UI.field('Email address', inp('email', { type: 'email' }), 'This is what you sign in with.'),
      UI.field('Password', inp('password', { type: 'password' }), 'At least 8 characters.'),
      UI.divider(),
      UI.field('Congregation name', inp('congregationName')),
      UI.field('Town or city', inp('city')),
      UI.checkbox('Load the demo congregation instead, to try it out first', false, function (v) { d.demo = v; },
        'Riverside and Northgate with sample publishers, schedules and records. You can clear it later.'),
      UI.btn('Create the account', { variant: 'primary', onClick: function () {
        U.clear(error);
        if (!d.email || (d.password || '').length < 8) {
          error.appendChild(UI.banner('danger', 'An email address and a password of at least 8 characters are needed'));
          return;
        }
        global.Sync.setup(d).then(function () {
          UI.flag('Server ready', 'You are signed in as the administrator.', 'success');
          App.go(App.defaultViewFor(Auth.workspace()));
          App.render();
        }, function (err) {
          U.clear(error);
          error.appendChild(UI.banner('danger', 'Setup failed', err.message));
        });
      } })
    ]);
  }

  /* ---------- render ---------- */

  App.render = function () {
    document.documentElement.setAttribute('data-theme', Store.state.session.theme || 'light');

    if (global.Sync.mode === 'server') {
      if (global.Sync.needsSetup) { setupScreen(); return; }
      if (!global.Sync.user) { loginScreen(); return; }
    }

    App.route = parseHash();
    renderTop();
    renderRail();
    renderSidebar();

    var content = U.clear(U.$('#content'));
    var view = Views[App.route.view];

    if (!Store.me()) {
      content.appendChild(UI.pageHead({ title: 'Welcome to Shepherd' }));
      content.appendChild(UI.banner('neutral', 'No one is signed in',
        'Pick a person to open the workspace. Everything is stored in this browser only.'));
      content.appendChild(UI.btn('Sign in', { variant: 'primary', icon: 'user', onClick: signInPicker }));
      return;
    }

    if (!view) {
      content.appendChild(UI.pageHead({ title: 'Page not found' }));
      content.appendChild(UI.empty('That page does not exist',
        'The link may be out of date.',
        UI.btn('Go to the overview', { variant: 'primary', onClick: function () { App.go(App.defaultViewFor(Auth.workspace())); } })));
      return;
    }

    if (view.perm && !Auth.can(view.perm)) {
      content.appendChild(UI.noAccess(view.title));
      return;
    }

    try {
      view.render(content, App.route.params);
    } catch (e) {
      console.error(e);
      content.appendChild(UI.banner('danger', 'This page hit an error', String(e && e.message || e)));
    }
    U.$('#sidebar').classList.remove('open');
  };

  /* ---------- boot ---------- */

  function boot() {
    global.Sync.init(function () {
      var server = global.Sync.mode === 'server';
      if (!Store.ready) {
        Store.init({ seed: !server, key: server ? 'shepherd.shared.v1' : 'shepherd.state.v1' });
      }
      if (server) {
        Store.onChanges = function (changes) { global.Sync.record(changes); };
        global.Sync.subscribe(function () { renderTopSafely(); });
      }
      if (!server || global.Sync.user) Store.ensureWindow(6, 10);
      start();
    });
  }

  function renderTopSafely() {
    if (global.Sync.mode === 'server' && (!global.Sync.user || global.Sync.needsSetup)) return;
    if (!U.$('#topnav')) return;
    renderTop();
  }

  function start() {
    Store.subscribe(function () { App.render(); });
    global.addEventListener('hashchange', App.render);
    global.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        e.preventDefault();
        var box = U.$('.search-top input');
        if (box) box.focus();
      }
    });
    App.render();
  }

  global.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
