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

  /* ---------- permissions ---------- */
  // capability -> roles that hold it. 'admin' implicitly holds everything.
  S.PERMISSIONS = {
    'schedule.view': ['publisher', 'servant', 'elder', 'secretary', 'coordinator', 'life_ministry', 'service', 'group_overseer', 'territory', 'accounts'],
    'schedule.edit': ['elder', 'coordinator', 'life_ministry'],
    'duties.edit': ['elder', 'coordinator', 'servant', 'life_ministry'],
    'publishers.view': ['elder', 'secretary', 'coordinator', 'group_overseer', 'service', 'life_ministry', 'servant'],
    'publishers.edit': ['secretary', 'coordinator', 'elder'],
    'reports.submit': ['publisher', 'servant', 'elder', 'secretary', 'coordinator', 'group_overseer', 'service', 'life_ministry', 'territory', 'accounts'],
    'reports.review': ['secretary', 'coordinator', 'elder', 'group_overseer', 'service'],
    'territories.view': ['publisher', 'servant', 'elder', 'secretary', 'coordinator', 'territory', 'service', 'group_overseer', 'life_ministry', 'accounts'],
    'territories.manage': ['territory', 'service', 'coordinator', 'elder'],
    'shepherding.view': ['elder', 'coordinator', 'secretary'],
    'tasks.view': ['elder', 'servant', 'coordinator', 'secretary', 'group_overseer', 'service', 'life_ministry', 'territory', 'accounts'],
    'tasks.edit': ['elder', 'coordinator', 'secretary', 'servant'],
    'attendance.edit': ['secretary', 'coordinator', 'elder', 'servant'],
    'accounts.view': ['accounts', 'coordinator', 'secretary', 'elder'],
    'accounts.edit': ['accounts', 'coordinator'],
    'announce.publish': ['secretary', 'coordinator', 'elder'],
    'files.manage': ['elder', 'secretary', 'coordinator', 'servant', 'accounts', 'territory', 'life_ministry', 'service'],
    'admin.manage': []            // admin only
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

  /* ---------- assignment workflow ---------- */
  S.PART_STATUS = [
    { id: 'unassigned', name: 'Unassigned', tone: '' },
    { id: 'proposed', name: 'Proposed', tone: 'warn' },
    { id: 'notified', name: 'Notified', tone: 'inprogress' },
    { id: 'confirmed', name: 'Confirmed', tone: 'success' },
    { id: 'declined', name: 'Declined', tone: 'removed' }
  ];

  /* ---------- duty (rota) types ---------- */
  S.DUTY_TYPES = [
    { id: 'av', name: 'Audio / video', qual: 'av', perMeeting: 1 },
    { id: 'attendant_main', name: 'Attendant (auditorium)', qual: 'attendant', perMeeting: 1 },
    { id: 'attendant_door', name: 'Attendant (entrance)', qual: 'attendant', perMeeting: 1 },
    { id: 'mic1', name: 'Microphone 1', qual: 'mic', perMeeting: 1 },
    { id: 'mic2', name: 'Microphone 2', qual: 'mic', perMeeting: 1 },
    { id: 'platform', name: 'Platform', qual: 'platform', perMeeting: 1 },
    { id: 'cleaning', name: 'Cleaning group', qual: null, perMeeting: 1, group: true },
    { id: 'zoom', name: 'Zoom host', qual: 'av', perMeeting: 1 }
  ];
  S.dutyType = function (id) {
    return S.DUTY_TYPES.filter(function (d) { return d.id === id; })[0] || { id: id, name: id };
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
