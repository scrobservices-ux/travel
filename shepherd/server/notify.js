/* Invitations, assignment notices, the weekly digest, and calendar feeds.
 *
 * Invitations and calendar links are kept in their own files, never in the synced
 * document: a calendar URL is a bearer token, and an invitation is a way in. */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

require('../js/util.js');
require('../js/schema.js');
var U = globalThis.U;
var S = globalThis.Schema;

var INVITE_DAYS = 14;

function Notify(dir, mail, push) {
  this.dir = dir;
  this.mail = mail;
  this.push = push || null;
  this.invitePath = path.join(dir, 'invites.json');
  this.calendarPath = path.join(dir, 'calendars.json');
  this.sentPath = path.join(dir, 'reminders.json');
  this.invites = read(this.invitePath, {});
  this.calendars = read(this.calendarPath, {});
  this.sent = read(this.sentPath, {});
}

/* A reminder is sent once and once only. The key carries the date, so the same
   nudge next month is a different key; anything older than 90 days is dropped so
   the file cannot grow for ever. */
Notify.prototype.once = function (key) {
  if (this.sent[key]) return false;
  this.sent[key] = Date.now();
  var cutoff = Date.now() - 90 * 86400000;
  var self = this;
  Object.keys(this.sent).forEach(function (k) { if (self.sent[k] < cutoff) delete self.sent[k]; });
  write(this.sentPath, this.sent);
  return true;
};

/* Sends a pop-up to every device a person has, if they have asked for them.
   Quiet about failures: a reminder that could not be delivered must never stop
   the email that says the same thing. */
Notify.prototype.pop = function (person, message) {
  if (!this.push || !person) return Promise.resolve({ sent: 0 });
  if (!wants(person, 'push')) return Promise.resolve({ sent: 0 });
  return this.push.toPerson(person.id, message).catch(function () { return { sent: 0, failed: 1 }; });
};

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function write(file, value) {
  var tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}
function token() { return crypto.randomBytes(24).toString('base64url'); }

/* ---------- what a person has asked to receive ---------- */

function wants(person, kind) {
  var n = (person && person.notify) || {};
  if (kind === 'assignment') return n.assignments !== false;
  if (kind === 'digest') return n.digest !== false;
  if (kind === 'report') return n.reports !== false;
  if (kind === 'cleaning') return n.cleaning !== false;
  if (kind === 'covisit') return n.covisit !== false;
  if (kind === 'push') return n.push !== false;
  return true;
}
Notify.wants = wants;

/* ---------- invitations ---------- */

Notify.prototype.invite = function (opts) {
  // opts: {person, cong, email, invitedBy, baseUrl}
  var t = token();
  this.invites[t] = {
    personId: opts.person.id,
    congId: opts.person.congId,
    email: String(opts.email || opts.person.email || '').trim().toLowerCase(),
    invitedBy: opts.invitedBy,
    createdAt: Date.now(),
    expiresAt: Date.now() + INVITE_DAYS * 86400000,
    acceptedAt: null
  };
  write(this.invitePath, this.invites);

  var link = (opts.baseUrl || '').replace(/\/$/, '') + '/invite?token=' + t;
  var name = opts.person.firstName;
  var congName = opts.cong ? opts.cong.name : 'the congregation';
  var invitedByName = opts.invitedByName || 'an elder';

  var text = [
    'Hello ' + name + ',',
    '',
    invitedByName + ' has set up an account for you on Shepherd, which ' + congName
      + ' uses for the meeting schedule and the duty rota.',
    '',
    'Open this link to choose your password:',
    link,
    '',
    'Once you are in you can see the parts and duties you have been given, tell the elders when you are away, and hand in your field service report.',
    '',
    'The link works for ' + INVITE_DAYS + ' days. If you were not expecting this, you can ignore it.'
  ].join('\n');

  var html = layout('You have been invited', [
    '<p>Hello ' + esc(name) + ',</p>',
    '<p>' + esc(invitedByName) + ' has set up an account for you on Shepherd, which '
      + esc(congName) + ' uses for the meeting schedule and the duty rota.</p>',
    button(link, 'Choose your password'),
    '<p class="muted">Once you are in you can see the parts and duties you have been given, tell the elders when you are away, and hand in your field service report.</p>',
    '<p class="muted">The link works for ' + INVITE_DAYS + ' days. If you were not expecting this, you can ignore it.</p>'
  ]);

  this.mail.enqueue({
    to: this.invites[t].email,
    toName: opts.person.firstName + ' ' + opts.person.lastName,
    subject: 'Your ' + congName + ' account',
    text: text, html: html, kind: 'invite', personId: opts.person.id
  });

  return { token: t, link: link, invite: this.invites[t] };
};

