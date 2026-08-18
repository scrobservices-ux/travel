/* The circuit overseer's visit: the dates, and who is doing what by when. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App, CO = global.CO;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  function canEdit() { return Auth.can('covisit.manage'); }

  function putVisit(visit, action) {
    Store.update({ action: action || 'covisit.saved', summary: U.fmtDate(visit.from) }, function (st) {
      var i = st.covisits.map(function (v) { return v.id; }).indexOf(visit.id);
      if (i === -1) st.covisits.push(visit); else st.covisits[i] = visit;
    });
  }

  function current() {
    var id = App.route && App.route.params && App.route.params.id;
    if (id) return U.by(Store.covisits(), id);
    return CO.next() || Store.covisits()[Store.covisits().length - 1] || null;
  }

  /* ---------- the page ---------- */

  Views.covisit = {
    title: 'circuit overseer visit',
    perm: 'covisit.view',
    render: function (root) {
      var visit = current();
      var visits = Store.covisits();

      root.appendChild(UI.pageHead({
        title: 'Circuit overseer’s visit',
        sub: 'Everything that needs doing beforehand, with a name and a date against each one.',
        actions: [
          visits.length > 1 ? UI.select(visits.map(function (v) {
            return { id: v.id, name: U.fmtDate(v.from) + (v.coName ? ' — ' + v.coName : '') };
          }), visit && visit.id, function (id) { App.go('covisit/' + id); }) : null,
          canEdit() ? UI.btn('Plan a visit', { variant: 'primary', icon: 'plus', onClick: planVisit }) : null
        ].filter(Boolean)
      }));

      if (!visit) {
        root.appendChild(UI.empty('No visit planned yet',
          canEdit()
            ? 'Put in the week he is coming and the whole checklist is laid out and dated back from it — each brother sees his own part of it.'
            : 'Nothing has been put in yet.',
          canEdit() ? UI.btn('Plan a visit', { variant: 'primary', onClick: planVisit }) : null));
        return;
      }

      var p = CO.progress(visit);
      var status = S.COVISIT_STATUS.filter(function (s) { return s.id === CO.status(visit); })[0];
      var daysAway = U.diffDays(U.today(), visit.from);

      root.appendChild(el('div.grid.c4', [
        UI.stat('The visit', U.fmtDate(visit.from, 'day'),
          visit.coName ? visit.coName : (daysAway > 0 ? U.plural(daysAway, 'day') + ' away' : 'This week'),
          status ? status.tone : ''),
        UI.stat('Ready', p.percent + '%', p.done + ' of ' + p.total + ' done',
          p.percent === 100 ? 'success' : ''),
        UI.stat('Overdue', String(p.overdue), p.overdue ? 'needs chasing' : 'nothing late',
          p.overdue ? 'removed' : 'success'),
        UI.stat('This week', String(p.soon), 'due in the next seven days', p.soon ? 'warn' : '')
      ]));
      root.appendChild(UI.meter(p.total ? p.done / p.total : 0, p.overdue ? 'warn' : 'success'));

      if (p.unassigned) {
        root.appendChild(UI.banner('warn', U.plural(p.unassigned, 'job') + ' with nobody against it',
          'Nobody in the congregation holds the role that normally carries it. Open the job and put a name to it.'));
      }

      /* what is mine */
      var me = Store.me();
      var mine = me ? CO.tasksFor(visit, me.id) : [];
      if (mine.length) {
        root.appendChild(UI.sectionTitle('What is mine'));
        root.appendChild(UI.card(null, [
          el('p.small.muted', { style: 'margin-bottom:10px',
            text: 'Tick these off as you do them. Everyone can see how ready the congregation is, not who is behind.' }),
          el('div', U.sortBy(mine, function (t) { return t.dueOn; }).map(function (t) {
            return taskLine(visit, t, true);
          }))
        ], { icon: 'user' }));
      }

      /* the whole checklist by stage */
      root.appendChild(UI.sectionTitle('The whole list', canEdit()
        ? UI.btn('Add a job', { sm: true, icon: 'plus', onClick: function () { editTask(visit, null); } })
        : null));

      CO.stages(visit).forEach(function (stage) {
        root.appendChild(UI.card(stage.name + ' · ' + stage.sub,
          stage.tasks.map(function (t) { return taskLine(visit, t, false); }),
          { icon: 'clock' }));
      });

      /* who is carrying what */
      root.appendChild(UI.sectionTitle('Who is carrying what'));
      var by = U.sortBy(CO.byPerson(visit), function (b) { return b.personId ? 0 : 1; });
      root.appendChild(UI.table([
        { key: 'who', label: 'Brother', render: function (b) {
          return b.personId ? UI.person(b.personId) : el('span.muted', { text: 'Nobody yet' });
        } },
        { key: 'jobs', label: 'Jobs', render: function (b) { return String(b.tasks.length); } },
        { key: 'done', label: 'Done', render: function (b) {
          return UI.lozenge(b.done + ' / ' + b.tasks.length, b.done === b.tasks.length ? 'success' : '');
        } },
        { key: 'next', label: 'Next one due', render: function (b) {
          var open = b.tasks.filter(function (t) { return !t.doneAt; })[0];
          return open ? U.fmtDate(open.dueOn) + ' — ' + open.title : '—';
        } }
      ], by, { minWidth: 640 }));

      if (canEdit()) {
        root.appendChild(UI.sectionTitle('The visit itself'));
        root.appendChild(UI.card(null, [
          UI.kv([
            ['Arrives', U.fmtDate(visit.from, 'long')],
            ['Leaves', U.fmtDate(visit.to, 'long')],
            ['Circuit overseer', visit.coName || '—'],
            ['His wife', visit.coWifeName || '—'],
            ['Service talk / public talk', visit.talkTitle || '—'],
            ['Notes', visit.notes || '—']
          ]),
          el('div.row', { style: 'margin-top:12px' }, [
            UI.btn('Change the details', { icon: 'edit', onClick: function () { planVisit(visit); } }),
            visit.closedAt
              ? UI.btn('Re-open', { variant: 'subtle', onClick: function () {
                var copy = U.clone(visit); copy.closedAt = null; putVisit(copy, 'covisit.reopened');
              } })
              : UI.btn('Close it off', { variant: 'subtle', icon: 'check', onClick: function () {
                UI.confirm({
                  title: 'Close this visit off?',
                  body: 'It stays on record, and the next visit starts from what was learned at this one.'
                }, function () {
                  var copy = U.clone(visit); copy.closedAt = Date.now(); putVisit(copy, 'covisit.closed');
                });
              } })
          ])
        ], { icon: 'shield' }));
      }
    }
  };

  /* one line of the checklist */
  function taskLine(visit, task, personal) {
    var st = CO.taskState(task);
    var mine = Store.me() && task.personId === Store.me().id;
    var canTick = mine || canEdit();

    return el('div.checkrow', { style: 'display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border)' }, [
      el('input', {
        type: 'checkbox', checked: !!task.doneAt, disabled: !canTick,
        style: 'margin-top:3px',
        onchange: function (e) {
          var copy = U.clone(visit);
          var t = copy.tasks.filter(function (x) { return x.id === task.id; })[0];
          if (!t) return;
          if (e.target.checked) { t.doneAt = Date.now(); t.doneBy = Store.me() ? Store.me().id : null; }
          else { t.doneAt = null; t.doneBy = null; }
          putVisit(copy, e.target.checked ? 'covisit.task.done' : 'covisit.task.reopened');
        }
      }),
      el('div', { style: 'flex:1' }, [
        el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [
          el('strong', { text: task.title, style: task.doneAt ? 'text-decoration:line-through;opacity:.6' : '' }),
          UI.lozenge(st.name, st.tone),
          !personal && task.personId ? UI.person(task.personId) : null,
          !task.personId ? UI.lozenge('nobody yet', 'warn') : null
        ]),
        task.detail ? el('div.small.muted', { text: task.detail }) : null,
        el('div.small.muted', { text: 'Wanted by ' + U.fmtDate(task.dueOn, 'day')
          + (task.role ? ' · normally the ' + S.roleName(task.role).toLowerCase() : '')
          + (task.doneAt && task.doneBy ? ' · done by ' + Store.name(task.doneBy) : '') }),
        task.note ? el('div.small', { text: '“' + task.note + '”' }) : null
      ]),
      canEdit() || mine
        ? UI.btn('', { icon: 'edit', sm: true, variant: 'subtle', title: 'Change',
          onClick: function () { editTask(visit, task); } })
        : null
    ]);
  }

  /* ---------- planning a visit ---------- */

  function planVisit(existing) {
    var draft = existing ? {
      from: existing.from, to: existing.to, coName: existing.coName,
      coWifeName: existing.coWifeName, talkTitle: existing.talkTitle, notes: existing.notes
    } : {
      from: U.addDays(U.weekStart(U.today()), 56), to: '', coName: '', coWifeName: '',
      talkTitle: '', notes: ''
    };
    if (!draft.to) draft.to = U.addDays(draft.from, 5);

    var fromInput = UI.input({ type: 'date', value: draft.from, onInput: function (e) {
      draft.from = e.target.value;
      if (draft.from && (!draft.to || draft.to < draft.from)) {
        draft.to = U.addDays(draft.from, 5);
        toInput.value = draft.to;
      }
    } });
    var toInput = UI.input({ type: 'date', value: draft.to, onInput: function (e) { draft.to = e.target.value; } });

    UI.modal({
      wide: true,
      title: existing ? 'The visit' : 'Plan the circuit overseer’s visit',
      sub: existing ? null
        : 'Put in the week and every job is laid out and dated back from it. Nothing is fixed — re-date anything, hand it to somebody else, add your own.',
      body: [
        el('div.grid.c2', [UI.field('He arrives', fromInput), UI.field('He leaves', toInput)]),
        el('div.grid.c2', [
          UI.field('Circuit overseer', UI.input({ value: draft.coName, onInput: function (e) { draft.coName = e.target.value; } })),
          UI.field('His wife', UI.input({ value: draft.coWifeName, onInput: function (e) { draft.coWifeName = e.target.value; } }))
        ]),
        UI.field('Service talk / public talk', UI.input({ value: draft.talkTitle, onInput: function (e) { draft.talkTitle = e.target.value; } })),
        UI.field('Notes', UI.textarea({ value: draft.notes, rows: 3, onInput: function (e) { draft.notes = e.target.value; } }))
      ],
      actions: [{ label: existing ? 'Save' : 'Lay out the preparation', variant: 'primary', onClick: function () {
        if (!draft.from) { UI.flag('When is he coming?', 'Put in the day he arrives.', 'danger'); return false; }
        if (draft.to < draft.from) { UI.flag('Check the dates', 'He cannot leave before he arrives.', 'danger'); return false; }
        if (existing) {
          var copy = U.clone(existing);
          copy.coName = draft.coName; copy.coWifeName = draft.coWifeName;
          copy.talkTitle = draft.talkTitle; copy.notes = draft.notes;
          CO.reschedule(copy, draft.from, draft.to);
          putVisit(copy, 'covisit.updated');
          UI.flag('Saved', 'Anything not yet done has moved with the dates.', 'success');
        } else {
          var visit = CO.build(draft);
          putVisit(visit, 'covisit.planned');
          App.go('covisit/' + visit.id);
          UI.flag('Laid out', U.plural(visit.tasks.length, 'job') + ' dated back from his arrival. Each brother will be reminded of his own.', 'success');
        }
      } }]
    });
  }

  /* ---------- one job ---------- */

  function editTask(visit, task) {
    var isNew = !task;
    var draft = task ? U.clone(task) : {
      id: U.uid('cot'), key: 'extra', title: '', detail: '', role: null,
      personId: null, weeksBefore: 2, dueOn: CO.dueOn(visit.from, 2),
      doneAt: null, doneBy: null, note: ''
    };
    var onlyMine = !canEdit();
    var body = el('div');

    if (!onlyMine) {
      body.appendChild(UI.field('What needs doing', UI.input({
        value: draft.title, onInput: function (e) { draft.title = e.target.value; }
      })));
      body.appendChild(UI.field('A little more', UI.textarea({
        value: draft.detail, rows: 2, onInput: function (e) { draft.detail = e.target.value; }
      })));
      body.appendChild(el('div.grid.c2', [
        UI.field('Wanted by', UI.input({ type: 'date', value: draft.dueOn, onInput: function (e) {
          draft.dueOn = e.target.value;
          draft.weeksBefore = Math.round(U.diffDays(draft.dueOn, visit.from) / 7);
        } }), 'Counted back from the day he arrives.'),
        UI.field('Whose job', el('div', [
          el('div', { id: 'co-who' }, [draft.personId ? UI.person(draft.personId) : el('span.muted', { text: 'Nobody yet' })]),
          UI.btn('Choose', { sm: true, variant: 'subtle', style: 'margin-top:6px', onClick: function () {
            // the elders and servants first, but anyone in the congregation is allowed
            var brothers = Store.people().filter(function (p) {
              return p.status !== 'inactive' && p.status !== 'moved' && p.gender === 'm';
            });
            var elders = brothers.filter(function (p) {
              return p.appointment === 'elder' || p.appointment === 'servant';
            });
            var asCandidates = function (list, note) {
              return U.sortBy(list, function (p) { return p.lastName + p.firstName; })
                .map(function (p) { return { person: p, note: note, reasons: [] }; });
            };
            UI.personPicker({
              title: 'Who is doing this?',
              sub: 'Normally ' + (draft.role ? S.roleName(draft.role).toLowerCase() : 'the coordinator') + ', but it can be anyone.',
              candidates: asCandidates(elders, null),
              onEveryone: function () { return asCandidates(brothers, null); },
              onPick: function (id) {
                draft.personId = id;
                var slot = body.querySelector('#co-who');
                if (slot) { U.clear(slot); slot.appendChild(UI.person(id)); }
              }
            });
          } })
        ]))
      ]));
    } else {
      body.appendChild(el('p.small.muted', { text: 'You can add a note against your own job. Only the coordinator can move it or hand it to somebody else.' }));
    }
    body.appendChild(UI.field('Note', UI.input({
      value: draft.note, placeholder: 'Where it has got to…',
      onInput: function (e) { draft.note = e.target.value; }
    })));

    UI.modal({
      title: isNew ? 'Add a job' : draft.title,
      body: body,
      actions: [
        !isNew && !onlyMine ? { label: 'Strike it out', variant: 'subtle', onClick: function () {
          var copy = U.clone(visit);
          copy.tasks = copy.tasks.filter(function (t) { return t.id !== draft.id; });
          putVisit(copy, 'covisit.task.removed');
        } } : null,
        { label: 'Save', variant: 'primary', onClick: function () {
          if (!draft.title.trim()) { UI.flag('What is it?', 'Give the job a name.', 'danger'); return false; }
          var copy = U.clone(visit);
          var i = copy.tasks.map(function (t) { return t.id; }).indexOf(draft.id);
          if (i === -1) copy.tasks.push(draft); else copy.tasks[i] = draft;
          putVisit(copy, 'covisit.task.saved');
          UI.flag('Saved', null, 'success');
        } }
      ].filter(Boolean)
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
