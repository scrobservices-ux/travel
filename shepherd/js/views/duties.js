/* Duty rota: attendants, audio/video, microphones, platform, cleaning, Zoom host. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App, Sch = global.Scheduler;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var state = { weeks: 6, types: null };

  function allTypes() { return S.dutyTypesFor(Store.cong()); }

  function activeTypes() {
    if (state.types) return state.types;
    var cong = Store.cong();
    if (cong.dutyTypesInUse && cong.dutyTypesInUse.length) {
      state.types = cong.dutyTypesInUse.slice();
    } else {
      state.types = allTypes().map(function (d) { return d.id; })
        .filter(function (id) { return ['zoom', 'security', 'parking', 'literature', 'greeter'].indexOf(id) === -1; });
    }
    return state.types;
  }

  /* Which duties this hall runs is the congregation's own list. */
  function manageTypes() {
    var cong = Store.cong();
    var list = U.clone(allTypes());
    var wrap = el('div');

    function draw() {
      U.clear(wrap);
      list.forEach(function (dt, i) {
        wrap.appendChild(el('div.row', { style: 'margin-bottom:8px' }, [
          UI.input({ value: dt.name, onInput: function (e) { list[i].name = e.target.value; } }),
          UI.select([{ id: '', name: 'Anyone' }].concat(S.QUALIFICATIONS), dt.qual || '', function (v) {
            list[i].qual = v || null;
          }),
          UI.btn('', { icon: 'trash', sm: true, variant: 'subtle', title: 'Remove', onClick: function () {
            list.splice(i, 1); draw();
          } })
        ]));
      });
      wrap.appendChild(UI.btn('Add a duty', { sm: true, icon: 'plus', onClick: function () {
        list.push({ id: U.uid('duty_type'), name: '', qual: null });
        draw();
      } }));
    }
    draw();

    UI.modal({
      wide: true,
      title: 'Duties this hall runs',
      sub: 'Add the arrangements your hall actually has — a car park, a security watch, a literature counter — and remove any it does not. Each one can require a qualification, so only brothers marked for it are proposed.',
      body: wrap,
      actions: [{ label: 'Save', variant: 'primary', onClick: function () {
        var clean = list.filter(function (d) { return d.name.trim(); });
        Store.update({ action: 'duties.types', summary: U.plural(clean.length, 'duty', 'duties') + ' in use' },
          function () { cong.dutyTypes = clean; });
        state.types = null;
        UI.flag('Saved', null, 'success');
      } }]
    });
  }

  function dutyFor(date, typeId) {
    return Store.duties().filter(function (d) { return d.date === date && d.type === typeId; })[0] || null;
  }

  function meetingDates(weeks) {
    var out = [];
    Store.weeks().filter(function (w) { return w.weekStart >= U.weekStart(U.today()); })
      .slice(0, weeks).forEach(function (w) {
        if (!w.midweek.cancelled) out.push({ date: w.midweek.date, meeting: 'midweek', week: w });
        if (!w.weekend.cancelled) out.push({ date: w.weekend.date, meeting: 'weekend', week: w });
      });
    return U.sortBy(out, function (r) { return r.date; });
  }

  function assignDuty(date, meeting, typeId) {
    var dt = S.dutyType(typeId, Store.cong());
    if (dt.group) {
      var list = el('div.picker-list');
      var closeGroups = UI.modal({
        title: dt.name,
        sub: U.fmtDate(date, 'long'),
        body: list,
        closeLabel: 'Close'
      });
      Store.groups().forEach(function (g) {
        list.appendChild(el('button.picker-item', {
          type: 'button',
          onclick: function () { closeGroups(); setDuty(date, meeting, typeId, null, g.id); }
        }, [U.icon('people', 18), el('span', { text: g.name })]));
      });
      if (dutyFor(date, typeId)) {
        list.appendChild(el('button.picker-item', {
          type: 'button',
          onclick: function () { closeGroups(); setDuty(date, meeting, typeId, null, null); }
        }, [U.icon('close', 18), el('span', { text: 'Clear this duty' })]));
      }
      return;
    }
    var busy = [];
    var w = Store.weeks().filter(function (x) { return x.midweek.date === date || x.weekend.date === date; })[0];
    if (w) {
      var block = w.midweek.date === date ? w.midweek : w.weekend;
      block.parts.forEach(function (p) {
        if (p.assigneeId) busy.push(p.assigneeId);
        if (p.assistantId) busy.push(p.assistantId);
      });
    }
    Store.duties().forEach(function (d) { if (d.date === date && d.personId) busy.push(d.personId); });

    UI.personPicker({
      title: dt.name,
      sub: U.fmtDate(date, 'long'),
      allowClear: !!dutyFor(date, typeId),
      candidates: Sch.candidates({
        typeId: typeId, qual: dt.qual, pool: null, date: date,
        weekStart: U.weekStart(date), excludeIds: busy, maxPerWeek: 3
      }),
      onPick: function (personId) { setDuty(date, meeting, typeId, personId, null); }
    });
  }

  function setDuty(date, meeting, typeId, personId, groupId) {
    var existing = dutyFor(date, typeId);
    Store.update({
      action: 'duty.set',
      summary: S.dutyType(typeId, Store.cong()).name + ' — ' + (personId ? Store.name(personId) : groupId ? (Store.group(groupId) || {}).name : 'cleared') + ' ' + U.fmtDate(date)
    }, function (st) {
      if (!personId && !groupId) {
        if (existing) st.duties = st.duties.filter(function (d) { return d.id !== existing.id; });
        return;
      }
      if (existing) { existing.personId = personId; existing.groupId = groupId; return; }
      st.duties.push({
        id: U.uid('duty'), congId: Store.congId(), date: date, meeting: meeting,
        type: typeId, personId: personId, groupId: groupId, status: 'proposed', note: ''
      });
    });
  }

  function generate() {
    var weeks = Store.weeks().filter(function (w) { return w.weekStart >= U.weekStart(U.today()); }).slice(0, state.weeks);
    var plan = Sch.planDuties(weeks, activeTypes(), {});
    if (!plan.length) {
      UI.flag('Nothing to generate', 'Every duty in this window already has someone on it.', null);
      return;
    }
    UI.confirm({
      title: 'Fill the rota?',
      body: U.plural(plan.length, 'duty', 'duties') + ' will be scheduled across the next ' + state.weeks +
        ' weeks, rotating fairly and skipping anyone away or already on the platform that night.',
      confirmLabel: 'Fill ' + plan.length
    }, function () {
      Sch.applyDutyPlan(plan);
      UI.flag('Rota filled', U.plural(plan.length, 'duty', 'duties') + ' scheduled.', 'success');
    });
  }

  Views.duties = {
    title: 'the duty rota',
    perm: 'schedule.view',
    render: function (root) {
      var dates = meetingDates(state.weeks);
      var canEdit = Auth.can('duties.edit');

      root.appendChild(UI.pageHead({
        crumbs: [{ label: Store.cong().name }, { label: 'Duty rota' }],
        title: 'Duty rota',
        sub: 'Attendants, sound and video, microphones, platform and hall cleaning.',
        actions: [
          UI.btnGroup([{ id: '4', label: '4 wks' }, { id: '6', label: '6 wks' }, { id: '12', label: '12 wks' }],
            String(state.weeks), function (v) { state.weeks = +v; App.render(); }),
          canEdit ? UI.btn('Fill the rota', { variant: 'primary', icon: 'sparkle', onClick: generate }) : null,
          canEdit ? UI.btn('Manage duties', { icon: 'cog', onClick: manageTypes }) : null,
          UI.btn('Print', { variant: 'subtle', icon: 'print', onClick: function () { global.print(); } }),
          UI.btn('Export CSV', { variant: 'subtle', icon: 'download', onClick: exportCsv })
        ].filter(Boolean)
      }));

      /* which duties this hall uses */
      var chips = el('div.row', { style: 'margin-bottom:16px' }, [el('span.small.muted', { text: 'Duties in use:' })]);
      allTypes().forEach(function (dt) {
        var on = activeTypes().indexOf(dt.id) !== -1;
        chips.appendChild(UI.btn(dt.name, {
          sm: true, pressed: on,
          onClick: function () {
            var next = on ? activeTypes().filter(function (x) { return x !== dt.id; })
              : activeTypes().concat([dt.id]);
            state.types = next;
            if (Auth.can('duties.edit')) {
              Store.update(function () { Store.cong().dutyTypesInUse = next; });
            }
            App.render();
          }
        }));
      });
      root.appendChild(chips);

      if (!dates.length) {
        root.appendChild(UI.empty('No meetings scheduled', 'Create the weeks first on the meeting schedule.'));
        return;
      }

      var columns = [
        { key: 'date', label: 'Meeting', render: function (r) {
          return el('div', [
            el('div', { text: U.fmtDate(r.date, 'day') }),
            el('div.small.muted', { text: r.meeting === 'midweek' ? 'Midweek' : 'Weekend' })
          ]);
        } }
      ].concat(activeTypes().map(function (typeId) {
        var dt = S.dutyType(typeId, Store.cong());
        return {
          key: typeId,
          label: dt.name,
          render: function (r) {
            var d = dutyFor(r.date, typeId);
            var who = d ? (d.personId ? Store.name(d.personId) : (Store.group(d.groupId) || {}).name) : null;
            return el('button.assign-slot' + (who ? '.filled' : ''), {
              type: 'button', disabled: !canEdit,
              onclick: function () { assignDuty(r.date, r.meeting, typeId); }
            }, [
              d && d.personId ? UI.avatar(Store.person(d.personId), 'sm') : el('span.avatar.sm.ghost', { text: who ? 'G' : '+' }),
              el('span', { text: who || 'Assign' })
            ]);
          }
        };
      }));

      root.appendChild(UI.table(columns, dates, { empty: 'Nothing scheduled.' }));

      /* coverage summary */
      root.appendChild(UI.sectionTitle('Coverage'));
      var gaps = [];
      dates.forEach(function (r) {
        activeTypes().forEach(function (t) { if (!dutyFor(r.date, t)) gaps.push(r.date + ' · ' + S.dutyType(t, Store.cong()).name); });
      });
      root.appendChild(gaps.length
        ? UI.banner('warn', U.plural(gaps.length, 'gap') + ' in the rota', gaps.slice(0, 6).join('  ·  ') + (gaps.length > 6 ? '…' : ''))
        : UI.banner('success', 'Every duty is covered', 'Nothing outstanding in this window.'));

      /* who is qualified */
      root.appendChild(UI.sectionTitle('Qualified for each duty'));
      var grid = el('div.grid.c3');
      activeTypes().forEach(function (typeId) {
        var dt = S.dutyType(typeId, Store.cong());
        var pool = dt.group ? Store.groups().map(function (g) { return g.name; })
          : Store.activePeople().filter(function (p) {
            return !dt.qual || (p.qualifications || []).indexOf(dt.qual) !== -1;
          }).map(function (p) { return Store.name(p.id); });
        grid.appendChild(UI.card(dt.name, [
          el('div.small.muted', { text: U.plural(pool.length, 'person', 'people') + ' available' }),
          el('div', { style: 'margin-top:8px' }, pool.length
            ? pool.map(function (n) { return UI.tag(n); })
            : UI.lozenge('No one qualified', 'removed'))
        ]));
      });
      root.appendChild(grid);
    }
  };

  function exportCsv() {
    var dates = meetingDates(state.weeks);
    var rows = [['Date', 'Meeting'].concat(activeTypes().map(function (t) { return S.dutyType(t, Store.cong()).name; }))];
    dates.forEach(function (r) {
      rows.push([r.date, r.meeting].concat(activeTypes().map(function (t) {
        var d = dutyFor(r.date, t);
        return d ? (d.personId ? Store.name(d.personId) : (Store.group(d.groupId) || {}).name) : '';
      })));
    });
    U.download('duty-rota-' + U.today() + '.csv', U.csv(rows), 'text/csv');
  }
})(typeof window !== 'undefined' ? window : globalThis);