Notify.prototype.inviteFor = function (t) {
  var inv = this.invites[t];
  if (!inv) return null;
  if (inv.acceptedAt) return { expired: true, reason: 'That invitation has already been used.' };
  if (inv.expiresAt < Date.now()) return { expired: true, reason: 'That invitation has expired — ask an elder to send a new one.' };
  return inv;
};

Notify.prototype.acceptInvite = function (t) {
  var inv = this.invites[t];
  if (!inv) return null;
  inv.acceptedAt = Date.now();
  write(this.invitePath, this.invites);
  return inv;
};

Notify.prototype.inviteStatus = function (personId) {
  var self = this;
  var found = null;
  Object.keys(this.invites).forEach(function (t) {
    var inv = self.invites[t];
    if (inv.personId !== personId) return;
    if (!found || inv.createdAt > found.createdAt) found = inv;
  });
  if (!found) return null;
  return {
    email: found.email,
    invitedAt: found.createdAt,
    acceptedAt: found.acceptedAt,
    expiresAt: found.expiresAt,
    state: found.acceptedAt ? 'accepted' : (found.expiresAt < Date.now() ? 'expired' : 'invited')
  };
};

/* ---------- calendar feeds ---------- */

Notify.prototype.calendarToken = function (personId) {
  var self = this;
  var existing = Object.keys(this.calendars).filter(function (t) {
    return self.calendars[t].personId === personId;
  })[0];
  if (existing) return existing;
  var t = token();
  this.calendars[t] = { personId: personId, createdAt: Date.now() };
  write(this.calendarPath, this.calendars);
  return t;
};

Notify.prototype.personForCalendar = function (t) {
  var rec = this.calendars[t];
  return rec ? rec.personId : null;
};

Notify.prototype.resetCalendar = function (personId) {
  var self = this;
  Object.keys(this.calendars).forEach(function (t) {
    if (self.calendars[t].personId === personId) delete self.calendars[t];
  });
  write(this.calendarPath, this.calendars);
  return this.calendarToken(personId);
};

/* ---------- what changed: who has just been given something ---------- */

/* Compares a week before and after a change and returns the people newly on it. */
Notify.newAssignments = function (before, after) {
  var out = [];
  ['midweek', 'weekend'].forEach(function (meeting) {
    var b = (before && before[meeting] && before[meeting].parts) || [];
    var a = (after && after[meeting] && after[meeting].parts) || [];
    a.forEach(function (part) {
      var old = b.filter(function (x) { return x.id === part.id; })[0] || {};
      [['assigneeId', false], ['assistantId', true]].forEach(function (pair) {
        var field = pair[0];
        var id = part[field];
        if (!id || id === old[field]) return;
        out.push({
          personId: id,
          partId: part.id,
          title: part.title,
          assistant: pair[1],
          minutes: part.minutes,
          source: part.source,
          notes: part.notes,
          date: after[meeting].date,
          time: after[meeting].time,
          meeting: meeting,
          with: field === 'assigneeId' ? part.assistantId : part.assigneeId
        });
      });
    });
  });
  return out;
};

Notify.newDuty = function (before, after, dutyName) {
  if (!after || !after.personId) return null;
  if (before && before.personId === after.personId) return null;
  return {
    personId: after.personId,
    title: dutyName,
    date: after.date,
    meeting: after.meeting,
    duty: true
  };
};

/* ---------- messages ---------- */

