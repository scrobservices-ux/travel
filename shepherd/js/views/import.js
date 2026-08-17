/* Import centre — bring the congregation's existing files in.
 *
 * Takes a CSV or a straight copy-paste out of a spreadsheet, works out what each
 * column is, shows you a preview, and only then writes anything. Matching is by
 * name, so running the same file twice updates rather than duplicates. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  /* ---------- what each importer understands ---------- */

  var FIELDS = {
    publishers: [
      { id: 'fullName', label: 'Full name', match: ['name', 'full name', 'publisher', 'publisher name'] },
      { id: 'firstName', label: 'First name', match: ['first', 'first name', 'forename', 'given name'] },
      { id: 'lastName', label: 'Last name', match: ['last', 'last name', 'surname', 'family name'] },
      { id: 'gender', label: 'Brother / sister', match: ['gender', 'sex', 'brother/sister', 'm/f'] },
      { id: 'publisherType', label: 'Publisher type', match: ['type', 'publisher type', 'pioneer'] },
      { id: 'appointment', label: 'Appointment', match: ['appointment', 'elder', 'servant', 'privilege'] },
      { id: 'status', label: 'Status', match: ['status', 'active'] },
      { id: 'group', label: 'Service group', match: ['group', 'service group', 'field service group', 'car group'] },
      { id: 'phone', label: 'Phone', match: ['phone', 'mobile', 'telephone', 'cell', 'contact number'] },
      { id: 'email', label: 'Email', match: ['email', 'e-mail', 'mail'] },
      { id: 'address', label: 'Address', match: ['address', 'street', 'home address'] },
      { id: 'baptizedOn', label: 'Baptism date', match: ['baptism', 'baptised', 'baptized', 'baptism date'] },
      { id: 'birthOn', label: 'Date of birth', match: ['birth', 'dob', 'date of birth', 'born'] },
      { id: 'emergencyContact', label: 'Emergency contact', match: ['emergency', 'next of kin', 'emergency contact'] },
      { id: 'qualifications', label: 'Qualifications', match: ['qualifications', 'privileges', 'assignments', 'parts'] },
      { id: 'notes', label: 'Notes', match: ['notes', 'comment', 'comments', 'remarks'] }
    ],
    territories: [
      { id: 'number', label: 'Number', match: ['number', 'no', 'no.', 'territory', 'territory number', 'terr'] },
      { id: 'name', label: 'Boundaries / name', match: ['name', 'boundaries', 'description', 'area', 'street'] },
      { id: 'type', label: 'Type', match: ['type', 'kind'] },
      { id: 'households', label: 'Households', match: ['households', 'homes', 'houses', 'doors', 'count'] },
      { id: 'assignee', label: 'Held by', match: ['assigned', 'held by', 'publisher', 'assignee', 'checked out to'] },
      { id: 'checkedOutOn', label: 'Checked out', match: ['checked out', 'date out', 'out'] },
      { id: 'dueOn', label: 'Due back', match: ['due', 'due back', 'return by'] },
      { id: 'lastCompletedOn', label: 'Last completed', match: ['last completed', 'completed', 'last worked', 'date in'] },
      { id: 'mapUrl', label: 'Map link', match: ['map', 'map link', 'url', 'link'] },
      { id: 'notes', label: 'Notes', match: ['notes', 'comment', 'remarks'] }
    ],
    reports: [
      { id: 'publisher', label: 'Publisher', match: ['name', 'publisher', 'full name'] },
      { id: 'period', label: 'Month', match: ['month', 'period', 'service month', 'date'] },
      { id: 'shared', label: 'Shared in the ministry', match: ['shared', 'participated', '活動', 'activity', 'reported'] },
      { id: 'studies', label: 'Bible studies', match: ['studies', 'bible studies', 'study'] },
      { id: 'hours', label: 'Hours', match: ['hours', 'hrs', 'time'] },
      { id: 'credit', label: 'Credit hours', match: ['credit', 'credit hours'] },
      { id: 'comments', label: 'Comments', match: ['comments', 'notes', 'remarks'] }
    ],
    attendance: [
      { id: 'date', label: 'Date', match: ['date', 'meeting date', 'day'] },
      { id: 'meeting', label: 'Meeting', match: ['meeting', 'type', 'midweek/weekend'] },
      { id: 'count', label: 'Present', match: ['count', 'present', 'attendance', 'number', 'total'] },
      { id: 'note', label: 'Note', match: ['note', 'notes', 'comment'] }
    ]
  };

  var KINDS = [
    { id: 'publishers', name: 'Publishers', icon: 'people',
      hint: 'Names, contact details, group, type and appointment. This is usually the first thing to bring in.',
      sample: 'Name,Group,Type,Phone,Email,Appointment\nAchebe, Daniel,Group 1,Publisher,07700 900123,daniel@example.org,Elder' },
    { id: 'territories', name: 'Territories', icon: 'map',
      hint: 'The territory register, including what is currently checked out.',
      sample: 'Number,Boundaries,Type,Households,Held by,Due\n001,Riverside Drive,House-to-house,54,Mark Chukwu,2026-11-30' },
    { id: 'reports', name: 'Field service reports', icon: 'report',
      hint: 'Historic monthly reports, so the record cards and trends are complete from day one.',
      sample: 'Publisher,Month,Shared,Studies,Hours\nDaniel Achebe,July 2026,Yes,2,\nEsther Mwangi,July 2026,Yes,4,52' },
    { id: 'attendance', name: 'Meeting attendance', icon: 'chart',
      hint: 'Past meeting counts for the attendance record.',
      sample: 'Date,Meeting,Present\n2026-07-02,midweek,44\n2026-07-05,weekend,58' }
  ];

  /* ---------- guessing the columns ---------- */

  function autoMap(kind, header) {
    var map = {};
    var fields = FIELDS[kind];
    header.forEach(function (h, i) {
      var key = String(h || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
      if (!key) return;
      var hit = fields.filter(function (f) {
        return f.match.indexOf(key) !== -1;
      })[0] || fields.filter(function (f) {
        return f.match.some(function (m) { return key.indexOf(m) !== -1 || m.indexOf(key) !== -1; });
      })[0];
      if (hit && map[hit.id] === undefined) map[hit.id] = i;
    });
    return map;
  }

  function value(row, map, field) {
    var i = map[field];
    return i === undefined || i === null ? '' : String(row[i] || '').trim();
  }

  function splitName(full) {
    var s = String(full || '').trim();
    if (!s) return null;
    if (s.indexOf(',') !== -1) {
      var parts = s.split(',');
      return { firstName: (parts[1] || '').trim(), lastName: parts[0].trim() };
    }
    var bits = s.split(/\s+/);
    if (bits.length === 1) return { firstName: bits[0], lastName: '' };
    return { firstName: bits.slice(0, -1).join(' '), lastName: bits[bits.length - 1] };
  }

  function findPerson(name) {
    var n = splitName(name);
    if (!n) return null;
    var want = (n.firstName + ' ' + n.lastName).toLowerCase().trim();
    return Store.people().filter(function (p) {
      return (p.firstName + ' ' + p.lastName).toLowerCase().trim() === want;
    })[0] || null;
  }

  function findGroup(name) {
    if (!name) return null;
    var want = String(name).toLowerCase().trim();
    return Store.groups().filter(function (g) {
      return g.name.toLowerCase() === want || g.name.toLowerCase().indexOf(want) !== -1;
    })[0] || null;
  }

  /* ---------- turning rows into records ---------- */

  var BUILD = {
    publishers: function (row, map, ctx) {
      var first = value(row, map, 'firstName');
      var last = value(row, map, 'lastName');
      if (!first && !last) {
        var n = splitName(value(row, map, 'fullName'));
        if (!n) return null;
        first = n.firstName; last = n.lastName;
      }
      if (!first && !last) return null;

      var existing = Store.people().filter(function (p) {
        return p.firstName.toLowerCase() === first.toLowerCase()
          && p.lastName.toLowerCase() === last.toLowerCase();
      })[0];

      var genderRaw = value(row, map, 'gender').toLowerCase();
      var gender = /^(f|female|sister|s)$/.test(genderRaw) ? 'f'
        : /^(m|male|brother|b)$/.test(genderRaw) ? 'm' : (existing ? existing.gender : 'm');

      var typeRaw = value(row, map, 'publisherType').toLowerCase();
      var type = /regular|rp/.test(typeRaw) ? 'regular'
        : /aux/.test(typeRaw) ? 'auxiliary'
          : /special|sp/.test(typeRaw) ? 'special'
            : /unbap/.test(typeRaw) ? 'unbaptized'
              : (existing ? existing.publisherType : 'publisher');

      var apptRaw = (value(row, map, 'appointment') + ' ' + typeRaw).toLowerCase();
      var appointment = /elder/.test(apptRaw) ? 'elder'
        : /servant|ms\b/.test(apptRaw) ? 'servant' : (existing ? existing.appointment : 'none');

      var statusRaw = value(row, map, 'status').toLowerCase();
      var status = /inactive/.test(statusRaw) ? 'inactive'
        : /irregular/.test(statusRaw) ? 'irregular'
          : /moved/.test(statusRaw) ? 'moved'
            : /deceased/.test(statusRaw) ? 'deceased'
              : (existing ? existing.status : 'active');

      var group = findGroup(value(row, map, 'group'));
      if (!group && value(row, map, 'group')) {
        group = ctx.newGroups[value(row, map, 'group')];
        if (!group) {
          group = { id: U.uid('grp'), congId: Store.congId(), name: value(row, map, 'group'),
            overseerId: null, assistantId: null, __new: true };
          ctx.newGroups[value(row, map, 'group')] = group;
        }
      }

      var quals = value(row, map, 'qualifications');
      var qualIds = quals ? quals.split(/[;,|]/).map(function (q) {
        var want = q.trim().toLowerCase();
        var hit = S.QUALIFICATIONS.filter(function (x) {
          return x.id === want || x.name.toLowerCase() === want || x.name.toLowerCase().indexOf(want) === 0;
        })[0];
        return hit ? hit.id : null;
      }).filter(Boolean) : (existing ? existing.qualifications : []);

      var rec = Object.assign({}, existing || {
        id: U.uid('p'), congId: Store.congId(), qualifications: [], unavailable: [], createdAt: Date.now()
      }, {
        firstName: first, lastName: last, gender: gender,
        publisherType: type, appointment: appointment, status: status,
        roles: existing ? existing.roles : ['publisher'],
        serviceGroupId: group ? group.id : (existing ? existing.serviceGroupId : (Store.groups()[0] || {}).id),
        phone: value(row, map, 'phone') || (existing ? existing.phone : ''),
        email: value(row, map, 'email') || (existing ? existing.email : ''),
        address: value(row, map, 'address') || (existing ? existing.address : ''),
        baptizedOn: U.toDate(value(row, map, 'baptizedOn')) || (existing ? existing.baptizedOn : null),
        birthOn: U.toDate(value(row, map, 'birthOn')) || (existing ? existing.birthOn : null),
        emergencyContact: value(row, map, 'emergencyContact') || (existing ? existing.emergencyContact : ''),
        notes: value(row, map, 'notes') || (existing ? existing.notes : ''),
        qualifications: qualIds
      });
      if (appointment === 'elder' && rec.roles.indexOf('elder') === -1) rec.roles = rec.roles.concat(['elder']);
      if (appointment === 'servant' && rec.roles.indexOf('servant') === -1) rec.roles = rec.roles.concat(['servant']);
      return { collection: 'people', rec: rec, isNew: !existing, label: first + ' ' + last, group: group };
    },

    territories: function (row, map) {
      var number = value(row, map, 'number');
      if (!number) return null;
      var existing = Store.territories().filter(function (t) { return t.number === number; })[0];
      var holder = findPerson(value(row, map, 'assignee'));
      var rec = Object.assign({}, existing || {
        id: U.uid('terr'), congId: Store.congId(), history: [], status: 'available'
      }, {
        number: number,
        name: value(row, map, 'name') || (existing ? existing.name : ''),
        type: value(row, map, 'type') || (existing ? existing.type : 'House-to-house'),
        households: +value(row, map, 'households') || (existing ? existing.households : 0),
        mapUrl: value(row, map, 'mapUrl') || (existing ? existing.mapUrl : ''),
        notes: value(row, map, 'notes') || (existing ? existing.notes : ''),
        assigneeId: holder ? holder.id : (existing ? existing.assigneeId : null),
        checkedOutOn: U.toDate(value(row, map, 'checkedOutOn')) || (existing ? existing.checkedOutOn : null),
        dueOn: U.toDate(value(row, map, 'dueOn')) || (existing ? existing.dueOn : null),
        lastCompletedOn: U.toDate(value(row, map, 'lastCompletedOn')) || (existing ? existing.lastCompletedOn : null)
      });
      rec.status = rec.assigneeId ? 'out' : 'available';
      return { collection: 'territories', rec: rec, isNew: !existing,
        label: 'Territory ' + number + (holder ? ' — ' + Store.name(holder.id) : ''),
        warning: value(row, map, 'assignee') && !holder ? 'No publisher called “' + value(row, map, 'assignee') + '”' : null };
    },

    reports: function (row, map) {
      var person = findPerson(value(row, map, 'publisher'));
      var period = U.toPeriod(value(row, map, 'period'));
      if (!person || !period) {
        return { skip: true, label: value(row, map, 'publisher') + ' / ' + value(row, map, 'period'),
          warning: !person ? 'No publisher of that name' : 'Could not read the month' };
      }
      var existing = Store.report(person.id, period);
      var hoursRaw = value(row, map, 'hours');
      var rec = Object.assign({}, existing || {
        id: U.uid('rep'), congId: Store.congId(), personId: person.id, period: period,
        submittedAt: Date.now(), submittedBy: person.id, acceptedAt: null
      }, {
        shared: map.shared === undefined ? true : U.truthy(value(row, map, 'shared')),
        studies: +value(row, map, 'studies') || 0,
        hours: hoursRaw === '' ? null : (+hoursRaw || 0),
        credit: +value(row, map, 'credit') || 0,
        comments: value(row, map, 'comments') || ''
      });
      return { collection: 'reports', rec: rec, isNew: !existing,
        label: Store.name(person.id) + ' — ' + U.periodLabel(period) };
    },

    attendance: function (row, map) {
      var date = U.toDate(value(row, map, 'date'));
      var count = +value(row, map, 'count');
      if (!date || !count) return null;
      var meetingRaw = value(row, map, 'meeting').toLowerCase();
      var meeting = /week(end)?$|sunday|saturday|public|watchtower/.test(meetingRaw) && !/mid/.test(meetingRaw)
        ? 'weekend' : (/mid|life|ministry/.test(meetingRaw) ? 'midweek'
          : (U.dow(date) === 0 || U.dow(date) === 6 ? 'weekend' : 'midweek'));
      var existing = Store.attendance().filter(function (a) { return a.date === date && a.meeting === meeting; })[0];
      var rec = Object.assign({}, existing || { id: U.uid('att'), congId: Store.congId() }, {
        date: date, meeting: meeting, count: count, note: value(row, map, 'note') || ''
      });
      return { collection: 'attendance', rec: rec, isNew: !existing,
        label: U.fmtDate(date) + ' ' + meeting + ' — ' + count };
    }
  };

  /* ---------- the view ---------- */

  var state = { kind: 'publishers', text: '', parsed: null, map: null };

  Views.import = {
    title: 'importing congregation files',
    perm: 'publishers.edit',
    render: function (root) {
      root.appendChild(UI.pageHead({
        crumbs: [{ label: Store.cong().name }, { label: 'Import' }],
        title: 'Import congregation files',
        sub: 'Bring in what you already keep in a spreadsheet. Nothing is written until you have seen the preview.',
        actions: [
          UI.btn('Restore a full backup', { icon: 'upload', onClick: function () { App.go('admin-data'); } })
        ]
      }));

      root.appendChild(UI.banner('neutral', 'Where your files go',
        'Everything is read in this browser. In shared mode the records then sync to your own server — no file is ever sent anywhere else.'));

      var picker = el('div.grid.c4', { style: 'margin-bottom:20px' });
      KINDS.forEach(function (k) {
        picker.appendChild(el('button.card', {
          style: 'text-align:left;cursor:pointer;border-color:' + (k.id === state.kind ? 'var(--B400)' : 'var(--border)'),
          onclick: function () { state.kind = k.id; state.parsed = null; state.text = ''; App.render(); }
        }, [
          el('div.row', [U.icon(k.icon, 16), el('strong', { text: k.name })]),
          el('div.small.muted', { style: 'margin-top:6px', text: k.hint })
        ]));
      });
      root.appendChild(picker);

      var kind = KINDS.filter(function (k) { return k.id === state.kind; })[0];
      var area = el('div');
      root.appendChild(area);

      /* step 1 — paste or choose a file */
      var textarea = UI.textarea({
        rows: 10, value: state.text,
        placeholder: 'Paste here — select the cells in your spreadsheet, copy, and paste. Or choose a CSV file below.'
      });
      textarea.style.fontFamily = 'var(--font-mono)';
      textarea.style.fontSize = '12px';

      var fileInput = el('input', { type: 'file', accept: '.csv,.tsv,.txt' });
      fileInput.addEventListener('change', function (e) {
        var f = e.target.files[0];
        if (!f) return;
        U.readFile(f, function (err, text) {
          if (err) { UI.flag('Could not read the file', String(err), 'danger'); return; }
          state.text = text;
          parse();
        });
      });

      function parse() {
        var parsed = U.parseDelimited(state.text);
        if (!parsed.header.length || !parsed.rows.length) {
          UI.flag('Nothing to read', 'Include the header row and at least one row of data.', 'danger');
          return;
        }
        state.parsed = parsed;
        state.map = autoMap(state.kind, parsed.header);
        App.render();
      }

      area.appendChild(UI.card('1 · Paste or choose the file', [
        el('p.small.muted', { style: 'margin-bottom:8px',
          text: 'CSV, semicolon-separated, or a straight copy out of Excel, Numbers or Google Sheets. The first row must be the column headings.' }),
        textarea,
        el('div.row', { style: 'margin-top:12px' }, [
          UI.btn('Read it', { variant: 'primary', icon: 'sparkle', onClick: function () {
            state.text = textarea.value; parse();
          } }),
          fileInput,
          UI.btn('Use an example', { variant: 'subtle', onClick: function () {
            state.text = kind.sample; parse();
          } })
        ])
      ], { icon: 'upload' }));

      if (!state.parsed) return;

      /* step 2 — column mapping */
      var fields = FIELDS[state.kind];
      var mapGrid = el('div.grid.c3');
      state.parsed.header.forEach(function (h, i) {
        var current = Object.keys(state.map).filter(function (k) { return state.map[k] === i; })[0] || '';
        mapGrid.appendChild(UI.field(
          h || 'Column ' + (i + 1),
          UI.select([{ id: '', name: '— ignore this column —' }].concat(fields), current, function (v) {
            Object.keys(state.map).forEach(function (k) { if (state.map[k] === i) delete state.map[k]; });
            if (v) state.map[v] = i;
            App.render();
          }),
          'e.g. ' + (state.parsed.rows[0][i] || '—')
        ));
      });
      area.appendChild(UI.card('2 · Check the columns', [
        el('p.small.muted', { style: 'margin-bottom:12px',
          text: 'Shepherd has guessed from the headings. Change anything it got wrong.' }),
        mapGrid
      ], { icon: 'filter' }));

      /* step 3 — preview */
      var ctx = { newGroups: {} };
      var results = state.parsed.rows.map(function (row) {
        try { return BUILD[state.kind](row, state.map, ctx); }
        catch (e) { return { skip: true, label: row.join(' '), warning: e.message }; }
      });
      var usable = results.filter(function (r) { return r && !r.skip; });
      var problems = results.filter(function (r) { return !r || r.skip || r.warning; });
      var creating = usable.filter(function (r) { return r.isNew; }).length;
      var updating = usable.length - creating;
      var newGroups = Object.keys(ctx.newGroups);

      area.appendChild(el('div.grid.c4', { style: 'margin:20px 0' }, [
        UI.stat('Rows read', state.parsed.rows.length, 'In the file'),
        UI.stat('To create', creating, 'New records'),
        UI.stat('To update', updating, 'Matched by name'),
        UI.stat('Needing attention', problems.length, problems.length ? 'Shown below' : 'None',
          problems.length ? 'down' : 'up')
      ]));

      if (newGroups.length) {
        area.appendChild(UI.banner('warn', U.plural(newGroups.length, 'new service group') + ' will be created',
          newGroups.join(', ')));
      }
      if (problems.length) {
        area.appendChild(UI.banner('warn', U.plural(problems.length, 'row') + ' will be skipped',
          problems.slice(0, 5).map(function (r) {
            return (r && r.label ? r.label + ': ' : '') + ((r && r.warning) || 'could not be read');
          }).join(' · ')));
      }

      area.appendChild(UI.table([
        { key: 'what', label: 'Record', render: function (r) { return r.label; } },
        { key: 'op', label: '', width: '110px', render: function (r) {
          return UI.lozenge(r.isNew ? 'Create' : 'Update', r.isNew ? 'success' : 'inprogress');
        } },
        { key: 'detail', label: 'Detail', render: function (r) {
          if (state.kind === 'publishers') {
            return [UI.personSub ? '' : '', (S.PUBLISHER_TYPES.filter(function (t) { return t.id === r.rec.publisherType; })[0] || {}).name,
              r.rec.appointment !== 'none' ? U.titleCase(r.rec.appointment) : null,
              r.group ? r.group.name : null, r.rec.phone, r.rec.email].filter(Boolean).join(' · ');
          }
          if (state.kind === 'reports') {
            return (r.rec.shared ? 'Shared' : 'No activity') + ' · '
              + U.plural(r.rec.studies, 'study', 'studies') + (r.rec.hours != null ? ' · ' + r.rec.hours + ' h' : '');
          }
          if (state.kind === 'territories') {
            return [r.rec.type, r.rec.households + ' households', r.rec.dueOn ? 'due ' + U.fmtDate(r.rec.dueOn) : null]
              .filter(Boolean).join(' · ');
          }
          return r.rec.note || '';
        } }
      ], usable.slice(0, 200), { empty: 'Nothing usable in this file yet — check the column mapping above.' }));

      if (usable.length > 200) {
        area.appendChild(el('p.small.muted', { text: 'Showing the first 200 of ' + usable.length + '.' }));
      }

      area.appendChild(el('div.row', { style: 'margin-top:20px' }, [
        UI.btn('Import ' + U.plural(usable.length, 'record'), {
          variant: 'primary', icon: 'check', disabled: !usable.length,
          onClick: function () {
            UI.confirm({
              title: 'Import ' + usable.length + ' records?',
              body: creating + ' created, ' + updating + ' updated'
                + (newGroups.length ? ', ' + newGroups.length + ' service groups added' : '') + '.',
              confirmLabel: 'Import'
            }, function () {
              Store.update({ action: 'data.imported',
                summary: usable.length + ' ' + state.kind + ' imported (' + creating + ' new)' }, function (st) {
                newGroups.forEach(function (name) {
                  var g = ctx.newGroups[name];
                  delete g.__new;
                  st.groups.push(g);
                });
                usable.forEach(function (r) {
                  var list = st[r.collection];
                  var idx = -1;
                  for (var i = 0; i < list.length; i++) if (list[i].id === r.rec.id) { idx = i; break; }
                  if (idx === -1) list.push(r.rec); else list[idx] = r.rec;
                });
              });
              UI.flag('Imported', U.plural(usable.length, 'record') + ' saved.', 'success');
              state.parsed = null; state.text = '';
              App.go(state.kind === 'publishers' ? 'publishers'
                : state.kind === 'territories' ? 'territories'
                  : state.kind === 'reports' ? 'reports' : 'attendance');
            });
          }
        }),
        UI.btn('Start again', { variant: 'subtle', onClick: function () {
          state.parsed = null; state.text = ''; App.render();
        } })
      ]));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
