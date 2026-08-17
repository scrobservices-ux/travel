/* The body of elders' task board and meeting agenda. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var state = { tab: 'board', mine: false, category: '' };

  function newTask(prefill) {
    var draft = Object.assign({
      title: '', detail: '', category: S.TASK_CATEGORIES[0], status: 'backlog',
      priority: 'medium', dueOn: U.addDays(U.today(), 14), assigneeIds: [], agendaFor: null
    }, prefill || {});

    var elders = Store.people().filter(function (p) {
      return p.appointment === 'elder' || p.appointment === 'servant';
    });
    var grid = el('div.checkgrid');
    elders.forEach(function (e) {
      grid.appendChild(UI.checkbox(Store.name(e.id), draft.assigneeIds.indexOf(e.id) !== -1, function (v) {
        draft.assigneeIds = draft.assigneeIds.filter(function (x) { return x !== e.id; });
        if (v) draft.assigneeIds.push(e.id);
      }));
    });

    UI.modal({
      wide: true,
      title: 'New task',
      body: [
        UI.field('Title', UI.input({ value: draft.title, placeholder: 'What needs doing?', onInput: function (e) { draft.title = e.target.value; } })),
        UI.field('Detail', UI.textarea({ value: draft.detail, onInput: function (e) { draft.detail = e.target.value; } })),
        el('div.grid.c3', [
          UI.field('Category', UI.select(S.TASK_CATEGORIES, draft.category, function (v) { draft.category = v; })),
          UI.field('Priority', UI.select(S.PRIORITIES, draft.priority, function (v) { draft.priority = v; })),
          UI.field('Due', UI.input({ type: 'date', value: draft.dueOn, onInput: function (e) { draft.dueOn = e.target.value; } }))
        ]),
        el('fieldset', [el('legend', { text: 'Who is caring for it' }), grid]),
        UI.checkbox('Put on the next elders’ meeting agenda', draft.agendaFor === 'next', function (v) {
          draft.agendaFor = v ? 'next' : null;
        })
      ],
      actions: [{ label: 'Create', variant: 'primary', onClick: function () {
        if (!draft.title.trim()) { UI.flag('A title is needed', null, 'danger'); return false; }
        Store.update({ action: 'task.created', summary: draft.title }, function (st) {
          st.tasks.push(Object.assign({
            id: U.uid('task'), congId: Store.congId(), createdBy: Auth.me().id,
            createdAt: Date.now(), comments: []
          }, draft));
        });
        UI.flag('Task created', draft.title, 'success');
      } }]
    });
  }

  function openTask(task) {
    var comment = UI.textarea({ placeholder: 'Add a note on progress…', rows: 3 });
    var body = el('div.stack', [
      UI.kv([
        ['Status', UI.statusLozenge(S.TASK_STATUS, task.status)],
        ['Priority', UI.statusLozenge(S.PRIORITIES, task.priority)],
        ['Category', task.category],
        ['Due', task.dueOn ? U.fmtDate(task.dueOn, 'long') : '—'],
        ['Caring for it', task.assigneeIds.length ? UI.avatarGroup(task.assigneeIds, 6) : null],
        ['Raised by', Store.name(task.createdBy) + ' · ' + U.relative(task.createdAt)],
        ['Agenda', task.agendaFor === 'next' ? UI.lozenge('Next elders’ meeting', 'inprogress') : null]
      ]),
      task.detail ? el('p', { text: task.detail }) : null,
      UI.divider(),
      el('strong', { text: 'Notes' }),
      (task.comments && task.comments.length)
        ? el('ul.timeline', task.comments.map(function (c) {
          return el('li', [
            el('strong', { text: Store.name(c.personId) }),
            el('span.small.muted', { text: ' · ' + U.relative(c.at) }),
            el('p', { text: c.text })
          ]);
        }))
        : el('div.muted', { text: 'No notes yet.' }),
      Auth.can('tasks.edit') ? comment : null,
      Auth.can('tasks.edit') ? UI.btn('Add note', {
        onClick: function () {
          if (!comment.value.trim()) return;
          Store.update({ action: 'task.comment', summary: task.title }, function () {
            task.comments = task.comments || [];
            task.comments.push({ personId: Auth.me().id, at: Date.now(), text: comment.value.trim() });
          });
        }
      }) : null
    ]);

    UI.modal({
      wide: true,
      title: task.title,
      body: body,
      actions: Auth.can('tasks.edit') ? [
        { label: 'Delete', variant: 'danger', onClick: function () {
          Store.update({ action: 'task.deleted', summary: task.title }, function (st) {
            st.tasks = st.tasks.filter(function (t) { return t.id !== task.id; });
          });
        } },
        { label: task.status === 'done' ? 'Re-open' : 'Mark done', variant: 'primary', onClick: function () {
          Store.update({ action: 'task.status', summary: task.title }, function () {
            task.status = task.status === 'done' ? 'inprogress' : 'done';
          });
        } }
      ] : []
    });
  }

  function visibleTasks() {
    return Store.tasks().filter(function (t) {
      if (state.mine && t.assigneeIds.indexOf(Auth.me().id) === -1) return false;
      if (state.category && t.category !== state.category) return false;
      return true;
    });
  }

  function board(root) {
    var all = visibleTasks();
    var wrap = el('div.board');
    S.TASK_STATUS.forEach(function (col) {
      var list = U.sortBy(all.filter(function (t) { return t.status === col.id; }),
        function (t) { return t.dueOn || '9999'; });
      var bodyEl = el('div.col-body');
      list.forEach(function (t) {
        var overdue = t.dueOn && t.dueOn < U.today() && t.status !== 'done';
        bodyEl.appendChild(el('div.tile.task', {
          draggable: Auth.can('tasks.edit') ? 'true' : null,
          onclick: function () { openTask(t); },
          ondragstart: function (e) { e.dataTransfer.setData('text/plain', t.id); },
          style: 'border-left-color:' + (t.priority === 'high' ? 'var(--R400)' : t.priority === 'low' ? 'var(--N60)' : 'var(--Y400)')
        }, [
          el('div.tile-t', { text: t.title }),
          el('div.tile-m', [
            UI.tag(t.category),
            t.dueOn ? el('span', { style: overdue ? 'color:var(--R400);font-weight:600' : '', text: U.fmtDate(t.dueOn) }) : null,
            el('span.right', UI.avatarGroup(t.assigneeIds, 3))
          ])
        ]));
      });
      if (!list.length) bodyEl.appendChild(el('div.muted.small', { style: 'padding:12px;text-align:center', text: 'Empty' }));

      var column = el('div.col', {
        ondragover: function (e) { if (Auth.can('tasks.edit')) { e.preventDefault(); column.classList.add('drop-target'); } },
        ondragleave: function () { column.classList.remove('drop-target'); },
        ondrop: function (e) {
          e.preventDefault();
          column.classList.remove('drop-target');
          var id = e.dataTransfer.getData('text/plain');
          var task = U.by(Store.tasks(), id);
          if (task && task.status !== col.id) {
            Store.update({ action: 'task.status', summary: task.title + ' → ' + col.name }, function () {
              task.status = col.id;
            });
          }
        }
      }, [
        el('div.col-head', [el('span', { text: col.name }), el('span.count', { text: String(list.length) })]),
        bodyEl
      ]);
      wrap.appendChild(column);
    });
    root.appendChild(wrap);
  }

  function agenda(root) {
    var items = Store.tasks().filter(function (t) { return t.agendaFor === 'next' && t.status !== 'done'; });
    root.appendChild(UI.card('Agenda — next elders’ meeting', [
      items.length ? el('ol', { style: 'padding-left:20px;list-style:decimal' }, items.map(function (t) {
        return el('li', { style: 'margin-bottom:10px' }, [
          el('strong', { text: t.title }),
          el('div.small.muted', { text: t.category + (t.dueOn ? ' · due ' + U.fmtDate(t.dueOn) : '') }),
          t.detail ? el('div.small', { text: t.detail }) : null,
          el('div', { style: 'margin-top:4px' }, UI.avatarGroup(t.assigneeIds, 4))
        ]);
      })) : el('div.muted', { text: 'Nothing has been put on the agenda yet — tick “put on the next agenda” on a task.' }),
      el('div', { style: 'margin-top:16px' }, UI.copyBtn(function () {
        return 'Elders’ meeting agenda — ' + Store.cong().name + '\n\n' + items.map(function (t, i) {
          return (i + 1) + '. ' + t.title + (t.assigneeIds.length ? ' (' + t.assigneeIds.map(function (id) { return Store.name(id); }).join(', ') + ')' : '');
        }).join('\n');
      }, 'Copy the agenda'))
    ], { icon: 'book' }));

    root.appendChild(UI.sectionTitle('Recently completed'));
    var done = U.sortBy(Store.tasks().filter(function (t) { return t.status === 'done'; }),
      function (t) { return t.createdAt; }, 'desc').slice(0, 10);
    root.appendChild(UI.table([
      { key: 'title', label: 'Task' },
      { key: 'category', label: 'Category' },
      { key: 'who', label: 'Cared for by', render: function (t) { return UI.avatarGroup(t.assigneeIds, 4); } },
      { key: 'due', label: 'Due', render: function (t) { return t.dueOn ? U.fmtDate(t.dueOn) : '—'; } }
    ], done, { empty: 'Nothing completed yet.' }));
  }

  Views.tasks = {
    title: 'the task board',
    perm: 'tasks.view',
    render: function (root, params) {
      if (params.id) {
        var t = U.by(Store.tasks(), params.id);
        if (t) setTimeout(function () { openTask(t); }, 10);
      }
      var open = Store.tasks().filter(function (t) { return t.status !== 'done'; });
      var overdue = open.filter(function (t) { return t.dueOn && t.dueOn < U.today(); });

      root.appendChild(UI.pageHead({
        crumbs: [{ label: Store.cong().name }, { label: "Elders' tasks" }],
        title: "Elders' tasks",
        sub: U.plural(open.length, 'open task') + (overdue.length ? ' · ' + overdue.length + ' overdue' : ''),
        actions: [
          Auth.can('tasks.edit') ? UI.btn('New task', { variant: 'primary', icon: 'plus', onClick: function () { newTask(); } }) : null
        ].filter(Boolean)
      }));

      if (overdue.length) {
        root.appendChild(UI.banner('warn', U.plural(overdue.length, 'task') + ' past its due date',
          overdue.slice(0, 5).map(function (t) { return t.title; }).join(' · ')));
      }

      root.appendChild(UI.tabs([
        { id: 'board', label: 'Board' },
        { id: 'agenda', label: 'Meeting agenda' }
      ], state.tab, function (v) { state.tab = v; App.render(); }));

      var bar = el('div.row', { style: 'margin-bottom:16px' }, [
        UI.select([{ id: '', name: 'All categories' }].concat(S.TASK_CATEGORIES), state.category,
          function (v) { state.category = v; App.render(); }),
        UI.btn('Only mine', { pressed: state.mine, onClick: function () { state.mine = !state.mine; App.render(); } })
      ]);
      bar.querySelector('select').style.maxWidth = '220px';
      root.appendChild(bar);

      if (state.tab === 'board') board(root);
      else agenda(root);
    },
    newTask: newTask
  };
})(typeof window !== 'undefined' ? window : globalThis);
