/* Domain vocabulary: roles, privileges, part types, duties, statuses.
   Everything the scheduler and the views read from lives here so a congregation
   can be re-configured without touching view code. */
(function (global) {
  'use strict';

  var S = {};

  S.VERSION = 3;

  /* ---------- workspaces (the three interfaces) ---------- */
  S.WORKSPACES = [
    { id: 'publisher', name: 'My Congregation', sub: 'Publisher workspace', icon: 'user' },
    { id: 'elders', name: 'Elders Desk', sub: 'Body of elders', icon: 'shield' },
    { id: 'admin', name: 'Administration', sub: 'Circuit / account owner', icon: 'cog' }
  ];

  /* ---------- roles ---------- */
  // A person may hold several roles. Workspace access is derived from them.
  S.ROLES = [
    { id: 'publisher', name: 'Publisher', workspaces: ['publisher'] },
    { id: 'group_overseer', name: 'Group overseer', workspaces: ['publisher', 'elders'] },
    { id: 'servant', name: 'Ministerial servant', workspaces: ['publisher', 'elders'] },
    { id: 'elder', name: 'Elder', workspaces: ['publisher', 'elders'] },
    { id: 'secretary', name: 'Secretary', workspaces: ['publisher', 'elders'] },
    { id: 'coordinator', name: 'Coordinator (COBE)', workspaces: ['publisher', 'elders'] },
    { id: 'life_ministry', name: 'Life & Ministry overseer', workspaces: ['publisher', 'elders'] },
    { id: 'service', name: 'Service overseer', workspaces: ['publisher', 'elders'] },
    { id: 'accounts', name: 'Accounts servant', workspaces: ['publisher', 'elders'] },
    { id: 'territory', name: 'Territory servant', workspaces: ['publisher', 'elders'] },
    { id: 'admin', name: 'Account administrator', workspaces: ['publisher', 'elders', 'admin'] }
  ];
  S.roleName = function (id) {
    var r = S.ROLES.filter(function (x) { return x.id === id; })[0];
    return r ? r.name : id;
  };

  /* ---------- capabilities ---------- *
     What a person may do, described the way a body of elders would describe it.
     `scope: true` means the capability can be granted for the whole congregation
     or narrowed to the person's own service group — which is how a group overseer
     normally works: he cares for his own group's records, not everyone's. */
  S.CAPABILITIES = [
    { id: 'schedule.view', area: 'Meetings', name: 'See the meeting schedule',
      note: 'Who has which part on which week.' },
    { id: 'schedule.edit', area: 'Meetings', name: 'Prepare the meeting schedule',
      note: 'Assign parts, import the programme, auto-fill a week. Normally the Life and Ministry overseer and the coordinator.' },
    { id: 'duties.edit', area: 'Meetings', name: 'Fill the duty rota',
      note: 'Attendants, audio and video, microphones, platform, cleaning.' },
    { id: 'attendance.edit', area: 'Meetings', name: 'Record meeting attendance',
      note: 'Enter the count after each meeting. Usually the secretary or an attendant.' },

    { id: 'publishers.view', area: 'Congregation records', name: 'See publisher records', scope: true,
      note: 'The directory and each record card.' },
    { id: 'publishers.edit', area: 'Congregation records', name: 'Keep publisher records', scope: true,
      note: 'Add, change and remove records. The secretary keeps these.' },
    { id: 'reports.submit', area: 'Congregation records', name: 'Hand in a field service report',
      note: 'Every publisher does this for themselves.' },
    { id: 'reports.review', area: 'Congregation records', name: 'Collect field service reports', scope: true,
      note: 'Chase what is outstanding and record reports handed in on paper. A group overseer usually does this for his own group only.' },
    { id: 'shepherding.view', area: 'Congregation records', name: 'See shepherding records', scope: true,
      note: 'Confidential visit notes.' },

    { id: 'territories.view', area: 'Field ministry', name: 'See the territory register' },
    { id: 'territories.manage', area: 'Field ministry', name: 'Check territories in and out',
      note: 'The territory servant, under the service overseer.' },

    { id: 'tasks.view', area: 'Body of elders', name: "See the elders' task board" },
    { id: 'tasks.edit', area: 'Body of elders', name: 'Raise and close tasks',
      note: 'Including what goes on the next elders’ meeting agenda.' },

    { id: 'accounts.view', area: 'Administration', name: 'See the congregation accounts' },
    { id: 'accounts.edit', area: 'Administration', name: 'Keep the congregation accounts',
      note: 'The accounts servant.' },
    { id: 'announce.publish', area: 'Administration', name: 'Publish announcements' },
    { id: 'files.manage', area: 'Administration', name: 'Upload and manage congregation files' }
  ];
  S.capability = function (id) {
    return S.CAPABILITIES.filter(function (c) { return c.id === id; })[0] || null;
  };
  S.capabilityAreas = function () {
    var seen = [];
    S.CAPABILITIES.forEach(function (c) { if (seen.indexOf(c.area) === -1) seen.push(c.area); });
    return seen;
  };

  /* ---------- the default arrangement ---------- *
     capability -> { role: 'all' | 'group' }. This is a starting point that follows
     how the work is normally divided; every congregation can change it in
     Administration -> Roles & responsibilities, and what is stored on the
     congregation is what both the app and the server obey.
     The account administrator always holds everything, so is not listed. */
  S.DEFAULT_MATRIX = {
    'schedule.view': { publisher: 'all', servant: 'all', elder: 'all', secretary: 'all',
      coordinator: 'all', life_ministry: 'all', service: 'all', group_overseer: 'all',
      territory: 'all', accounts: 'all' },
    'schedule.edit': { coordinator: 'all', life_ministry: 'all' },
    'duties.edit': { coordinator: 'all', life_ministry: 'all', servant: 'all' },
    'attendance.edit': { secretary: 'all', coordinator: 'all', servant: 'all' },

    'publishers.view': { secretary: 'all', coordinator: 'all', service: 'all', elder: 'all',
      life_ministry: 'all', group_overseer: 'group' },
    'publishers.edit': { secretary: 'all', coordinator: 'all' },
    'reports.submit': { publisher: 'all', servant: 'all', elder: 'all', secretary: 'all',
      coordinator: 'all', group_overseer: 'all', service: 'all', life_ministry: 'all',
      territory: 'all', accounts: 'all' },
    'reports.review': { secretary: 'all', coordinator: 'all', service: 'all', group_overseer: 'group' },
    'shepherding.view': { elder: 'all', coordinator: 'all', secretary: 'all', group_overseer: 'group' },

    'territories.view': { publisher: 'all', servant: 'all', elder: 'all', secretary: 'all',
      coordinator: 'all', territory: 'all', service: 'all', group_overseer: 'all',
      life_ministry: 'all', accounts: 'all' },
    'territories.manage': { territory: 'all', service: 'all', coordinator: 'all' },

    'tasks.view': { elder: 'all', servant: 'all', coordinator: 'all', secretary: 'all',
      group_overseer: 'all', service: 'all', life_ministry: 'all', territory: 'all', accounts: 'all' },
    'tasks.edit': { elder: 'all', coordinator: 'all', secretary: 'all' },

    'accounts.view': { accounts: 'all', coordinator: 'all', secretary: 'all', elder: 'all' },
    'accounts.edit': { accounts: 'all', coordinator: 'all' },
    'announce.publish': { secretary: 'all', coordinator: 'all' },
    'files.manage': { secretary: 'all', coordinator: 'all', elder: 'all', servant: 'all' }
  };

  /* The arrangement a congregation is actually using. */
  S.matrixFor = function (cong) {
    var stored = cong && cong.roleMatrix;
    if (!stored) return S.DEFAULT_MATRIX;
    var out = {};
    S.CAPABILITIES.forEach(function (c) {
      out[c.id] = stored[c.id] || {};
    });
    return out;
  };

  /* 'all' | 'group' | 'none' for one role. */
  S.grantFor = function (matrix, capability, role) {
    var row = matrix[capability];
    if (!row) return 'none';
    return row[role] || 'none';
  };

  /* ---------- publisher status ---------- */
  S.PUBLISHER_TYPES = [
    { id: 'publisher', name: 'Publisher', short: 'Pub' },
    { id: 'auxiliary', name: 'Auxiliary pioneer', short: 'Aux' },
    { id: 'regular', name: 'Regular pioneer', short: 'RP' },
    { id: 'special', name: 'Special pioneer', short: 'SP' },
    { id: 'unbaptized', name: 'Unbaptized publisher', short: 'UP' }
  ];
  S.STATUSES = [
    { id: 'active', name: 'Active', tone: 'success' },
    { id: 'irregular', name: 'Irregular', tone: 'warn' },
    { id: 'inactive', name: 'Inactive', tone: 'removed' },
    { id: 'moved', name: 'Moved away', tone: 'moved' },
    { id: 'deceased', name: 'Deceased', tone: '' }
  ];

  /* ---------- qualifications used by the scheduler ---------- */
  S.QUALIFICATIONS = [
    { id: 'chairman', name: 'Meeting chairman', hint: 'Midweek / weekend chairman' },
    { id: 'prayer', name: 'Prayer', hint: 'Baptized brother' },
    { id: 'treasures', name: 'Treasures talk', hint: '10-minute talk' },
    { id: 'gems', name: 'Spiritual gems' },
    { id: 'bible_reading', name: 'Bible reading' },
    { id: 'student', name: 'Student assignment', hint: 'Ministry demonstrations / talk' },
    { id: 'assistant', name: 'Assistant / householder' },
    { id: 'living', name: 'Living as Christians part' },
    { id: 'cbs_conductor', name: 'Congregation Bible Study conductor' },
    { id: 'cbs_reader', name: 'Congregation Bible Study reader' },
    { id: 'wt_conductor', name: 'Watchtower Study conductor' },
    { id: 'wt_reader', name: 'Watchtower Study reader' },
    { id: 'public_talk', name: 'Public talk speaker' },
    { id: 'av', name: 'Audio / video' },
    { id: 'attendant', name: 'Attendant' },
    { id: 'mic', name: 'Microphones' },
    { id: 'platform', name: 'Platform / stage' },
    { id: 'parking', name: 'Car park attendant' },
    { id: 'security', name: 'Security / safety watch' },
    { id: 'literature', name: 'Literature counter' },
    { id: 'cart', name: 'Public witnessing (cart)' }
  ];

  /* ---------- meeting sections ---------- */
  S.SECTIONS = [
    { id: 'opening', name: 'Opening', tone: 'opening' },
    { id: 'treasures', name: "Treasures From God's Word", tone: 'treasures' },
    { id: 'ministry', name: 'Apply Yourself to the Field Ministry', tone: 'ministry' },
    { id: 'living', name: 'Living as Christians', tone: 'living' },
    { id: 'closing', name: 'Closing', tone: 'closing' },
    { id: 'weekend', name: 'Weekend Meeting', tone: 'weekend' }
  ];
  S.section = function (id) {
    return S.SECTIONS.filter(function (s) { return s.id === id; })[0] || S.SECTIONS[0];
  };

  /* ---------- part types ---------- *
     `qual`      qualification required of the assignee
     `assistant` true when a second person (assistant / reader) is normally used
     `pool`      restricts the eligible pool beyond the qualification         */
  S.PART_TYPES = {
    chairman:      { name: 'Chairman', qual: 'chairman', pool: 'elders_servants' },
    opening_song:  { name: 'Song and prayer', qual: 'prayer', pool: 'baptized_brothers' },
    opening_words: { name: 'Opening comments', qual: 'chairman', pool: 'elders_servants' },
    treasures:     { name: 'Treasures talk', qual: 'treasures', pool: 'elders_servants' },
    gems:          { name: 'Spiritual gems', qual: 'gems', pool: 'elders_servants' },
    bible_reading: { name: 'Bible reading', qual: 'bible_reading', pool: 'brothers' },
    student:       { name: 'Student assignment', qual: 'student', assistant: true },
    student_talk:  { name: 'Student talk', qual: 'student', pool: 'brothers' },
    living:        { name: 'Living as Christians', qual: 'living', pool: 'elders_servants' },
    cbs:           { name: 'Congregation Bible Study', qual: 'cbs_conductor', pool: 'elders_servants', assistant: true, assistantQual: 'cbs_reader' },
    concluding:    { name: 'Concluding comments', qual: 'chairman', pool: 'elders_servants' },
    closing_song:  { name: 'Song and prayer', qual: 'prayer', pool: 'baptized_brothers' },
    public_talk:   { name: 'Public talk', qual: 'public_talk', pool: 'elders_servants' },
    wt_study:      { name: 'Watchtower Study', qual: 'wt_conductor', pool: 'elders_servants', assistant: true, assistantQual: 'wt_reader' }
  };
  S.partType = function (id) { return S.PART_TYPES[id] || { name: id, qual: null }; };

  /* ---------- availability ---------- *
     Away dates say when someone cannot serve. This says how they can serve when
     they are here: which meetings, and how much is reasonable to ask of them. */
  S.DEFAULT_AVAILABILITY = {
    midweek: true,
    weekend: true,
    maxPerMonth: null,      // null = as often as the rotation calls for
    duties: true,           // willing to be on the duty rota at all
    notes: ''
  };
  S.availabilityOf = function (person) {
    var a = (person && person.availability) || {};
    return {
      midweek: a.midweek !== false,
      weekend: a.weekend !== false,
      maxPerMonth: a.maxPerMonth == null ? null : +a.maxPerMonth,
      duties: a.duties !== false,
      notes: a.notes || ''
    };
  };

  /* ---------- congregation size ---------- *
     What is fair depends entirely on how many people there are. In a group of
     fifteen the same brother genuinely takes three parts a meeting because nobody
     else can; in a congregation of two hundred he should have one a month. These
     are picked from the number of active publishers unless the body of elders
     sets them itself. */
  S.SIZE_PROFILES = [
    {
      id: 'small', name: 'Small congregation', upTo: 24,
      note: 'Under about 25 publishers. Ceilings are effectively off — the same brother will take several parts a meeting because there is nobody else. Fairness still decides the order.',
      maxPerMeeting: 4, maxPerWeek: 10, windowWeeks: 13, thinThreshold: 2
    },
    {
      id: 'medium', name: 'Medium congregation', upTo: 99,
      note: 'About 25 to 100 publishers. At most two things on a night and three in a week, with the rotation doing the rest.',
      maxPerMeeting: 2, maxPerWeek: 3, windowWeeks: 26, thinThreshold: 4
    },
    {
      id: 'large', name: 'Large congregation', upTo: Infinity,
      note: 'Over about 100 publishers. One thing a week each, so the rotation reaches everybody.',
      maxPerMeeting: 1, maxPerWeek: 1, windowWeeks: 39, thinThreshold: 6
    }
  ];

  S.sizeProfile = function (activeCount) {
    var n = activeCount || 0;
    for (var i = 0; i < S.SIZE_PROFILES.length; i++) {
      if (n <= S.SIZE_PROFILES[i].upTo) return S.SIZE_PROFILES[i];
    }
    return S.SIZE_PROFILES[S.SIZE_PROFILES.length - 1];
  };

  /* How this congregation wants to be scheduled: the size profile, plus anything
     the elders have overridden, plus whether they want suggestions at all. */
  S.DEFAULT_SCHEDULING = {
    profile: 'auto',        // 'auto' | 'small' | 'medium' | 'large'
    autoSuggest: true,      // false hides auto-fill entirely: a manual congregation
    pairSameGender: true,
    maxPerMeeting: null,    // null = take it from the profile
    maxPerWeek: null,
    windowWeeks: null,
    thinThreshold: null
  };

  S.schedulingFor = function (cong, activeCount) {
    var set = Object.assign({}, S.DEFAULT_SCHEDULING, (cong && cong.scheduling) || {});
    var profile = set.profile === 'auto' || !set.profile
      ? S.sizeProfile(activeCount)
      : (S.SIZE_PROFILES.filter(function (p) { return p.id === set.profile; })[0] || S.sizeProfile(activeCount));
    return {
      profile: profile,
      automatic: set.profile === 'auto' || !set.profile,
      autoSuggest: set.autoSuggest !== false,
      pairSameGender: set.pairSameGender !== false,
      maxPerMeeting: set.maxPerMeeting || profile.maxPerMeeting,
      maxPerWeek: set.maxPerWeek || profile.maxPerWeek,
      windowWeeks: set.windowWeeks || profile.windowWeeks,
      thinThreshold: set.thinThreshold || profile.thinThreshold
    };
  };

  /* ---------- assignment workflow ---------- */
  S.PART_STATUS = [
    { id: 'unassigned', name: 'Unassigned', tone: '' },
    { id: 'proposed', name: 'Proposed', tone: 'warn' },
    { id: 'notified', name: 'Notified', tone: 'inprogress' },
    { id: 'confirmed', name: 'Confirmed', tone: 'success' },
    { id: 'declined', name: 'Declined', tone: 'removed' }
  ];

  /* ---------- duty (rota) types ---------- *
     The list a congregation actually uses is stored on the congregation, so a
     hall with a car park and a security arrangement can have those on the rota
     and one without them can leave them off. These are the starting point. */
  S.DEFAULT_DUTY_TYPES = [
    { id: 'av', name: 'Audio / video', qual: 'av' },
    { id: 'attendant_main', name: 'Attendant (auditorium)', qual: 'attendant' },
    { id: 'attendant_door', name: 'Attendant (entrance)', qual: 'attendant' },
    { id: 'greeter', name: 'Welcome desk', qual: 'attendant' },
    { id: 'mic1', name: 'Microphone 1', qual: 'mic' },
    { id: 'mic2', name: 'Microphone 2', qual: 'mic' },
    { id: 'platform', name: 'Platform', qual: 'platform' },
    { id: 'parking', name: 'Car park', qual: 'parking' },
    { id: 'security', name: 'Security / safety watch', qual: 'security' },
    { id: 'literature', name: 'Literature counter', qual: 'literature' },
    { id: 'cleaning', name: 'Cleaning group', qual: null, group: true },
    { id: 'zoom', name: 'Zoom host', qual: 'av' }
  ];
  S.DUTY_TYPES = S.DEFAULT_DUTY_TYPES;      // kept for anything reading the plain list

  S.dutyTypesFor = function (cong) {
    var list = cong && cong.dutyTypes;
    return (list && list.length) ? list : S.DEFAULT_DUTY_TYPES;
  };
  S.dutyType = function (id, cong) {
    return S.dutyTypesFor(cong).filter(function (d) { return d.id === id; })[0]
      || S.DEFAULT_DUTY_TYPES.filter(function (d) { return d.id === id; })[0]
      || { id: id, name: id };
  };

  /* ---------- task workflow (elders' task board) ---------- */
  S.TASK_STATUS = [
    { id: 'backlog', name: 'To do', tone: '' },
    { id: 'inprogress', name: 'In progress', tone: 'inprogress' },
    { id: 'waiting', name: 'Waiting / follow-up', tone: 'warn' },
    { id: 'done', name: 'Done', tone: 'success' }
  ];
  S.TASK_CATEGORIES = [
    'Shepherding', 'Meeting arrangements', 'Territory', 'Accounts', 'Maintenance',
    'Records & reports', 'Correspondence', 'Field service', 'Public witnessing', 'Other'
  ];
  S.PRIORITIES = [
    { id: 'high', name: 'High', tone: 'removed' },
    { id: 'medium', name: 'Medium', tone: 'warn' },
    { id: 'low', name: 'Low', tone: '' }
  ];

  /* ---------- territory ---------- */
  S.TERRITORY_STATUS = [
    { id: 'available', name: 'Available', tone: 'success' },
    { id: 'out', name: 'Checked out', tone: 'inprogress' },
    { id: 'overdue', name: 'Overdue', tone: 'removed' },
    { id: 'do_not_call', name: 'Restricted', tone: 'warn' }
  ];
  S.TERRITORY_TYPES = ['House-to-house', 'Business', 'Telephone', 'Letter writing', 'Public witnessing'];

  /* ---------- accounts ---------- */
  S.ACCOUNT_CATEGORIES = {
    income: ['Worldwide work donations', 'Congregation expenses donations', 'Other receipts'],
    expense: ['Kingdom Hall operating', 'Utilities', 'Maintenance', 'Literature & supplies',
      'Resolution — worldwide work', 'Other expenses']
  };

  /* ---------- subscription plans (SaaS) ---------- */
  S.PLANS = [
    {
      id: 'free', name: 'Single congregation', price: 0, period: 'free',
      limits: { congregations: 1, publishers: 60, history: 12 },
      features: ['One congregation', 'Up to 60 publishers', 'Scheduling, records, territories', 'Local browser storage']
    },
    {
      id: 'standard', name: 'Standard', price: 9, period: 'month',
      limits: { congregations: 1, publishers: 400, history: 60 },
      features: ['Unlimited publishers', 'Program import + auto-scheduling', 'Shepherding & task board',
        'Accounts and attendance', 'Nightly encrypted backup']
    },
    {
      id: 'circuit', name: 'Circuit', price: 49, period: 'month',
      limits: { congregations: 25, publishers: 5000, history: 120 },
      features: ['Up to 25 congregations', 'Circuit-wide speaker exchange', 'Consolidated reporting',
        'Role delegation & audit log', 'Priority support']
    }
  ];
  S.plan = function (id) { return S.PLANS.filter(function (p) { return p.id === id; })[0] || S.PLANS[0]; };

  global.Schema = S;
})(typeof window !== 'undefined' ? window : globalThis);