Notify.prototype.assignmentEmail = function (opts) {
  // opts: {person, cong, items:[], baseUrl}
  var lines = opts.items.map(function (it) {
    var bits = ['• ' + it.title + (it.assistant ? ' (as assistant)' : '')];
    bits.push('   ' + U.fmtDate(it.date, 'long') + (it.time ? ' at ' + it.time : ''));
    if (it.minutes) bits.push('   ' + it.minutes + ' minutes');
    if (it.source) bits.push('   ' + it.source);
    if (it.withName) bits.push('   With ' + it.withName);
    if (it.notes) bits.push('   Note: ' + it.notes);
    return bits.join('\n');
  });

  var link = (opts.baseUrl || '').replace(/\/$/, '') + '/#/my-assignments';
  var text = [
    'Hello ' + opts.person.firstName + ',',
    '',
    opts.items.length === 1 ? 'You have been given an assignment:' : 'You have been given some assignments:',
    '',
    lines.join('\n\n'),
    '',
    'You can confirm it here: ' + link,
    '',
    'If you cannot care for it, please let an elder know as soon as you can.',
    '',
    opts.cong ? opts.cong.name : ''
  ].join('\n');

  var html = layout(opts.items.length === 1 ? 'You have an assignment' : 'You have new assignments', [
    '<p>Hello ' + esc(opts.person.firstName) + ',</p>',
    opts.items.map(function (it) {
      return '<div class="card"><div class="t">' + esc(it.title)
        + (it.assistant ? ' <span class="muted">(as assistant)</span>' : '') + '</div>'
        + '<div class="d">' + esc(U.fmtDate(it.date, 'long') + (it.time ? ' at ' + it.time : '')) + '</div>'
        + (it.minutes ? '<div class="muted">' + it.minutes + ' minutes</div>' : '')
        + (it.source ? '<div class="muted">' + esc(it.source) + '</div>' : '')
        + (it.withName ? '<div class="muted">With ' + esc(it.withName) + '</div>' : '')
        + (it.notes ? '<div class="note">' + esc(it.notes) + '</div>' : '')
        + '</div>';
    }).join(''),
    button(link, 'Confirm it'),
    '<p class="muted">If you cannot care for it, please let an elder know as soon as you can.</p>'
  ]);

  this.mail.enqueue({
    to: opts.person.email,
    toName: opts.person.firstName + ' ' + opts.person.lastName,
    subject: opts.items.length === 1
      ? opts.items[0].title + ' — ' + U.fmtDate(opts.items[0].date, 'day')
      : U.plural(opts.items.length, 'new assignment'),
    text: text, html: html, kind: 'assignment', personId: opts.person.id
  });
};

Notify.prototype.digestEmail = function (opts) {
  // opts: {person, cong, items:[], baseUrl}
  var link = (opts.baseUrl || '').replace(/\/$/, '') + '/#/my-assignments';
  var lines = opts.items.map(function (it) {
    return '• ' + U.fmtDate(it.date, 'day') + ' — ' + it.title + (it.assistant ? ' (assistant)' : '');
  });
  var text = [
    'Hello ' + opts.person.firstName + ',',
    '',
    opts.items.length ? 'This is what you have coming up:' : 'You have nothing scheduled at the moment.',
    '',
    lines.join('\n'),
    '',
    link
  ].join('\n');
  var html = layout('The week ahead', [
    '<p>Hello ' + esc(opts.person.firstName) + ',</p>',
    opts.items.length
      ? '<ul>' + opts.items.map(function (it) {
        return '<li><strong>' + esc(U.fmtDate(it.date, 'day')) + '</strong> — ' + esc(it.title)
          + (it.assistant ? ' <span class="muted">(assistant)</span>' : '') + '</li>';
      }).join('') + '</ul>'
      : '<p>You have nothing scheduled at the moment.</p>',
    button(link, 'Open my assignments')
  ]);
  this.mail.enqueue({
    to: opts.person.email,
    toName: opts.person.firstName + ' ' + opts.person.lastName,
    subject: 'Your week — ' + (opts.cong ? opts.cong.name : 'Shepherd'),
    text: text, html: html, kind: 'digest', personId: opts.person.id
  });
};

