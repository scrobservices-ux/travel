/* Demo data. A brand-new account starts here so the app is explorable in one
   click; Administration → Data lets you wipe it and start from an empty book. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema;
  var Seed = {};

  var PEOPLE = [
    // name,             gender, appointment, roles,                              quals
    ['Daniel Achebe', 'm', 'elder', ['coordinator', 'elder'], ['chairman', 'prayer', 'treasures', 'gems', 'living', 'cbs_conductor', 'wt_conductor', 'public_talk']],
    ['Samuel Okonkwo', 'm', 'elder', ['secretary', 'elder'], ['chairman', 'prayer', 'treasures', 'gems', 'living', 'wt_conductor', 'public_talk']],
    ['Peter Mwangi', 'm', 'elder', ['service', 'elder'], ['chairman', 'prayer', 'treasures', 'living', 'cbs_conductor', 'public_talk', 'wt_conductor']],
    ['Joshua Bello', 'm', 'elder', ['life_ministry', 'elder'], ['chairman', 'prayer', 'treasures', 'gems', 'living', 'cbs_conductor', 'public_talk']],
    ['Andrew Tanaka', 'm', 'elder', ['elder', 'group_overseer'], ['chairman', 'prayer', 'treasures', 'gems', 'living', 'public_talk', 'wt_conductor']],
    ['Thomas Nyathi', 'm', 'elder', ['elder', 'group_overseer'], ['prayer', 'treasures', 'gems', 'living', 'public_talk', 'cbs_conductor']],
    ['Michael Adeyemi', 'm', 'servant', ['accounts', 'servant'], ['prayer', 'gems', 'living', 'av', 'attendant', 'mic', 'cbs_reader', 'wt_reader', 'bible_reading', 'student']],
    ['Stephen Dube', 'm', 'servant', ['territory', 'servant'], ['prayer', 'gems', 'living', 'attendant', 'platform', 'mic', 'wt_reader', 'bible_reading', 'student']],
    ['Philip Osei', 'm', 'servant', ['servant', 'group_overseer'], ['prayer', 'gems', 'av', 'attendant', 'mic', 'cbs_reader', 'bible_reading', 'student']],
    ['Timothy Kalu', 'm', 'servant', ['servant'], ['prayer', 'av', 'attendant', 'platform', 'mic', 'wt_reader', 'cbs_reader', 'bible_reading', 'student']],
    ['Mark Chukwu', 'm', 'none', ['publisher'], ['prayer', 'attendant', 'mic', 'bible_reading', 'student', 'assistant', 'cbs_reader']],
    ['Elijah Banda', 'm', 'none', ['publisher'], ['prayer', 'av', 'mic', 'bible_reading', 'student', 'assistant', 'wt_reader']],
    ['Isaac Mensah', 'm', 'none', ['publisher'], ['bible_reading', 'student', 'assistant', 'attendant']],
    ['Caleb Ndlovu', 'm', 'none', ['publisher'], ['bible_reading', 'student', 'assistant']],
    ['Jonathan Eze', 'm', 'none', ['publisher'], ['prayer', 'bible_reading', 'student', 'assistant', 'av', 'cbs_reader', 'wt_reader']],
    ['Nathan Kimani', 'm', 'none', ['publisher'], ['bible_reading', 'student', 'assistant']],
    ['Simon Abara', 'm', 'none', ['publisher'], ['prayer', 'attendant', 'bible_reading', 'student', 'assistant']],
    ['David Mutua', 'm', 'none', ['publisher'], ['bible_reading', 'student', 'assistant', 'mic']],
    ['Grace Achebe', 'f', 'none', ['publisher'], ['student', 'assistant', 'cart']],
    ['Ruth Okonkwo', 'f', 'none', ['publisher'], ['student', 'assistant', 'cart']],
    ['Esther Mwangi', 'f', 'none', ['publisher'], ['student', 'assistant', 'cart']],
    ['Deborah Bello', 'f', 'none', ['publisher'], ['student', 'assistant']],
    ['Hannah Tanaka', 'f', 'none', ['publisher'], ['student', 'assistant', 'cart']],
    ['Miriam Nyathi', 'f', 'none', ['publisher'], ['student', 'assistant']],
    ['Rebecca Adeyemi', 'f', 'none', ['publisher'], ['student', 'assistant', 'cart']],
    ['Joanna Dube', 'f', 'none', ['publisher'], ['student', 'assistant']],
    ['Lydia Osei', 'f', 'none', ['publisher'], ['student', 'assistant', 'cart']],
    ['Priscilla Kalu', 'f', 'none', ['publisher'], ['student', 'assistant']],
    ['Naomi Chukwu', 'f', 'none', ['publisher'], ['student', 'assistant']],
    ['Sarah Banda', 'f', 'none', ['publisher'], ['student', 'assistant', 'cart']],
    ['Rachel Mensah', 'f', 'none', ['publisher'], ['student', 'assistant']],
    ['Tabitha Ndlovu', 'f', 'none', ['publisher'], ['student', 'assistant']],
    ['Anna Eze', 'f', 'none', ['publisher'], ['student', 'assistant']],
    ['Joyce Kimani', 'f', 'none', ['publisher'], ['student', 'assistant']],
    ['Mary Abara', 'f', 'none', ['publisher'], ['assistant']],
    ['Susanna Mutua', 'f', 'none', ['publisher'], ['assistant']]
  ];

  var STREETS = ['Riverside Drive', 'Acacia Road', 'Mill Lane', 'Station Road', 'Orchard Close',
    'Hillview Crescent', 'Market Street', 'Cedar Avenue', 'Palm Grove', 'Union Way',
    'Chapel Street', 'Elmwood Rise'];

  Seed.build = function () {
    var congId = 'cong_riverside';
    var today = U.today();
    var thisWeek = U.weekStart(today);

    var congregation = {
      id: congId,
      name: 'Riverside Congregation',
      number: '281-4470',
      city: 'Riverside',
      country: 'United Kingdom',
      language: 'English',
      currency: '£',
      circuit: 'GB-14',
      hallAddress: '18 Riverside Drive, Riverside',
      meetings: {
        midweek: { dow: 4, time: '19:00', name: 'Life and Ministry Meeting' },
        weekend: { dow: 0, time: '10:00', name: 'Public Talk and Watchtower Study' }
      },
      reportDueDay: 6,          // reports due by the 6th of the following month
      subscription: { plan: 'standard', status: 'active', seats: 36, renewsOn: U.addMonths(today, 1), startedOn: U.addMonths(today, -7) },
      programSource: { mode: 'manual', endpoint: '', lastImportedAt: null, acknowledged: false }
    };

    var second = {
      id: 'cong_northgate',
      name: 'Northgate Congregation',
      number: '281-5512',
      city: 'Northgate', country: 'United Kingdom', language: 'English', currency: '£',
      circuit: 'GB-14', hallAddress: '2 Northgate Way, Northgate',
      meetings: {
        midweek: { dow: 2, time: '19:15', name: 'Life and Ministry Meeting' },
        weekend: { dow: 6, time: '14:00', name: 'Public Talk and Watchtower Study' }
      },
      reportDueDay: 6,
      subscription: { plan: 'standard', status: 'trial', seats: 52, renewsOn: U.addMonths(today, 1), startedOn: U.addMonths(today, -1) },
      programSource: { mode: 'manual', endpoint: '', lastImportedAt: null, acknowledged: false }
    };

    var groups = [
      { id: 'grp_1', congId: congId, name: 'Group 1 — Riverside', overseerId: null, assistantId: null },
      { id: 'grp_2', congId: congId, name: 'Group 2 — Acacia', overseerId: null, assistantId: null },
      { id: 'grp_3', congId: congId, name: 'Group 3 — Hillview', overseerId: null, assistantId: null },
      { id: 'grp_4', congId: congId, name: 'Group 4 — Market', overseerId: null, assistantId: null }
    ];

    var people = PEOPLE.map(function (p, i) {
      var name = p[0].split(' ');
      var type = 'publisher';
      if (i === 18 || i === 19 || i === 2) type = 'regular';
      if (i === 25 || i === 12) type = 'auxiliary';
      return {
        id: 'p_' + (i + 1),
        congId: congId,
        firstName: name[0],
        lastName: name[1],
        gender: p[1],
        appointment: p[2],
        roles: p[3],
        qualifications: p[4],
        publisherType: type,
        status: i === 33 ? 'irregular' : (i === 34 ? 'inactive' : 'active'),
        email: name[0].toLowerCase() + '.' + name[1].toLowerCase() + '@example.org',
        phone: '07700 9' + U.pad(i) + '0' + (100 + i),
        address: (i * 3 + 4) + ' ' + STREETS[i % STREETS.length] + ', Riverside',
        baptizedOn: i < 30 ? (1985 + (i % 32)) + '-07-15' : null,
        birthOn: (1955 + ((i * 7) % 45)) + '-0' + (1 + (i % 9)) + '-1' + (i % 9),
        serviceGroupId: groups[i % groups.length].id,
        emergencyContact: '',
        unavailable: [],
        notes: '',
        createdAt: Date.now() - (i * 86400000)
      };
    });

    // group overseers / assistants
    groups[0].overseerId = 'p_5'; groups[0].assistantId = 'p_9';
    groups[1].overseerId = 'p_6'; groups[1].assistantId = 'p_10';
    groups[2].overseerId = 'p_3'; groups[2].assistantId = 'p_8';
    groups[3].overseerId = 'p_4'; groups[3].assistantId = 'p_7';

    // a couple of realistic away periods so the scheduler has something to dodge
    U.by(people, 'p_4').unavailable = [{ from: U.addDays(today, 5), to: U.addDays(today, 19), note: 'Away — visiting family' }];
    U.by(people, 'p_11').unavailable = [{ from: U.addDays(today, -3), to: U.addDays(today, 10), note: 'Work travel' }];

    /* ---------- weeks: 6 back, 8 forward ---------- */
    var weeks = [];
    for (var w = -6; w <= 8; w++) {
      var ws = U.addDays(thisWeek, w * 7);
      var week = global.Program.buildWeek(congregation, ws);
      week.congId = congId;
      weeks.push(week);
    }

    /* ---------- territories ---------- */
    var territories = [];
    for (var t = 1; t <= 24; t++) {
      var out = t % 3 === 0;
      var overdue = t === 6 || t === 15;
      territories.push({
        id: 'terr_' + t,
        congId: congId,
        number: String(t).padStart(3, '0'),
        name: STREETS[t % STREETS.length] + (t > 12 ? ' (north)' : ''),
        type: t > 21 ? 'Business' : 'House-to-house',
        status: overdue ? 'out' : (out ? 'out' : 'available'),
        assigneeId: (out || overdue) ? people[(t * 5) % 34].id : null,
        checkedOutOn: (out || overdue) ? U.addDays(today, overdue ? -140 : -(t * 3)) : null,
        dueOn: (out || overdue) ? U.addDays(today, overdue ? -20 : 120 - (t * 3)) : null,
        lastCompletedOn: U.addDays(today, -(30 + t * 9)),
        households: 40 + ((t * 7) % 60),
        mapUrl: '',
        notes: t === 6 ? 'Publisher moved congregation — needs recall.' : '',
        history: []
      });
    }

    /* ---------- field service reports ---------- */
    var reports = [];
    var periods = [U.prevPeriod(U.period(today)), U.prevPeriod(U.prevPeriod(U.period(today))),
      U.prevPeriod(U.prevPeriod(U.prevPeriod(U.period(today))))];
    people.forEach(function (p, i) {
      periods.forEach(function (period, pi) {
        if (p.status === 'inactive') return;
        if (pi === 0 && i % 9 === 3) return;            // a few outstanding for last month
        var pioneer = p.publisherType === 'regular' || p.publisherType === 'auxiliary';
        reports.push({
          id: 'rep_' + p.id + '_' + period,
          congId: congId,
          personId: p.id,
          period: period,
          shared: !(p.status === 'irregular' && pi === 0),
          studies: (i + pi) % 4,
          hours: pioneer ? (p.publisherType === 'regular' ? 50 + ((i + pi) % 22) : 25 + ((i + pi) % 12)) : null,
          credit: 0,
          comments: '',
          submittedAt: Date.now() - ((pi + 1) * 30 + (i % 5)) * 86400000,
          submittedBy: p.id,
          acceptedAt: Date.now() - ((pi + 1) * 30) * 86400000
        });
      });
    });

    /* ---------- attendance ---------- */
    var attendance = [];
    for (var a = 1; a <= 12; a++) {
      var wk = U.addDays(thisWeek, -a * 7);
      attendance.push({
        id: 'att_mid_' + wk, congId: congId, date: U.dayInWeek(wk, congregation.meetings.midweek.dow),
        meeting: 'midweek', count: 41 + ((a * 5) % 9), note: ''
      });
      attendance.push({
        id: 'att_wknd_' + wk, congId: congId, date: U.dayInWeek(wk, congregation.meetings.weekend.dow),
        meeting: 'weekend', count: 52 + ((a * 7) % 11), note: ''
      });
    }

    /* ---------- tasks ---------- */
    var tasks = [
      ['Order literature for the campaign', 'Special campaign brochures — count needed per group and place the order on jw.hub.', 'Records & reports', 'inprogress', 'high', 4, ['p_3', 'p_8']],
      ['Recall territory 006', 'Held 140 days and the publisher has moved to Northgate. Reassign after recall.', 'Territory', 'backlog', 'high', 2, ['p_8']],
      ['Kingdom Hall boiler service', 'Annual service due; get two quotes before the next elders meeting.', 'Maintenance', 'waiting', 'medium', 21, ['p_7']],
      ['Shepherding visits — Group 2', 'Two visits outstanding this quarter; schedule with the group overseer.', 'Shepherding', 'inprogress', 'medium', 14, ['p_6', 'p_2']],
      ['Circuit overseer visit arrangements', 'Confirm hospitality, meeting times and the service arrangements schedule.', 'Correspondence', 'backlog', 'high', 30, ['p_1', 'p_2']],
      ['Update the emergency contact list', 'Confirm every household contact detail is current, then reissue.', 'Records & reports', 'backlog', 'low', 45, ['p_2']],
      ['Review the cleaning schedule', 'Rotate groups for the new service year and post on the board.', 'Meeting arrangements', 'done', 'low', -5, ['p_9']],
      ['Public witnessing cart shifts', 'Rebuild the Saturday morning rota — two shifts uncovered.', 'Public witnessing', 'backlog', 'medium', 10, ['p_3']],
      ['Accounts — monthly review', 'Review the accounts report before it is read to the congregation.', 'Accounts', 'waiting', 'medium', 6, ['p_7', 'p_2']]
    ].map(function (t, i) {
      return {
        id: 'task_' + (i + 1), congId: congId, title: t[0], detail: t[1], category: t[2],
        status: t[3], priority: t[4], dueOn: U.addDays(today, t[5]), assigneeIds: t[6],
        createdBy: 'p_1', createdAt: Date.now() - (i + 1) * 86400000 * 2,
        agendaFor: (i % 3 === 0) ? 'next' : null, comments: []
      };
    });

    /* ---------- shepherding visits ---------- */
    var visits = [
      { personId: 'p_20', type: 'shepherding', when: -40, elders: ['p_1', 'p_5'], note: 'Encouraged over health difficulty; family doing well. Follow up in a quarter.' },
      { personId: 'p_33', type: 'encouragement', when: -12, elders: ['p_2', 'p_6'], note: 'Meeting attendance has slipped since the move. Offered a study arrangement.' },
      { personId: 'p_34', type: 'reactivation', when: -75, elders: ['p_3', 'p_9'], note: 'Warm visit, accepted literature. Group overseer to keep contact monthly.' }
    ].map(function (v, i) {
      return {
        id: 'visit_' + (i + 1), congId: congId, personId: v.personId, type: v.type,
        date: U.addDays(today, v.when), elderIds: v.elders, notes: v.note,
        followUpOn: U.addDays(today, v.when + 90), createdBy: v.elders[0], createdAt: Date.now()
      };
    });

    /* ---------- accounts ---------- */
    var transactions = [];
    [0, 1, 2].forEach(function (back) {
      var per = back === 0 ? U.period(today) : U.period(U.addMonths(today, -back));
      transactions.push(
        { id: U.uid('txn'), congId: congId, period: per, date: per + '-04', kind: 'income', category: 'Worldwide work donations', amount: 340 + back * 12, note: 'Contribution boxes' },
        { id: U.uid('txn'), congId: congId, period: per, date: per + '-04', kind: 'income', category: 'Congregation expenses donations', amount: 520 + back * 20, note: 'Contribution boxes' },
        { id: U.uid('txn'), congId: congId, period: per, date: per + '-08', kind: 'expense', category: 'Utilities', amount: 180 + back * 4, note: 'Electricity & water' },
        { id: U.uid('txn'), congId: congId, period: per, date: per + '-15', kind: 'expense', category: 'Kingdom Hall operating', amount: 210, note: 'Hall operating expenses' },
        { id: U.uid('txn'), congId: congId, period: per, date: per + '-26', kind: 'expense', category: 'Resolution — worldwide work', amount: 300, note: 'Monthly resolution' }
      );
    });

    /* ---------- announcements ---------- */
    var announcements = [
      {
        id: 'ann_1', congId: congId, title: 'Circuit overseer visit — week of ' + U.fmtWeek(U.addDays(thisWeek, 28)),
        body: 'The circuit overseer will be with us. The midweek meeting that week follows the visit schedule, and the service arrangements will be posted on the board.',
        audience: 'all', pinned: true, authorId: 'p_2', publishedAt: Date.now() - 86400000 * 3
      },
      {
        id: 'ann_2', congId: congId, title: 'Field service reports due by the 6th',
        body: 'Please hand your report to your group overseer or submit it in the app as soon as the month ends.',
        audience: 'all', pinned: false, authorId: 'p_2', publishedAt: Date.now() - 86400000 * 9
      },
      {
        id: 'ann_3', congId: congId, title: 'Cleaning — Group 3 this week',
        body: 'Group 3 cares for the hall after the weekend meeting. Supplies are in the second cupboard.',
        audience: 'all', pinned: false, authorId: 'p_1', publishedAt: Date.now() - 86400000 * 1
      }
    ];

    var users = people.slice(0, 12).map(function (p) {
      return { id: 'u_' + p.id, personId: p.id, congId: congId, email: p.email, lastSeenAt: Date.now() - Math.random() * 86400000 * 5, active: true };
    });

    return {
      version: S.VERSION,
      account: {
        name: 'Riverside · Northgate account',
        ownerEmail: 'coordinator@example.org',
        createdAt: Date.now(),
        plan: 'standard'
      },
      session: { personId: 'p_1', workspace: 'elders', congId: congId, theme: 'light' },
      congregations: [congregation, second],
      people: people,
      groups: groups,
      weeks: weeks,
      duties: [],                 // generated on first visit to the rota
      territories: territories,
      reports: reports,
      attendance: attendance,
      tasks: tasks,
      visits: visits,
      transactions: transactions,
      announcements: announcements,
      users: users,
      audit: [{
        id: U.uid('a'), at: Date.now(), personId: 'p_1', action: 'account.created',
        summary: 'Demo congregation created'
      }]
    };
  };

  Seed.empty = function (name, city) {
    var congId = U.uid('cong');
    var today = U.today();
    var cong = {
      id: congId, name: name || 'New Congregation', number: '', city: city || '', country: '',
      language: 'English', currency: '£', circuit: '', hallAddress: '',
      meetings: {
        midweek: { dow: 4, time: '19:00', name: 'Life and Ministry Meeting' },
        weekend: { dow: 0, time: '10:00', name: 'Public Talk and Watchtower Study' }
      },
      reportDueDay: 6,
      subscription: { plan: 'free', status: 'active', seats: 0, renewsOn: U.addMonths(today, 1), startedOn: today },
      programSource: { mode: 'manual', endpoint: '', lastImportedAt: null, acknowledged: false }
    };
    return cong;
  };

  Seed.blankState = function () {
    var cong = Seed.empty('My Congregation', '');
    return {
      version: S.VERSION,
      account: { name: 'My account', ownerEmail: '', createdAt: Date.now(), plan: 'free' },
      session: { personId: null, workspace: 'elders', congId: cong.id, theme: 'light' },
      congregations: [cong],
      people: [], groups: [], weeks: [], duties: [], territories: [], reports: [],
      attendance: [], tasks: [], visits: [], transactions: [], announcements: [], users: [],
      audit: []
    };
  };

  global.Seed = Seed;
})(typeof window !== 'undefined' ? window : globalThis);
