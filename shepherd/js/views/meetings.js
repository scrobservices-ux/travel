/* Meeting schedule: the week's program, assignment slots, auto-fill and import. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App, Sch = global.Scheduler, Program = global.Program;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  function canEdit() { return Auth.can('schedule.edit'); }

  /* ---------- assignment slot ---------- */

  function slot(week, meeting, part, field) {
    var personId = part[field];
    var t = S.partType(part.type);
    var conflicts = Sch.conflictFor(week, part.id, field);
    var label = field === 'assistantId'
      ? (t.assistantQual === 'cbs_reader' || t.assistantQual === 'wt_reader' ? 'Reader' : 'Assistant')
      : null;

    var node = el('button.assign-slot' + (personId ? '.filled' : '') + (conflicts.length ? '.conflict' : ''), {
      type: 'button',
      disabled: !canEdit(),
      title: conflicts.length ? conflicts.map(function (c) { return c.message; }).join('\n') : (label || 'Assign'),
      onclick: function () { openPicker(week, meeting, part, field); }
    });
    if (personId) {
      node.appendChild(UI.avatar(Store.person(personId), 'sm'));
      node.appendChild(el('span', { text: Store.name(personId) + (label ? ' · ' + label : '') }));
    } else {
      node.appendChild(el('span.avatar.sm.ghost', { text: '+' }));
      node.appendChild(el('span', { text: label ? 'Add ' + label.toLowerCase() : 'Assign' }));
    }
    return node;
  }

  function openPicker(week, meeting, part, field) {
    var cands = Sch.candidatesForPart(part, week, meeting, field);
    UI.personPicker({
      title: part.title,
      sub: U.fmtDate(week[meeting].date, 'long') + ' · ranked by who has waited longest',
      candidates: cands,
      allowClear: !!part[field],
      onPick: function (personId) {
        Store.setAssignment(part.id, field, personId);
        if (personId) UI.flag('Assigned', Store.name(personId) + ' — ' + part.title, 'success');
      }
    });
  }

  /* ---------- part row ---------- */

  function partRow(week, meeting, part) {
    var t = S.partType(part.type);
    var assigns = el('div.part-assign', [slot(week, meeting, part, 'assigneeId')]);
    if (t.assistant) assigns.appendChild(slot(week, meeting, part, 'assistantId'));

    var actions = el('div.part-actions');
    if (canEdit()) {
      actions.appendChild(UI.btn('', {
        icon: part.locked ? 'lock' : 'edit', sm: true, variant: 'subtle',
        title: part.locked ? 'Locked — auto-fill will not touch it' : 'Edit this part',
        onClick: function () { editPart(week, meeting, part); }
      }));
    }
    if (part.assigneeId && part.status !== 'confirmed') {
      actions.appendChild(UI.btn(part.status === 'proposed' ? 'Notify' : 'Confirm', {
        sm: true, variant: 'subtle',
        onClick: function () {
          Store.setPartStatus(part.id, part.status === 'proposed' ? 'notified' : 'confirmed');
        }
      }));
    }

    return el('div.part', [
      el('div.part-min', { text: part.minutes ? part.minutes + ' min' : (part.no ? '#' + part.no : '') }),
      el('div', [
        el('div.part-t', [
          document.createTextNode(part.title),
          part.locked ? el('span', { style: 'margin-left:6px' }, UI.lozenge('Locked', '')) : null,
          part.status !== 'unassigned' ? el('span', { style: 'margin-left:6px' },
            UI.statusLozenge(S.PART_STATUS, part.status)) : null
        ]),
        part.source ? el('div.part-src', { text: part.source }) : null,
        part.notes ? el('div.part-src', { text: '📝 ' + part.notes }) : null
      ]),
      assigns,
      actions
    ]);
  }

  function editPart(week, meeting, part) {
    var title = UI.input({ value: part.title });
    var minutes = UI.input({ type: 'number', value: part.minutes || '', min: 0, max: 90 });
    var source = UI.input({ value: part.source, placeholder: 'e.g. th study 5, or the source material' });
    var notes = UI.textarea({ value: part.notes, placeholder: 'Note for the assignee — setting, householder, anything to prepare.' });
    var type = UI.select(Object.keys(S.PART_TYPES).map(function (k) {
      return { id: k, name: S.PART_TYPES[k].name };
    }), part.type, function (v) { part.__type = v; });
    var locked = { value: part.locked };

    UI.modal({
      title: 'Edit part',
      sub: U.fmtDate(week[meeting].date, 'long'),
      body: [
        UI.field('Title', title),
        el('div.grid.c2', [UI.field('Minutes', minutes), UI.field('Part type', type)]),
        UI.field('Source / setting', source),
        UI.field('Note to the assignee', notes),
        UI.checkbox('Lock this part', part.locked, function (v) { locked.value = v; },
          'Auto-fill will leave a locked part exactly as it is.')
      ],
      actions: [
        { label: 'Delete part', variant: 'danger', onClick: function () {
          Store.update({ action: 'part.deleted', summary: part.title }, function () {
            week[meeting].parts = week[meeting].parts.filter(function (p) { return p.id !== part.id; });
          });
        } },
        { label: 'Save', variant: 'primary', onClick: function () {
          Store.update({ action: 'part.updated', summary: title.value }, function () {
            part.title = title.value.trim() || part.title;
            part.minutes = minutes.value ? +minutes.value : null;
            part.type = part.__type || part.type;
            delete part.__type;
            part.source = source.value.trim();
            part.notes = notes.value.trim();
            part.locked = locked.value;
          });
        } }
      ]
    });
  }

  /* ---------- meeting block ---------- */

  function meetingCard(week, meeting) {
    var cong = Store.cong();
    var block = week[meeting];
    var card = el('div.prog');

    var head = el('div.prog-head', [
      el('div', [
        el('h3', { text: cong.meetings[meeting].name }),
        el('div.small.muted', { text: U.fmtDate(block.date, 'long') + ' at ' + block.time })
      ]),
      el('div.right.row', [
        block.cancelled ? UI.lozenge('Cancelled', 'removed') : null,
        canEdit() ? UI.btn('Auto-fill', {
          sm: true, icon: 'sparkle',
          onClick: function () { autoFill(week, meeting); }
        }) : null,
        canEdit() ? UI.btn('Add part', {
          sm: true, variant: 'subtle', icon: 'plus',
          onClick: function () { addPart(week, meeting); }
        }) : null
      ])
    ]);
    card.appendChild(head);

    if (block.cancelled) {
      card.appendChild(el('div', { style: 'padding:24px', class: 'muted' },
        'This meeting is cancelled' + (block.note ? ' — ' + block.note : '.')));
      return card;
    }

    var lastSection = null;
    block.parts.forEach(function (p) {
      if (p.section !== lastSection) {
        var sec = S.section(p.section);
        card.appendChild(el('div.sec-bar.' + sec.tone, { text: sec.name }));
        lastSection = p.section;
      }
      card.appendChild(partRow(week, meeting, p));
    });
    return card;
  }

  function addPart(week, meeting) {
    var title = UI.input({ placeholder: 'Part title' });
    var minutes = UI.input({ type: 'number', value: 5, min: 1, max: 90 });
    var chosen = { type: meeting === 'midweek' ? 'living' : 'public_talk', section: meeting === 'midweek' ? 'living' : 'weekend' };
    UI.modal({
      title: 'Add a part',
      body: [
        UI.field('Title', title),
        el('div.grid.c2', [
          UI.field('Minutes', minutes),
          UI.field('Type', UI.select(Object.keys(S.PART_TYPES).map(function (k) {
            return { id: k, name: S.PART_TYPES[k].name };
          }), chosen.type, function (v) { chosen.type = v; }))
        ]),
        UI.field('Section', UI.select(S.SECTIONS, chosen.section, function (v) { chosen.section = v; }))
      ],
      actions: [{ label: 'Add', variant: 'primary', onClick: function () {
        if (!title.value.trim()) return false;
        Store.update({ action: 'part.added', summary: title.value }, function () {
          var p = Program.part(chosen.section, chosen.type, title.value.trim(), +minutes.value || null);
          var parts = week[meeting].parts;
          var idx = parts.length;
          for (var i = 0; i < parts.length; i++) {
            if (parts[i].section === 'closing') { idx = i; break; }
          }
          parts.splice(idx, 0, p);
        });
      } }]
    });
  }

  function autoFill(week, meeting) {
    var result = Sch.planWeek(week, { meeting: meeting });
    if (!result.plan.length) {
      UI.flag('Nothing to fill', result.skipped.length
        ? result.skipped.length + ' slot(s) had no eligible person available.'
        : 'Every slot is already assigned.', result.skipped.length ? 'danger' : null);
      return;
    }
    var list = el('div.picker-list');
    result.plan.forEach(function (item) {
      list.appendChild(el('div.picker-item', [
        UI.avatar(Store.person(item.personId)),
        el('span', [
          el('div', { text: Store.name(item.personId) }),
          el('div.person-sub', { text: item.title + (item.field === 'assistantId' ? ' (assistant)' : '') })
        ])
      ]));
    });
    UI.modal({
      title: 'Proposed assignments',
      sub: 'Chosen by longest wait since the same kind of part, skipping anyone away or already busy that night.',
      body: [
        list,
        result.skipped.length ? UI.banner('warn', U.plural(result.skipped.length, 'slot') + ' could not be filled',
          result.skipped.map(function (s) { return s.title; }).join(', ')) : null
      ],
      actions: [{ label: 'Apply ' + result.plan.length, variant: 'primary', onClick: function () {
        Sch.applyPlan(week, result.plan);
        UI.flag('Schedule filled', U.plural(result.plan.length, 'assignment') + ' added as proposed.', 'success');
      } }]
    });
  }

  /* ---------- import ---------- */

  function importModal(weekStart) {
    var cong = Store.cong();
    var mode = { id: 'paste' };
    var body = el('div');
    var textarea = UI.textarea({ rows: 14, placeholder: 'Paste the week here…' });
    textarea.style.fontFamily = 'var(--font-mono)';
    var fileInput = el('input', { type: 'file', accept: '.json,.csv,.txt' });
    var parsedPreview = el('div', { style: 'margin-top:12px' });
    var parsedWeeks = [];

    function preview(weeks) {
      parsedWeeks = weeks;
      U.clear(parsedPreview);
      if (!weeks.length) {
        parsedPreview.appendChild(UI.banner('warn', 'Nothing recognised',
          'Check that each week starts with a heading such as “NOVEMBER 3-9” and that parts carry their “(5 min.)” timing.'));
        return;
      }
      parsedPreview.appendChild(UI.banner('success', U.plural(weeks.length, 'week') + ' recognised',
        weeks.map(function (w) {
          return U.fmtWeek(w.weekStart) + ' (' + (w.midweekParts.length + w.weekendParts.length) + ' parts)';
        }).join(' · ')));
    }

    function draw() {
      U.clear(body);
      body.appendChild(UI.btnGroup([
        { id: 'paste', label: 'Paste text' },
        { id: 'file', label: 'JSON / CSV file' },
        { id: 'feed', label: 'Configured feed' }
      ], mode.id, function (v) { mode.id = v; draw(); }));

      if (mode.id === 'paste') {
        body.appendChild(el('p.small.muted', { style: 'margin:12px 0',
          text: 'Copy the week from the material your congregation already has and paste it below. Headings, numbered parts and “(n min.)” timings are recognised; existing assignees are kept where the part still matches.' }));
        body.appendChild(textarea);
        body.appendChild(el('div.row', { style: 'margin-top:8px' }, [
          UI.btn('Parse', { icon: 'sparkle', onClick: function () {
            preview(Program.parseText(textarea.value, { startWeek: weekStart }));
          } }),
          UI.btn('Load a sample', { variant: 'subtle', onClick: function () {
            textarea.value = Program.SAMPLE;
            preview(Program.parseText(textarea.value, { startWeek: weekStart }));
          } })
        ]));
      } else if (mode.id === 'file') {
        body.appendChild(el('p.small.muted', { style: 'margin:12px 0',
          text: 'JSON: [{ "week": "2026-11-03", "parts": [{ "section": "treasures", "title": "…", "minutes": 10 }] }]. CSV: week,section,no,title,minutes,source.' }));
        body.appendChild(fileInput);
      } else {
        var src = cong.programSource || {};
        body.appendChild(el('p.small.muted', { style: 'margin:12px 0',
          text: 'Shepherd does not scrape the publisher’s website — that content is copyrighted and their terms do not allow it. An administrator can point this at a feed your congregation is licensed to read, and it will be pulled in here.' }));
        body.appendChild(UI.kv([
          ['Endpoint', src.endpoint || el('span.muted', { text: 'Not configured' })],
          ['Acknowledged', src.acknowledged ? 'Yes' : 'No'],
          ['Last import', src.lastImportedAt ? U.relative(src.lastImportedAt) : 'Never']
        ]));
        body.appendChild(el('div.row', { style: 'margin-top:12px' }, [
          UI.btn('Fetch now', { icon: 'download', disabled: !src.endpoint || !src.acknowledged, onClick: function () {
            Program.fetchFeed(cong).then(function (weeks) { preview(weeks); }, function (err) {
              UI.flag('Feed failed', err.message, 'danger');
            });
          } }),
          UI.btn('Open program source settings', { variant: 'subtle', onClick: function () { App.go('admin-program'); } })
        ]));
      }
      body.appendChild(parsedPreview);
    }

    fileInput.addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      U.readFile(f, function (err, text) {
        if (err) { UI.flag('Could not read the file', String(err), 'danger'); return; }
        try {
          preview(/\.csv$/i.test(f.name) ? Program.parseCSV(text)
            : (/^\s*[[{]/.test(text) ? Program.parseJSON(text) : Program.parseText(text)));
        } catch (ex) {
          UI.flag('Could not parse the file', ex.message, 'danger');
        }
      });
    });

    draw();

    UI.modal({
      wide: true,
      title: 'Import meeting programs',
      sub: 'Weeks that do not exist yet are created; assignments already made are carried over.',
      body: body,
      actions: [{ label: 'Import', variant: 'primary', onClick: function () {
        if (!parsedWeeks.length) { UI.flag('Nothing to import', 'Parse a program first.', 'danger'); return false; }
        var n = 0;
        Store.update({ action: 'program.imported', summary: U.plural(parsedWeeks.length, 'week') + ' imported' }, function () {
          parsedWeeks.forEach(function (pw) {
            var wk = Store.week(pw.weekStart);
            if (!wk) {
              wk = Program.buildWeek(Store.cong(), pw.weekStart);
              Store.state.weeks.push(wk);
            }
            Program.applyParsed(wk, pw);
            n++;
          });
          var c = Store.cong();
          c.programSource.lastImportedAt = Date.now();
        });
        UI.flag('Program imported', U.plural(n, 'week') + ' updated.', 'success');
        App.go('meetings', parsedWeeks[0].weekStart);
      } }]
    });
  }

  /* ---------- the view ---------- */

  Views.meetings = {
    title: 'the meeting schedule',
    perm: 'schedule.view',
    render: function (root, params) {
      var cong = Store.cong();
      var weekStart = params.id && /^\d{4}-\d{2}-\d{2}$/.test(params.id)
        ? U.weekStart(params.id) : U.weekStart(U.today());
      var week = Store.week(weekStart) || Store.ensureWeek(weekStart);
      var conflicts = Sch.conflicts(week);

      root.appendChild(UI.pageHead({
        crumbs: [{ label: cong.name }, { label: 'Meeting schedule' }],
        title: 'Week of ' + U.fmtWeek(weekStart),
        sub: week.bibleReading ? 'Bible reading: ' + week.bibleReading : (week.source === 'skeleton'
          ? 'Standard week structure — import the published program to fill in the titles.' : ''),
        actions: [
          UI.dateNav(U.fmtWeek(weekStart),
            function () { App.go('meetings', U.addDays(weekStart, -7)); },
            function () { App.go('meetings', U.addDays(weekStart, 7)); },
            function () { App.go('meetings', U.weekStart(U.today())); }),
          canEdit() ? UI.btn('Import program', { icon: 'upload', onClick: function () { importModal(weekStart); } }) : null,
          canEdit() ? UI.btn('Auto-fill week', { variant: 'primary', icon: 'sparkle', onClick: function () { autoFill(week, null); } }) : null,
          UI.btn('Print', { variant: 'subtle', icon: 'print', onClick: function () { global.print(); } }),
          UI.copyBtn(function () {
            return Program.weekToText(week, cong, function (id) { return Store.name(id); });
          }, 'Copy')
        ].filter(Boolean)
      }));

      if (conflicts.length) {
        root.appendChild(UI.banner('danger', U.plural(conflicts.length, 'clash', 'clashes') + ' on this week',
          conflicts.map(function (c) { return c.message; }).join(' · ')));
      }

      var unfilled = Store.allParts(week).filter(function (r) {
        var t = S.partType(r.part.type);
        return !r.part.assigneeId || (t.assistant && !r.part.assistantId);
      }).length;
      if (unfilled && canEdit()) {
        root.appendChild(UI.banner('warn', U.plural(unfilled, 'slot') + ' still unassigned',
          'Auto-fill proposes names, then you confirm or change any of them.'));
      }

      root.appendChild(el('div.stack', [
        meetingCard(week, 'midweek'),
        meetingCard(week, 'weekend')
      ]));

      /* week strip */
      root.appendChild(UI.sectionTitle('Coming weeks'));
      var strip = el('div.hstack-scroll');
      Store.weeks().filter(function (w) { return w.weekStart >= U.addDays(weekStart, -14); })
        .slice(0, 10).forEach(function (w) {
          var filled = Store.allParts(w).filter(function (r) { return r.part.assigneeId; }).length;
          var total = Store.allParts(w).length;
          strip.appendChild(el('button.card.flat', {
            style: 'min-width:180px;cursor:pointer;text-align:left;border-color:' + (w.weekStart === weekStart ? 'var(--B400)' : 'var(--border)'),
            onclick: function () { App.go('meetings', w.weekStart); }
          }, [
            el('div.small.muted', { text: U.fmtWeek(w.weekStart) }),
            el('div', { style: 'font-weight:600;margin:4px 0', text: filled + ' / ' + total + ' assigned' }),
            UI.meter(filled / total, filled === total ? 'good' : filled / total > 0.5 ? '' : 'warn'),
            w.source === 'imported' ? el('div', { style: 'margin-top:8px' }, UI.lozenge('Program in', 'success')) : null
          ]));
        });
      root.appendChild(strip);

      if (canEdit()) {
        root.appendChild(UI.sectionTitle('Week settings'));
        root.appendChild(weekSettings(week));
      }
    }
  };

  function weekSettings(week) {
    var cong = Store.cong();
    var card = el('div.card');
    var grid = el('div.grid.c2');
    ['midweek', 'weekend'].forEach(function (meeting) {
      var block = week[meeting];
      var note = UI.input({ value: block.note, placeholder: 'e.g. circuit overseer visit, assembly week' });
      grid.appendChild(el('div', [
        el('strong', { text: cong.meetings[meeting].name }),
        UI.field('Date', UI.input({ type: 'date', value: block.date, onChange: function (e) {
          Store.update(function () { block.date = e.target.value; });
        } })),
        UI.field('Time', UI.input({ type: 'time', value: block.time, onChange: function (e) {
          Store.update(function () { block.time = e.target.value; });
        } })),
        UI.field('Note', note),
        UI.checkbox('Meeting not held this week', block.cancelled, function (v) {
          Store.update({ action: 'meeting.cancelled', summary: cong.meetings[meeting].name + ' ' + U.fmtDate(block.date) },
            function () { block.cancelled = v; block.note = note.value; });
        }, 'Assembly, convention or memorial week.')
      ]));
    });
    card.appendChild(grid);
    card.appendChild(el('div.row', { style: 'margin-top:12px' }, [
      UI.btn('Save notes', { onClick: function () {
        var inputs = U.$$('input[placeholder^="e.g. circuit"]', card);
        Store.update({ action: 'week.updated', summary: U.fmtWeek(week.weekStart) }, function () {
          week.midweek.note = inputs[0].value;
          week.weekend.note = inputs[1].value;
        });
        UI.flag('Saved', null, 'success');
      } }),
      UI.btn('Clear all assignments on this week', { variant: 'subtle', onClick: function () {
        UI.confirm({ title: 'Clear this week?', body: 'Every assignment on both meetings will be emptied.', danger: true, confirmLabel: 'Clear' },
          function () {
            Store.update({ action: 'week.cleared', summary: U.fmtWeek(week.weekStart) }, function () {
              Store.allParts(week).forEach(function (r) {
                r.part.assigneeId = null; r.part.assistantId = null; r.part.status = 'unassigned';
              });
            });
          });
      } })
    ]));
    return card;
  }
})(typeof window !== 'undefined' ? window : globalThis);