Notify.prototype.reportReminderEmail = function (opts) {
  var link = (opts.baseUrl || '').replace(/\/$/, '') + '/#/my-report';
  var period = U.periodLabel(opts.period);
  var text = [
    'Hello ' + opts.person.firstName + ',',
    '',
    'Your field service report for ' + period + ' has not been handed in yet.',
    'It takes a moment: ' + link,
    '',
    opts.cong ? opts.cong.name : ''
  ].join('\n');
  var html = layout('Field service report for ' + period, [
    '<p>Hello ' + esc(opts.person.firstName) + ',</p>',
    '<p>Your field service report for <strong>' + esc(period) + '</strong> has not been handed in yet.</p>',
    button(link, 'Hand it in')
  ]);
  this.mail.enqueue({
    to: opts.person.email,
    toName: opts.person.firstName + ' ' + opts.person.lastName,
    subject: 'Field service report for ' + period,
    text: text, html: html, kind: 'report', personId: opts.person.id
  });
};

/* ---------- cleaning the hall ---------- */

/* opts: {person, cong, item, label, when, baseUrl, general} */
Notify.prototype.cleaningEmail = function (opts) {
  if (!opts.person.email) return null;
  var link = (opts.baseUrl || '').replace(/\/$/, '') + '/#/my-cleaning';
  var when = U.fmtDate(opts.item.date, 'long');
  var lead = opts.item.kind === 'general'
    ? 'The whole congregation is invited to clean the hall on ' + when
      + ', from ' + (opts.item.time || '09:00') + '.'
    : 'It is your group’s turn to care for the hall on ' + when
      + ', after the ' + (opts.item.meeting === 'midweek' ? 'midweek' : 'weekend') + ' meeting.';
  var text = [
    'Hello ' + opts.person.firstName + ',',
    '',
    lead,
    opts.item.notes ? '' : null,
    opts.item.notes ? 'Note: ' + opts.item.notes : null,
    '',
    link,
    '',
    opts.cong ? opts.cong.name : ''
  ].filter(function (l) { return l !== null; }).join('\n');
  var html = layout(opts.item.kind === 'general' ? 'General cleaning' : 'Your group cleans the hall', [
    '<p>Hello ' + esc(opts.person.firstName) + ',</p>',
    '<p>' + esc(lead) + '</p>',
    opts.item.notes ? '<div class="note">' + esc(opts.item.notes) + '</div>' : '',
    button(link, 'See the rota')
  ]);
  return this.mail.enqueue({
    to: opts.person.email,
    toName: opts.person.firstName + ' ' + opts.person.lastName,
    subject: opts.item.kind === 'general'
      ? 'General cleaning — ' + U.fmtDate(opts.item.date, 'day')
      : 'Your group cleans the hall — ' + U.fmtDate(opts.item.date, 'day'),
    text: text, html: html, kind: 'cleaning', personId: opts.person.id
  });
};

/* What the pop-up says. Short, because it is read on a lock screen. */
Notify.cleaningPop = function (item, label) {
  var when = U.fmtDate(item.date, 'day');
  if (item.kind === 'general') {
    return {
      title: 'General cleaning ' + when,
      body: 'The whole congregation, from ' + (item.time || '09:00') + '.'
        + (item.notes ? ' ' + item.notes : ''),
      url: './#/my-cleaning', tag: 'cleaning-' + item.id, kind: 'cleaning'
    };
  }
  return {
    title: 'Your group cleans the hall ' + when,
    body: 'After the ' + (item.meeting === 'midweek' ? 'midweek' : 'weekend') + ' meeting'
      + (label ? ' — ' + label : '') + '.' + (item.notes ? ' ' + item.notes : ''),
    url: './#/my-cleaning', tag: 'cleaning-' + item.id, kind: 'cleaning'
  };
};

/* The coordinator and the cleaning servant are told who is on, whether or not
   it is their own group — they are the ones who get asked. */
