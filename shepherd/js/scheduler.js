/* The scheduling engine: who may take a part, who should take it next, and what
   clashes once it is assigned. Views ask this for candidates; nothing here writes. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store;
  var Sch = {};

  // parts the chairman keeps for himself rather than handing to another brother
  var CHAIR_PARTS = ['opening_words', 'concluding'];

  /* ---------- eligibility ---------- */

  function inPool(person, pool) {
    switch (pool) {
      case 'elders_servants':
        return person.appointment === 'elder' || person.appointment === 'servant';
      case 'baptized_brothers':
        return person.gender === 'm' && !!person.baptizedOn;
      case 'brothers':
        return person.gender === 'm';
      default:
        return true;
    }
  }

  Sch.eligible = function (typeId, opts) {
    opts = opts || {};
    var t = S.partType(typeId);
    var qual = opts.qual || t.qual;
    return Store.activePeople().filter(function (p) {
      if (!inPool(p, opts.pool || t.pool)) return false;
      if (qual && (p.qualifications || []).indexOf(qual) === -1) return false;
      return true;
    });
  };

  /* Candidates for one slot, ranked. Blocked candidates are still returned so the
     elder can see *why* someone was skipped and override if they wish. */
  Sch.candidates = function (ctx) {
    // ctx: {typeId, qual, pool, date, weekStart, excludeIds, partId}
    var pool = Sch.eligible(ctx.typeId, { qual: ctx.qual, pool: ctx.pool });
    var maxPerWeek = ctx.maxPerWeek || 2;

    return U.sortBy(pool.map(function (p) {
      var reasons = [], blocked = false;

      var away = ctx.date && Store.isAway(p.id, ctx.date);
      if (away) { blocked = true; reasons.push('Away' + (away.note ? ' — ' + away.note : '')); }

      if ((ctx.excludeIds || []).indexOf(p.id) !== -1) {
        blocked = true; reasons.push('Already on this meeting');
      }

      var inWeek = ctx.weekStart ? Store.assignmentCountInWeek(p.id, ctx.weekStart) : 0;
      if (inWeek >= maxPerWeek) { blocked = true; reasons.push(inWeek + ' parts this week'); }
      else if (inWeek) reasons.push(inWeek + ' part this week');

      var last = Store.lastAssignedAt(p.id, ctx.typeId);
      var lastAny = Store.lastAssignedAt(p.id, null);
      var gapDays = last ? Math.abs(U.diffDays(last, ctx.date || U.today())) : 9999;
      if (last) reasons.push('Last: ' + U.fmtDate(last));
      else reasons.push('Never had this part');

      // higher score = better next choice
      var score = Math.min(gapDays, 900);
      if (!lastAny) score += 400;                       // spread the work to newcomers
      score -= inWeek * 250;
      if (p.status === 'irregular') score -= 60;

      return { person: p, blocked: blocked, reasons: reasons, score: score, lastAt: last };
    }), function (c) { return (c.blocked ? -1e6 : 0) - c.score; });
  };

  Sch.candidatesForPart = function (part, week, meeting, field) {
    var block = meeting === 'midweek' ? week.midweek : week.weekend;
    var exclude = [];
    block.parts.forEach(function (p) {
      if (p.id === part.id && field !== 'assistantId') return;
      if (p.assigneeId) exclude.push(p.assigneeId);
      if (p.assistantId) exclude.push(p.assistantId);
    });
    var t = S.partType(part.type);
    var qual = field === 'assistantId' ? (t.assistantQual || 'assistant') : t.qual;
    var pool = field === 'assistantId' ? (t.assistantQual ? t.pool : null) : t.pool;
    return Sch.candidates({
      typeId: part.type,
      qual: qual,
      pool: pool,
      date: block.date,
      weekStart: week.weekStart,
      excludeIds: exclude,
      maxPerWeek: 2
    });
  };

  /* ---------- auto-fill ---------- */

  /* Fills every empty slot in a week, best-first, honouring locks and away dates.
     Returns {filled, skipped:[{part, why}]}. Caller wraps it in Store.update. */
  Sch.planWeek = function (week, opts) {
    opts = opts || {};
    var plan = [], skipped = [];
    var taken = {};       // personId|meeting -> already placed by this plan
    var planned = {};     // personId -> how many parts this plan has given them this week
    var chaired = {};     // nobody chairs both meetings in the same week
    var maxWeek = opts.maxPerWeek || 2;

    ['midweek', 'weekend'].forEach(function (meeting) {
      if (opts.meeting && opts.meeting !== meeting) return;
      var block = week[meeting];
      if (block.cancelled) return;
      var placedThisMeeting = {};
      var chairmanId = null;

      // seed with what is already assigned
      block.parts.forEach(function (p) {
        if (p.assigneeId) placedThisMeeting[p.assigneeId] = true;
        if (p.assistantId) placedThisMeeting[p.assistantId] = true;
        if (p.type === 'chairman' && p.assigneeId) chairmanId = p.assigneeId;
      });

      /* Slot order matters: a part whose pool is four elders must be filled before
         one that any brother can take, or the scarce people are already used up.
         The chairman goes first because the opening and concluding parts follow him. */
      var slots = [];
      block.parts.forEach(function (p, order) {
        ['assigneeId', 'assistantId'].forEach(function (field) {
          var t = S.partType(p.type);
          if (field === 'assistantId' && !t.assistant) return;
          if (p.locked) return;
          if (p[field] && !opts.overwrite) return;
          var qual = field === 'assistantId' ? (t.assistantQual || 'assistant') : t.qual;
          var poolName = field === 'assistantId' ? (t.assistantQual ? t.pool : null) : t.pool;
          slots.push({
            part: p, field: field, order: order,
            rank: p.type === 'chairman' ? -1 : Sch.eligible(p.type, { qual: qual, pool: poolName }).length
          });
        });
      });
      slots = U.sortBy(slots, function (s) { return s.rank * 1000 + s.order; });

      slots.forEach(function (s) {
        var p = s.part, field = s.field;
        (function () {
          var t = S.partType(p.type);

          // the chairman gives the opening and concluding comments himself
          if (field === 'assigneeId' && chairmanId && CHAIR_PARTS.indexOf(p.type) !== -1) {
            plan.push({ partId: p.id, field: field, personId: chairmanId, meeting: meeting, title: p.title });
            return;
          }

          var exclude = Object.keys(placedThisMeeting);
          var qual = field === 'assistantId' ? (t.assistantQual || 'assistant') : t.qual;
          var pool = field === 'assistantId' ? (t.assistantQual ? t.pool : null) : t.pool;
          var cands = Sch.candidates({
            typeId: p.type, qual: qual, pool: pool,
            date: block.date, weekStart: week.weekStart,
            excludeIds: exclude, maxPerWeek: maxWeek
          }).filter(function (c) {
            if (c.blocked || taken[c.person.id + '|' + meeting]) return false;
            if (p.type === 'chairman' && chaired[c.person.id]) return false;
            return Store.assignmentCountInWeek(c.person.id, week.weekStart)
              + (planned[c.person.id] || 0) < maxWeek;
          });

          if (!cands.length) {
            skipped.push({ partId: p.id, title: p.title, field: field, why: 'No one available and qualified' });
            return;
          }
          var chosen = cands[0].person;
          plan.push({ partId: p.id, field: field, personId: chosen.id, meeting: meeting, title: p.title });
          placedThisMeeting[chosen.id] = true;
          taken[chosen.id + '|' + meeting] = true;
          planned[chosen.id] = (planned[chosen.id] || 0) + 1;
          if (p.type === 'chairman' && field === 'assigneeId') {
            chairmanId = chosen.id;
            chaired[chosen.id] = true;
          }
        })();
      });
    });

    return { plan: plan, skipped: skipped };
  };

  Sch.applyPlan = function (week, plan) {
    Store.update({
      action: 'schedule.autofill',
      summary: U.plural(plan.length, 'assignment') + ' filled for ' + U.fmtWeek(week.weekStart),
      entityId: week.id
    }, function () {
      plan.forEach(function (item) {
        var all = week.midweek.parts.concat(week.weekend.parts);
        var p = U.by(all, item.partId);
        if (!p) return;
        p[item.field] = item.personId;
        if (item.field === 'assigneeId' && p.status === 'unassigned') p.status = 'proposed';
      });
    });
  };

  /* ---------- conflicts ---------- */

  Sch.conflicts = function (week) {
    var out = [];
    ['midweek', 'weekend'].forEach(function (meeting) {
      var block = week[meeting];
      if (block.cancelled) return;
      var seen = {};
      var chairmanId = null;
      block.parts.forEach(function (p) {
        if (p.type === 'chairman') chairmanId = p.assigneeId;
      });
      block.parts.forEach(function (p) {
        [['assigneeId', p.assigneeId], ['assistantId', p.assistantId]].forEach(function (pair) {
          var field = pair[0], id = pair[1];
          if (!id) return;
          // the chairman's own opening and concluding comments are not a clash
          var chairsOwn = id === chairmanId && field === 'assigneeId'
            && (p.type === 'chairman' || CHAIR_PARTS.indexOf(p.type) !== -1);
          if (seen[id] && !chairsOwn) {
            out.push({ partId: p.id, field: field, personId: id, kind: 'double',
              message: Store.name(id) + ' has two parts on ' + U.fmtDate(block.date, 'day') });
          }
          seen[id] = true;
          var away = Store.isAway(id, block.date);
          if (away) {
            out.push({ partId: p.id, field: field, personId: id, kind: 'away',
              message: Store.name(id) + ' is away on ' + U.fmtDate(block.date, 'day') + (away.note ? ' (' + away.note + ')' : '') });
          }
          var t = S.partType(p.type);
          var qual = field === 'assistantId' ? (t.assistantQual || 'assistant') : t.qual;
          var person = Store.person(id);
          if (person && qual && (person.qualifications || []).indexOf(qual) === -1) {
            out.push({ partId: p.id, field: field, personId: id, kind: 'qual',
              message: Store.name(id) + ' is not marked for “' + (S.QUALIFICATIONS.filter(function (q) { return q.id === qual; })[0] || {}).name + '”' });
          }
        });
      });
    });
    return out;
  };

  Sch.conflictFor = function (week, partId, field) {
    return Sch.conflicts(week).filter(function (c) { return c.partId === partId && c.field === field; });
  };

  /* ---------- duty rota ---------- */

  /* Round-robin over the qualified pool, one pass per duty type, skipping people
     who are away or already carrying a meeting part that night. */
  Sch.planDuties = function (weeks, dutyTypeIds, opts) {
    opts = opts || {};
    var plan = [];
    var cursor = {};

    dutyTypeIds.forEach(function (dtId) {
      var dt = S.dutyType(dtId);
      var pool;
      if (dt.group) {
        pool = Store.groups().map(function (g) { return { id: g.id, group: true, name: g.name }; });
      } else {
        pool = Store.activePeople().filter(function (p) {
          return !dt.qual || (p.qualifications || []).indexOf(dt.qual) !== -1;
        });
        pool = U.sortBy(pool, function (p) { return Store.lastAssignedAt(p.id, null) || '0000'; });
      }
      if (!pool.length) return;
      cursor[dtId] = cursor[dtId] || 0;

      weeks.forEach(function (week) {
        ['midweek', 'weekend'].forEach(function (meeting) {
          if (opts.meetings && opts.meetings.indexOf(meeting) === -1) return;
          var block = week[meeting];
          if (block.cancelled) return;
          if (Store.duties().some(function (d) {
            return d.date === block.date && d.type === dtId;
          })) return;   // already covered

          var tries = 0, pick = null;
          while (tries < pool.length) {
            var cand = pool[cursor[dtId] % pool.length];
            cursor[dtId]++;
            tries++;
            if (cand.group) { pick = cand; break; }
            if (Store.isAway(cand.id, block.date)) continue;
            var busy = block.parts.some(function (p) {
              return p.assigneeId === cand.id || p.assistantId === cand.id;
            });
            if (busy && !opts.allowBusy) continue;
            if (plan.some(function (x) { return x.date === block.date && x.personId === cand.id; })) continue;
            pick = cand; break;
          }
          if (!pick) return;
          plan.push({
            date: block.date, meeting: meeting, type: dtId,
            personId: pick.group ? null : pick.id,
            groupId: pick.group ? pick.id : null
          });
        });
      });
    });
    return plan;
  };

  Sch.applyDutyPlan = function (plan) {
    Store.update({ action: 'duties.generated', summary: U.plural(plan.length, 'duty', 'duties') + ' scheduled' },
      function (st) {
        plan.forEach(function (d) {
          st.duties.push({
            id: U.uid('duty'), congId: Store.congId(), date: d.date, meeting: d.meeting,
            type: d.type, personId: d.personId, groupId: d.groupId, status: 'proposed', note: ''
          });
        });
      });
  };

  /* ---------- workload ---------- */

  Sch.workload = function (fromWeek, toWeek) {
    var counts = {};
    Store.weeks().forEach(function (w) {
      if (fromWeek && w.weekStart < fromWeek) return;
      if (toWeek && w.weekStart > toWeek) return;
      Store.allParts(w).forEach(function (row) {
        [row.part.assigneeId, row.part.assistantId].forEach(function (id) {
          if (!id) return;
          counts[id] = (counts[id] || 0) + 1;
        });
      });
    });
    Store.duties().forEach(function (d) {
      if (!d.personId) return;
      var ws = U.weekStart(d.date);
      if (fromWeek && ws < fromWeek) return;
      if (toWeek && ws > toWeek) return;
      counts[d.personId] = (counts[d.personId] || 0) + 1;
    });
    return counts;
  };

  global.Scheduler = Sch;
})(typeof window !== 'undefined' ? window : globalThis);
