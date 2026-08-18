/* Publisher-facing: my assignments and my own details / availability. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App, Program = global.Program;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  function setNotify(person, key, value) {
    Store.update({ action: 'person.notify', summary: Store.name(person.id) + ' — ' + key + (value ? ' on' : ' off') },
      function () {
        person.notify = Object.assign({}, S.notifyOf(person));
        person.notify[key] = value;
      });
  }

  Views['my-assignments'] = {
    title: 'your assignments',
    render: function (root) {
      var me = Auth.me();
      var all = Store.assignmentsFor(me.id, {});
      var upcoming = all.filter(function (r) { return r.date >= U.today(); });
      var past = all.filter(function (r) { return r.date < U.today(); });

      root.appendChild(UI.pageHead({
        title: 'My assignments',
        sub: 'Everything you have been given, and what you have cared for before.',
        actions: [
          UI.btn('Add to my calendar', { icon: 'calendar', onClick: function () { calendarFor(me, upcoming); } }),
          UI.btn('Send to myself', { variant: 'subtle', icon: 'megaphone', onClick: function () {
            U.share('My assignments', assignmentText(me, upcoming));
          } }),
          UI.copyBtn(function () { return assignmentText(me, upcoming); }, 'Copy')
        ]
      }));

      var unconfirmed = upcoming.filter(function (r) { return r.part && r.part.status === 'notified'; });
      if (unconfirmed.length) {
        root.appendChild(UI.banner('warn', U.plural(unconfirmed.length, 'assignment') + ' waiting for your confirmation',
          'Tap confirm so the elders know you have it.'));
      }

      root.appendChild(UI.sectionTitle('Coming up'));
      if (!upcoming.length) {
        root.appendChild(UI.empty('Nothing scheduled', 'Assignments appear here as soon as an elder gives you one.'));
      } else {
        root.appendChild(el('div.stack', upcoming.map(function (r) {
          var title = r.duty ? S.dutyType(r.duty.type, Store.cong()).name : r.part.title;
          return UI.card(null, [
            el('div.row', [
              el('div', [
                el('div', { style: 'font-weight:600', text: title }),
                el('div.small.muted', { text: U.fmtDate(r.date, 'long') + ' · '
                  + (r.meeting === 'midweek' ? Store.cong().meetings.midweek.name : Store.cong().meetings.weekend.name) })
              ]),
              el('div.right.row', [
                r.part ? UI.statusLozenge(S.PART_STATUS, r.part.status) : UI.lozenge('Duty', 'moved'),
                r.part && r.part.status !== 'confirmed' ? UI.btn('Confirm', {
                  sm: true, variant: 'primary',
                  onClick: function () {
                    Store.setPartStatus(r.part.id, 'confirmed');
                    afterAccepting(me, r, title);
                  }
                }) : null,
                r.part ? UI.btn('Cannot do it', { sm: true, variant: 'subtle', onClick: function () {
                  UI.confirm({ title: 'Let the elders know?',
                    body: 'The part is marked as declined so it can be given to someone else.',
                    confirmLabel: 'Mark declined', danger: true }, function () {
                    Store.setPartStatus(r.part.id, 'declined');
                    UI.flag('The elders will see this', title, 'success');
                  });
                } }) : null
              ])
            ]),
            el('div.row', { style: 'margin-top:8px' }, [
              UI.btn('Add this to my calendar', { sm: true, variant: 'subtle', icon: 'calendar',
                onClick: function () { calendarForOne(me, r, title); } })
            ]),
            r.part && r.part.notes ? el('p.small', { style: 'margin-top:8px', text: '📝 ' + r.part.notes }) : null,
            r.part && r.part.source ? el('p.small.muted', { style: 'margin-top:4px', text: r.part.source }) : null,
            r.part && r.part.assistantId && r.part.assistantId !== Auth.me().id
              ? el('div.row', { style: 'margin-top:8px' }, [el('span.small.muted', { text: 'With:' }), UI.person(r.part.assistantId)])
              : null,
            r.part && r.role === 'assistant'
              ? el('div.row', { style: 'margin-top:8px' }, [el('span.small.muted', { text: 'Assisting:' }), UI.person(r.part.assigneeId)])
              : null
          ]);
        })));
      }

      root.appendChild(UI.sectionTitle('Previously'));
      root.appendChild(UI.table([
        { key: 'date', label: 'Date', sort: function (r) { return r.date; }, render: function (r) { return U.fmtDate(r.date, 'day'); } },
        { key: 'what', label: 'Assignment', render: function (r) {
          return r.duty ? S.dutyType(r.duty.type, Store.cong()).name : r.part.title + (r.role === 'assistant' ? ' (assistant)' : '');
        } },
        { key: 'meeting', label: 'Meeting', render: function (r) { return r.meeting === 'midweek' ? 'Midweek' : 'Weekend'; } }
      ], past, { sortKey: 'date', sortDir: 'desc', empty: 'Nothing yet.' }));
    }
  };

  /* One assignment as a calendar entry, for the phone to swallow whole. */
  function eventFor(me, r, title) {
    var cong = Store.cong();
    var other = r.part && (r.role === 'assistant' ? r.part.assigneeId : r.part.assistantId);
    return {
      uid: (r.part ? r.part.id : r.duty.id) + '-' + me.id,
      title: title + (r.role === 'assistant' ? ' (assistant)' : ''),
      date: r.date,
      time: r.time || (r.meeting === 'midweek' ? cong.meetings.midweek.time : cong.meetings.weekend.time),
      minutes: (r.part && r.part.minutes) || 30,
      location: cong.hallAddress || cong.name || '',
      description: [
        r.part && r.part.source ? r.part.source : '',
        other ? 'With ' + Store.name(other) : '',
        r.part && r.part.notes ? r.part.notes : ''
      ].filter(Boolean).join('\n')
    };
  }

  function calendarForOne(me, r, title) {
    U.ics('assignment', [eventFor(me, r, title)]);
  }

  /* Accepting is the moment it becomes real, so that is when the app offers to
     put it in the phone's own calendar — once. After that it stops asking, and
     a subscription keeps itself up to date without being asked at all. */
  function afterAccepting(me, r, title) {
    var asked = false;
    try { asked = localStorage.getItem('shepherd.calendar.offered') === '1'; } catch (e) { asked = false; }
    if (asked) { UI.flag('Confirmed', title, 'success'); return; }

    UI.modal({
      title: 'Confirmed — put it in your calendar?',
      sub: title + ' · ' + U.fmtDate(r.date, 'long'),
      body: [
        el('p.small', { text: global.Sync.mode === 'server'
          ? 'Subscribe once and your phone keeps this up to date on its own — new assignments appear, and a change to the schedule follows through. Or take this one entry on its own.'
          : 'Your phone can take this entry now. Once your congregation runs Shepherd on a server you can subscribe instead, and everything keeps itself up to date.' }),
        el('div.row', { style: 'margin-top:14px' }, [
          UI.btn('Add just this one', { icon: 'calendar', onClick: function () {
            calendarForOne(me, r, title);
          } }),
          global.Sync.mode === 'server'
            ? UI.btn('Subscribe to all of mine', { variant: 'primary', icon: 'calendar', onClick: function () {
              calendarFor(me, Store.assignmentsFor(me.id, {}).filter(function (x) { return x.date >= U.today(); }));
            } })
            : null
        ])
      ],
      closeLabel: 'Not now',
      actions: [{ label: 'Do not ask again', variant: 'subtle', onClick: function () {
        try { localStorage.setItem('shepherd.calendar.offered', '1'); } catch (e) { /* private mode */ }
      } }]
    });
  }

  function assignmentText(me, upcoming) {
    if (!upcoming.length) return 'Nothing scheduled at the moment.';
    return [Store.cong().name + ' — ' + Store.name(me.id)].concat(
      upcoming.map(function (r) {
        var title = r.duty ? S.dutyType(r.duty.type, Store.cong()).name : r.part.title;
        return U.fmtDate(r.date, 'day') + ' — ' + title
          + (r.role === 'assistant' ? ' (assistant)' : '');
      })
    ).join('\n');
  }

  /* Two ways onto a phone: a file to open once, or — when the congregation runs
     the server — a link the calendar keeps checking, so changes follow. */
  function calendarFor(me, upcoming) {
    var cong = Store.cong();
    var events = upcoming.map(function (r) {
      var title = r.duty ? S.dutyType(r.duty.type, cong).name : r.part.title;
      var other = r.part && (r.role === 'assistant' ? r.part.assigneeId : r.part.assistantId);
      return {
        uid: (r.part ? r.part.id : r.duty.id) + '-' + me.id,
        title: title + (r.role === 'assistant' ? ' (assistant)' : ''),
        date: r.date,
        time: r.meeting === 'midweek' ? cong.meetings.midweek.time : cong.meetings.weekend.time,
        minutes: r.part && r.part.minutes ? r.part.minutes : 60,
        location: cong.hallAddress || cong.name,
        description: [
          r.part && r.part.source, other ? 'With ' + Store.name(other) : '', r.part && r.part.notes
        ].filter(Boolean).join('\n')
      };
    });

    var body = el('div.stack', [
      UI.banner('neutral', 'A one-off file',
        'Downloads a file your phone or computer opens straight into its calendar. It is a snapshot — if the elders change something later, download it again.'),
      UI.btn('Download my assignments', { variant: 'primary', icon: 'download', onClick: function () {
        U.download('my-assignments.ics', U.ics(cong.name + ' — ' + me.firstName, events), 'text/calendar');
        UI.flag('Downloaded', 'Open it and your calendar will offer to add them.', 'success');
      } })
    ]);

    if (global.Sync.mode === 'server') {
      var linkBox = el('div');
      body.appendChild(UI.divider());
      body.appendChild(UI.banner('success', 'Or subscribe, and it keeps itself up to date',
        'Add this address to your phone’s calendar once. Anything the elders change appears there without you doing anything.'));
      body.appendChild(linkBox);
      body.appendChild(UI.btn('Get my subscription link', { icon: 'calendar', onClick: function () {
        global.Sync.api('POST', 'api/calendar/link', {}).then(function (out) {
          U.clear(linkBox);
          linkBox.appendChild(el('div.mono', {
            style: 'padding:12px;background:var(--bg-sunken);border-radius:6px;word-break:break-all',
            text: out.url
          }));
          linkBox.appendChild(el('div.row', { style: 'margin-top:10px' }, [
            UI.copyBtn(function () { return out.url; }, 'Copy the link'),
            UI.btn('Open in my calendar', { variant: 'subtle', icon: 'calendar',
              onClick: function () { global.location.href = out.webcal; } })
          ]));
          linkBox.appendChild(el('p.small.muted', { style: 'margin-top:10px',
            text: 'Anyone with this address can see your assignments, so keep it to yourself. '
              + 'On iPhone: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar. '
              + 'On Android: Google Calendar on a computer → Other calendars → From URL.' }));
        }, function (err) { UI.flag('Could not make a link', err.message, 'danger'); });
      } }));
    }

    UI.modal({ title: 'My assignments in my calendar', body: body, closeLabel: 'Close' });
  }

  /* Putting the app on a phone's home screen. Android and desktop Chrome hand
     the page an install prompt; Safari does not, so the iPhone route is spelt
     out instead. Once it is installed there is nothing to show. */
  function installCard() {
    var PWA = global.PWA;
    if (!PWA || PWA.installed || !PWA.canInstall()) return null;
    var wrap = el('div');
    function paint() {
      wrap.innerHTML = '';
      wrap.appendChild(UI.sectionTitle('On my phone'));
      wrap.appendChild(UI.card(null, [
        el('p.small', { text: PWA.isIOS
          ? 'Add Shepherd to your home screen and it opens like any other app — full screen, no address bar, and your assignments are still there when the signal is poor.'
          : 'Install Shepherd on this device and it opens like any other app — full screen, no address bar, and your assignments are still there when the signal is poor.' }),
        PWA.isIOS
          ? el('ol.small', { style: 'margin:10px 0 0 18px' }, [
            el('li', { text: 'Tap the Share button at the bottom of Safari.' }),
            el('li', { text: 'Scroll down and tap “Add to Home Screen”.' }),
            el('li', { text: 'Tap “Add”. The Shepherd icon appears with your other apps.' })
          ])
          : el('div.row', { style: 'margin-top:12px' }, [
            UI.btn('Install on this device', { variant: 'primary', icon: 'download', onClick: function () {
              PWA.install().then(function (outcome) {
                if (outcome === 'accepted') UI.flag('Installed', 'Shepherd is on your home screen.', 'success');
                paint();
              });
            } })
          ])
      ], { icon: 'phone' }));
    }
    paint();
    PWA.subscribe(function () { if (wrap.isConnected) paint(); });
    return wrap;
  }

  /* Pop-up reminders. The browser only ever asks once, so nothing is requested
     until a brother taps the button himself. */
  function pushCard(me, n) {
    var PWA = global.PWA;
    var wrap = el('div');

    function paint() {
      U.clear(wrap);
      wrap.appendChild(UI.sectionTitle('Pop-up reminders on this device'));

      if (global.Sync.mode !== 'server') {
        wrap.appendChild(UI.card(null, [
          el('p.small.muted', { text: 'Pop-ups come from your congregation’s server, so they start working once the congregation is running Shepherd on one.' })
        ], { icon: 'bell' }));
        return;
      }
      if (!PWA) return;

      var state = PWA.pushState();
      var body = [];

      if (state === 'needs-install') {
        body.push(el('p.small', { text: 'On an iPhone, reminders only work once Shepherd is on your home screen — that is Apple’s rule. Add it from the card above, open it from the home screen, and this button appears.' }));
      } else if (state === 'unsupported') {
        body.push(el('p.small', { text: 'This browser cannot show reminders. Everything still arrives by email, and is in the app when you open it.' }));
      } else if (state === 'blocked') {
        body.push(el('p.small', { text: 'This device is blocking notifications from Shepherd. Turn them back on in the browser’s settings for this site, then come back here.' }));
      } else if (state === 'on') {
        body.push(el('p.small', { text: 'Reminders are on for this device — an assignment, your group’s turn to clean, and anything the circuit overseer’s visit needs from you.' }));
        body.push(el('div.row', { style: 'margin-top:12px' }, [
          UI.btn('Send me a test', { icon: 'bell', onClick: function () {
            global.Sync.api('POST', 'api/push/test', {}).then(function (out) {
              if (out.ok) UI.flag('Sent', 'It should appear on this device in a moment.', 'success');
              else UI.flag('Nothing arrived', out.error, 'warn');
            }, function (err) { UI.flag('Could not send it', err.message, 'danger'); });
          } }),
          UI.btn('Turn them off here', { variant: 'subtle', onClick: function () {
            PWA.disablePush().then(function () {
              UI.flag('Turned off', 'This device will not pop up again.', 'success');
              paint();
            });
          } })
        ]));
      } else {
        body.push(el('p.small', { text: 'Get a pop-up on this device when you are given a part or a duty, when your group is on for cleaning, and when something for the circuit overseer’s visit is yours to do.' }));
        body.push(el('div.row', { style: 'margin-top:12px' }, [
          UI.btn('Turn on reminders', { variant: 'primary', icon: 'bell', onClick: function () {
            PWA.enablePush().then(function () {
              UI.flag('Reminders on', 'This device will let you know.', 'success');
              paint();
            }, function (err) { UI.flag('Not turned on', err.message, 'warn'); });
          } })
        ]));
      }

      if (state === 'on' || state === 'off' || state === 'granted') {
        body.push(UI.checkbox('Pop-ups on all my devices', n.push, function (v) {
          setNotify(me, 'push', v);
        }, 'Turning this off stops the pop-ups everywhere without touching the emails.'));
      }
      body.push(el('p.small.muted', { style: 'margin-top:10px',
        text: 'A reminder travels sealed through your phone maker’s notification service — the same one every app on the phone uses. It cannot read what is inside.' }));

      wrap.appendChild(UI.card(null, body, { icon: 'bell' }));
    }

    paint();
    if (PWA) PWA.subscribe(function () { if (wrap.isConnected) paint(); });
    return wrap;
  }

  Views.profile = {
    title: 'your details',
    render: function (root) {
      var me = Auth.me();
      var cong = Store.cong();

      root.appendChild(UI.pageHead({
        title: 'My details',
        sub: 'Keep your contact details and away dates current — the scheduler uses them.'
      }));

      var draft = { phone: me.phone, email: me.email, address: me.address, emergencyContact: me.emergencyContact };

      root.appendChild(el('div.grid.c2', [
        UI.card('Contact details', [
          UI.field('Phone', UI.input({ type: 'tel', value: draft.phone, onInput: function (e) { draft.phone = e.target.value; } })),
          UI.field('Email', UI.input({ type: 'email', value: draft.email, onInput: function (e) { draft.email = e.target.value; } })),
          UI.field('Address', UI.input({ value: draft.address, onInput: function (e) { draft.address = e.target.value; } })),
          UI.field('Emergency contact', UI.input({ value: draft.emergencyContact, onInput: function (e) { draft.emergencyContact = e.target.value; } })),
          UI.btn('Save', { variant: 'primary', onClick: function () {
            Store.update({ action: 'person.self.updated', summary: Store.name(me.id) }, function () {
              me.phone = draft.phone; me.email = draft.email;
              me.address = draft.address; me.emergencyContact = draft.emergencyContact;
            });
            UI.flag('Saved', 'Your details are up to date.', 'success');
          } })
        ], { icon: 'user' }),
        UI.card('In the congregation', UI.kv([
          ['Congregation', cong.name],
          ['Service group', (Store.group(me.serviceGroupId) || {}).name],
          ['Group overseer', (Store.group(me.serviceGroupId) || {}).overseerId
            ? UI.person(Store.group(me.serviceGroupId).overseerId) : null],
          ['Publisher type', (S.PUBLISHER_TYPES.filter(function (t) { return t.id === me.publisherType; })[0] || {}).name],
          ['Roles', Auth.roleLabel(me)],
          ['Workspaces', Auth.workspaces().map(function (w) { return w.name; }).join(', ')]
        ]), { icon: 'building' })
      ]));

      if (global.Sync.mode === 'server') {
        root.appendChild(UI.sectionTitle('Sign-in'));
        root.appendChild(UI.card(null, [
          UI.kv([
            ['Signed in as', global.Sync.user ? global.Sync.user.name : '—'],
            ['This device', global.Sync.label()]
          ]),
          el('div.row', { style: 'margin-top:12px' }, [
            UI.btn('Change my password', { icon: 'lock', onClick: function () { Views.profile.changePassword(false); } }),
            UI.btn('Sign out', { variant: 'subtle', icon: 'logout', onClick: function () { global.Sync.logout(); } })
          ])
        ], { icon: 'lock' }));
      }

      root.appendChild(UI.sectionTitle('When I am not available', UI.btn('Add away dates', {
        sm: true, icon: 'plus', onClick: addAway
      })));
      var rows = (me.unavailable || []);
      root.appendChild(rows.length ? UI.table([
        { key: 'from', label: 'From', render: function (r) { return U.fmtDate(r.from); } },
        { key: 'to', label: 'To', render: function (r) { return U.fmtDate(r.to); } },
        { key: 'note', label: 'Note', render: function (r) { return r.note || '—'; } },
        { key: 'actions', label: '', render: function (r) {
          return UI.btn('Remove', { sm: true, variant: 'subtle', onClick: function () {
            Store.update({ action: 'person.away.removed', summary: Store.name(me.id) }, function () {
              me.unavailable = me.unavailable.filter(function (x) { return x !== r; });
            });
          } });
        } }
      ], rows) : UI.empty('No away dates', 'Add holidays or work travel and you will not be scheduled those weeks.'));

      var install = installCard();
      if (install) root.appendChild(install);

      root.appendChild(UI.sectionTitle('Messages I receive'));
      var n = S.notifyOf(me);
      root.appendChild(UI.card(null, [
        el('p.small.muted', { style: 'margin-bottom:10px',
          text: global.Sync.mode === 'server'
            ? 'Sent to ' + (me.email || 'your email address once an elder has it') + '.'
            : 'These apply once your congregation runs Shepherd on its own server.' }),
        UI.checkbox('Tell me when I am given something', n.assignments, function (v) {
          setNotify(me, 'assignments', v);
        }, 'One message when a part or duty is put against your name.'),
        UI.checkbox('Send me the week ahead', n.digest, function (v) {
          setNotify(me, 'digest', v);
        }, 'A short list every week — only if you have something on.'),
        UI.checkbox('Remind me about my field service report', n.reports, function (v) {
          setNotify(me, 'reports', v);
        }, 'Once, on the day it is due, and only if it is not in.'),
        UI.checkbox('Tell me when my group is cleaning the hall', n.cleaning, function (v) {
          setNotify(me, 'cleaning', v);
        }, 'And when the congregation cleans together.'),
        UI.checkbox('Remind me about the circuit overseer’s visit', n.covisit, function (v) {
          setNotify(me, 'covisit', v);
        }, 'Only about jobs that are yours.')
      ], { icon: 'megaphone' }));

      root.appendChild(pushCard(me, n));

      root.appendChild(UI.sectionTitle('When I can serve'));
      var av = S.availabilityOf(me);
      root.appendChild(UI.card(null, [
        el('p.small.muted', { style: 'margin-bottom:10px',
          text: 'The elders set this from what you tell them, and the scheduler follows it.' }),
        el('div.row', [
          UI.lozenge('Midweek: ' + (av.midweek ? 'yes' : 'no'), av.midweek ? 'success' : 'removed'),
          UI.lozenge('Weekend: ' + (av.weekend ? 'yes' : 'no'), av.weekend ? 'success' : 'removed'),
          UI.lozenge('Duty rota: ' + (av.duties ? 'yes' : 'no'), av.duties ? 'success' : 'removed'),
          UI.lozenge(av.maxPerMonth == null ? 'No monthly limit' : 'At most ' + av.maxPerMonth + ' a month',
            av.maxPerMonth == null ? '' : 'warn')
        ]),
        av.notes ? el('p.small', { style: 'margin-top:10px', text: '“' + av.notes + '”' }) : null,
        el('p.small.muted', { style: 'margin-top:10px',
          text: 'If something here is wrong, tell an elder — or add away dates above yourself.' })
      ]));

      root.appendChild(UI.sectionTitle('What I am marked for'));
      root.appendChild(UI.card(null, [
        el('p.small.muted', { style: 'margin-bottom:8px',
          text: 'Only the elders can change this list — it decides which parts the scheduler proposes you for.' }),
        (me.qualifications || []).length
          ? el('div', me.qualifications.map(function (q) {
            var meta = S.QUALIFICATIONS.filter(function (x) { return x.id === q; })[0];
            return UI.tag(meta ? meta.name : q);
          }))
          : el('div.muted', { text: 'Nothing recorded yet.' })
      ]));

      function addAway() {
        var from = UI.input({ type: 'date', value: U.today() });
        var to = UI.input({ type: 'date', value: U.addDays(U.today(), 7) });
        var note = UI.input({ placeholder: 'Holiday, work, health…' });
        UI.modal({
          title: 'Away dates',
          sub: 'The elders will see this and the scheduler will skip you.',
          body: [el('div.grid.c2', [UI.field('From', from), UI.field('To', to)]), UI.field('Note', note)],
          actions: [{ label: 'Save', variant: 'primary', onClick: function () {
            if (!from.value || !to.value || to.value < from.value) {
              UI.flag('Check the dates', 'The end date must be on or after the start date.', 'danger');
              return false;
            }
            Store.update({ action: 'person.away.added', summary: Store.name(me.id) }, function () {
              me.unavailable = me.unavailable || [];
              me.unavailable.push({ from: from.value, to: to.value, note: note.value.trim() });
            });
          } }]
        });
      }
    },

    /* forced === true when the administrator issued a one-time password */

    changePassword: function (forced) {
      var Sync = global.Sync;
      if (Sync.mode !== 'server') return;
      var current = UI.input({ type: 'password' });
      var next = UI.input({ type: 'password' });
      var again = UI.input({ type: 'password' });
      UI.modal({
        title: forced ? 'Choose your own password' : 'Change my password',
        sub: forced ? 'You signed in with a password an elder issued. Pick one only you know.' : null,
        hideClose: !!forced,
        body: [
          UI.field('Current password', current),
          UI.field('New password', next, 'At least 8 characters.'),
          UI.field('New password again', again)
        ],
        actions: [{ label: 'Save', variant: 'primary', onClick: function () {
          if (next.value.length < 8) { UI.flag('Too short', 'Use at least 8 characters.', 'danger'); return false; }
          if (next.value !== again.value) { UI.flag('They do not match', null, 'danger'); return false; }
          Sync.changePassword({ current: current.value, password: next.value }).then(function () {
            UI.flag('Password changed', null, 'success');
          }, function (err) { UI.flag('Could not change it', err.message, 'danger'); });
          return true;
        } }]
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