Notify.prototype.cleaningOverviewEmail = function (opts) {
  if (!opts.person.email) return null;
  var link = (opts.baseUrl || '').replace(/\/$/, '') + '/#/cleaning';
  var lines = opts.items.map(function (i) {
    return '• ' + U.fmtDate(i.date, 'day') + ' — ' + i.label
      + (i.item.kind === 'general' ? ' (general cleaning, from ' + (i.item.time || '09:00') + ')' : '');
  });
  var text = [
    'Hello ' + opts.person.firstName + ',',
    '',
    'Coming up on the cleaning rota:',
    '',
    lines.join('\n'),
    '',
    'Everyone concerned has been told.',
    link
  ].join('\n');
  var html = layout('Cleaning coming up', [
    '<p>Hello ' + esc(opts.person.firstName) + ',</p>',
    '<ul>' + opts.items.map(function (i) {
      return '<li>' + esc(U.fmtDate(i.date, 'day') + ' — ' + i.label) + '</li>';
    }).join('') + '</ul>',
    '<p class="muted small">Everyone concerned has been told.</p>',
    button(link, 'Open the rota')
  ]);
  return this.mail.enqueue({
    to: opts.person.email,
    toName: opts.person.firstName + ' ' + opts.person.lastName,
    subject: 'Cleaning coming up',
    text: text, html: html, kind: 'cleaning', personId: opts.person.id
  });
};

/* ---------- the circuit overseer's visit ---------- */

/* opts: {person, cong, visit, tasks, baseUrl, tone: 'due'|'overdue'} */
Notify.prototype.covisitEmail = function (opts) {
  if (!opts.person.email) return null;
  var link = (opts.baseUrl || '').replace(/\/$/, '') + '/#/covisit/' + opts.visit.id;
  var late = opts.tone === 'overdue';
  var lead = late
    ? 'These are past the day they were wanted by, and the circuit overseer arrives on '
      + U.fmtDate(opts.visit.from, 'long') + '.'
    : 'These are wanted this week, before the circuit overseer arrives on '
      + U.fmtDate(opts.visit.from, 'long') + '.';
  var lines = opts.tasks.map(function (t) {
    return '• ' + t.title + ' — by ' + U.fmtDate(t.dueOn, 'day');
  });
  var text = [
    'Hello ' + opts.person.firstName + ',',
    '',
    lead,
    '',
    lines.join('\n'),
    '',
    'Tick them off here: ' + link,
    '',
    opts.cong ? opts.cong.name : ''
  ].join('\n');
  var html = layout(late ? 'Still to do for the visit' : 'Your part of the visit preparation', [
    '<p>Hello ' + esc(opts.person.firstName) + ',</p>',
    '<p>' + esc(lead) + '</p>',
    opts.tasks.map(function (t) {
      return '<div class="card"><div class="t">' + esc(t.title) + '</div>'
        + '<div class="d">Wanted by ' + esc(U.fmtDate(t.dueOn, 'day')) + '</div>'
        + (t.detail ? '<div class="note">' + esc(t.detail) + '</div>' : '')
        + '</div>';
    }).join(''),
    button(link, 'Open the preparation')
  ]);
  return this.mail.enqueue({
    to: opts.person.email,
    toName: opts.person.firstName + ' ' + opts.person.lastName,
    subject: late ? 'Still to do before the circuit overseer’s visit'
      : 'Your part of the circuit overseer’s visit preparation',
    text: text, html: html, kind: 'covisit', personId: opts.person.id
  });
};

Notify.covisitPop = function (visit, tasks, late) {
  var first = tasks[0];
  return {
    title: late ? 'Overdue for the circuit overseer’s visit' : 'Due this week for the visit',
    body: tasks.length === 1
      ? first.title + ' — by ' + U.fmtDate(first.dueOn, 'day')
      : tasks.length + ' jobs, the first by ' + U.fmtDate(first.dueOn, 'day'),
    url: './#/covisit/' + visit.id,
    tag: 'covisit-' + visit.id + (late ? '-late' : ''),
    important: !!late,
    kind: 'covisit'
  };
};

Notify.assignmentPop = function (items) {
  var first = items[0];
  return {
    title: items.length === 1 ? 'You have an assignment' : 'You have ' + items.length + ' assignments',
    body: items.length === 1
      ? first.title + ' — ' + U.fmtDate(first.date, 'day')
      : items.map(function (i) { return i.title; }).slice(0, 3).join(', '),
    url: './#/my-assignments', tag: 'assignment', kind: 'assignment'
  };
};

/* ---------- html shell ---------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

function button(href, label) {
  return '<p><a class="btn" href="' + esc(href) + '">' + esc(label) + '</a></p>'
    + '<p class="muted small">If the button does not work, copy this into your browser:<br>'
    + '<span class="link">' + esc(href) + '</span></p>';
}

function layout(title, blocks) {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>',
    'body{margin:0;padding:24px;background:#F4F5F7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#172B4D;line-height:1.5}',
    '.wrap{max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;border:1px solid #DFE1E6}',
    'h1{font-size:19px;margin:0 0 16px;color:#091E42}',
    'p{margin:0 0 14px}',
    'ul{padding-left:18px;margin:0 0 16px}li{margin-bottom:6px}',
    '.muted{color:#5E6C84}.small{font-size:12px}',
    '.link{word-break:break-all;color:#0052CC}',
    '.btn{display:inline-block;background:#0052CC;color:#fff !important;text-decoration:none;padding:10px 18px;border-radius:4px;font-weight:600}',
    '.card{border:1px solid #DFE1E6;border-radius:6px;padding:14px;margin-bottom:12px}',
    '.card .t{font-weight:600;font-size:15px}.card .d{color:#42526E;margin-top:2px}',
    '.note{margin-top:8px;padding:8px;background:#F4F5F7;border-left:3px solid #5E6C84;font-size:13px}',
    '.foot{margin-top:22px;padding-top:14px;border-top:1px solid #DFE1E6;color:#7A869A;font-size:12px}',
    '</style></head><body><div class="wrap">',
    '<h1>' + esc(title) + '</h1>',
    blocks.join('\n'),
    '<div class="foot">Sent by Shepherd, which your congregation runs itself. '
      + 'You can turn these messages off under “My details” in the app.</div>',
    '</div></body></html>'
  ].join('\n');
}

/* ---------- calendar ---------- */

function icsDate(dateIso, time) {
  var t = (time || '00:00').replace(':', '') + '00';
  return dateIso.replace(/-/g, '') + 'T' + t;
}
function icsEscape(s) {
  return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}
/* iCalendar counts octets, not characters, and a character must never be split
   across the fold — so a name with an accent or a dash is measured properly. */
function fold(line) {
  if (Buffer.byteLength(line, 'utf8') <= 74) return line;
  var out = [];
  var chunk = '';
  var used = 0;
  var limit = 74;                      // first line; continuations lose one to the leading space
  var chars = Array.from(line);
  for (var i = 0; i < chars.length; i++) {
    var size = Buffer.byteLength(chars[i], 'utf8');
    if (used + size > limit) {
      out.push(out.length ? ' ' + chunk : chunk);
      chunk = '';
      used = 0;
      limit = 73;
    }
    chunk += chars[i];
    used += size;
  }
  if (chunk) out.push(out.length ? ' ' + chunk : chunk);
  return out.join('\r\n');
}

/* events: [{uid, title, date, time, minutes, description, location}] */
Notify.buildIcs = function (name, events) {
  var lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shepherd//Congregation//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEscape(name),
    'X-WR-TIMEZONE:UTC'
  ];
  events.forEach(function (ev) {
    var start = icsDate(ev.date, ev.time);
    var endTime = addMinutes(ev.time || '00:00', ev.minutes || 60);
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + ev.uid + '@shepherd');
    lines.push('DTSTAMP:' + icsDate(U.today(), '00:00') + 'Z');
    lines.push('DTSTART:' + start);
    lines.push('DTEND:' + icsDate(ev.date, endTime));
    lines.push('SUMMARY:' + icsEscape(ev.title));
    if (ev.description) lines.push('DESCRIPTION:' + icsEscape(ev.description));
    if (ev.location) lines.push('LOCATION:' + icsEscape(ev.location));
    lines.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY',
      'DESCRIPTION:' + icsEscape(ev.title), 'END:VALARM');
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  // every line is folded here, so nothing can be pushed above and forgotten
  return lines.map(fold).join('\r\n') + '\r\n';
};

function addMinutes(time, minutes) {
  var parts = String(time).split(':');
  var total = (+parts[0]) * 60 + (+parts[1] || 0) + (+minutes || 60);
  var h = Math.floor(total / 60) % 24, m = total % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

module.exports = Notify;
