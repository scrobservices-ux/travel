/* The scheduling engine: who may take a part, whose turn it is, who is being
   left out, and what clashes once it is assigned.
 *
 * Fairness is the point of it. Candidates are ranked by how little they are
 * carrying over a rolling window first and how long they have waited second, so
 * the rotation levels itself out and someone who has never had an assignment
 * comes to the top rather than being quietly skipped forever. Nothing here
 * writes; views ask for a plan and apply it. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store;
  var Sch = {};

  // parts the chairman keeps for himself rather than handing to another brother
  var CHAIR_PARTS = ['opening_words', 'concluding'];

  // how far back fairness looks
  Sch.WINDOW_WEEKS = 26;

  function windowStart() {
    return U.addDays(U.weekStart(U.today()), -7 * Sch.WINDOW_WEEKS);
  }

  /* ---------- availability ---------- */

  /* Why this person cannot serve on that date, or null if they can. */
  Sch.unavailableReason = function (person, dateIso, meeting, opts) {
    opts = opts || {};
    var av = S.availabilityOf(person);

    var away = dateIso && Store.isAway(person.id, dateIso);
    if (away) return 'Away' + (away.note ? ' — ' + away.note : '');

    if (meeting === 'midweek' && !av.midweek) return 'Not available midweek';
    if (meeting === 'weekend' && !av.weekend) return 'Not available at the weekend';
    if (opts.duty && !av.duties) return 'Not on the duty rota';

    if (av.maxPerMonth != null && dateIso) {
      var period = U.period(dateIso);
      var already = Store.assignmentCountInMonth(person.id, period) + (opts.pendingInMonth || 0);
      if (already >= av.maxPerMonth) {
        return 'Asks for no more than ' + U.plural(av.maxPerMonth, 'assignment') + ' a month';
      }
    }
    return null;
  };

  Sch.isAvailable = function (person, dateIso, meeting, opts) {
    return !Sch.unavailableReason(person, dateIso, meeting, opts);
  };

  /* ---------- eligibility ---------- */

  function inPool(person, pool) {
    switch (pool) {
      case 'elders_servants':
        return person.appointment === 'elder' || person.appointment === 'servant';
      case 'baptized_brothers':
        return person.gender === 'm' && !!person.baptizedOn;
      case 'brothers':
        return person.gender === 'm';
      case 'sisters':
        return person.gender === 'f';
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
      if (opts.gender && p.gender !== opts.gender) return false;
      return true;
    });
  };

  /* ---------- ranking ---------- */

  /* Candidates for one slot, fairest first. Blocked people are still returned so
     an elder can see *why* someone was skipped and overrule it. */
  /* Everything a person is carrying: the recent past plus anything already booked
     ahead. Counting the future matters — the duty rota is filled after the meeting
     parts, and without it the same willing brother is picked twice. */
  Sch.carriedBy = function (personId, pending) {
    return Store.assignmentCountBetween(personId, windowStart(), null) + (pending || 0);
  };

  Sch.candidates = function (ctx) {
    var pool = Sch.eligible(ctx.typeId, { qual: ctx.qual, pool: ctx.pool, gender: ctx.gender });
    var maxPerWeek = ctx.maxPerWeek || 2;
    var pending = ctx.pending || {};        // personId -> already placed by the plan in progress

    return U.sortBy(pool.map(function (p) {
      var reasons = [], blocked = false;

      var why = Sch.unavailableReason(p, ctx.date, ctx.meeting, {
        duty: ctx.duty, pendingInMonth: pending[p.id] || 0
      });
      if (why) { blocked = true; reasons.push(why); }

      if ((ctx.excludeIds || []).indexOf(p.id) !== -1) {
        blocked = true; reasons.push('Already on this meeting');
      }

      var inWeek = ctx.weekStart ? Store.assignmentCountInWeek(p.id, ctx.weekStart) : 0;
      if (inWeek >= maxPerWeek) { blocked = true; reasons.push(inWeek + ' already this week'); }
      else if (inWeek) reasons.push(inWeek + ' already this week');

      // how much this person is carrying over the fairness window
      var carried = Sch.carriedBy(p.id, pending[p.id] || 0);
      var last = Store.lastAssignedAt(p.id, ctx.typeId);
      var lastAny = Store.lastAssignedAt(p.id, null);

      if (!lastAny) reasons.push('Never had an assignment');
      else if (!last) reasons.push('Never had this part · last used ' + U.fmtDate(lastAny));
      else reasons.push(carried + ' in ' + Sch.WINDOW_WEEKS + ' weeks · last ' + U.fmtDate(last));

      return {
        person: p, blocked: blocked, reasons: reasons,
        carried: carried,
        lastAt: last, lastAny: lastAny,
        inWeek: inWeek
      };
    }), function (c) {
      if (c.blocked) return 1e12;                      // blocked people sink to the bottom
      // anyone already on this week waits until everyone free has had a turn;
      // then fewest carried overall; then whoever has waited longest
      return (c.inWeek * 1e9)
        + (c.carried * 1e6)
        + (c.lastAt ? U.diffDays('1970-01-01', c.lastAt) : 0) * 10
        + (c.lastAny ? U.diffDays('1970-01-01', c.lastAny) : 0) * 0.01;
    });
  };

  /* Assistants on a demonstration are normally the same sex as the student —
     and a member of the same household is better still. */
  function assistantContext(part, week, meeting) {
    var t = S.partType(part.type);
    if (t.assistantQual) return { qual: t.assistantQual, pool: t.pool, gender: null };
    var main = part.assigneeId && Store.person(part.assigneeId);
    var cong = Store.cong();
    var pairSame = cong.pairSameGender !== false;
    return {
      qual: 'assistant',
      pool: null,
      gender: (pairSame && main) ? main.gender : null,
      household: main || null
    };
  }

  function householdBoost(cands, main) {
    if (!main) return cands;
    return U.sortBy(cands, function (c) {
      if (c.blocked) return 3;
      var same = c.person.lastName === main.lastName
        || (c.person.address && c.person.address === main.address);
      return same ? 0 : 1;
    });
  }

  Sch.candidatesForPart = function (part, week, meeting, field) {
    var block = meeting === 'midweek' ? week.midweek : week.weekend;
    var exclude = [];
    block.parts.forEach(function (p) {
      if (p.id === part.id && field !== 'assistantId') return;
      if (p.assigneeId) exclude.push(p.assigneeId);
      if (p.assistantId) exclude.push(p.assistantId);
    });
    var t = S.partType(part.type);
    var ctx = {
      typeId: part.type,
      qual: t.qual,
      pool: t.pool,
      gender: null,
      date: block.date,
      meeting: meeting,
      weekStart: week.weekStart,
      excludeIds: exclude,
      maxPerWeek: 2
    };
    if (field === 'assistantId') {
      var a = assistantContext(part, week, meeting);
      ctx.qual = a.qual; ctx.pool = a.pool; ctx.gender = a.gender;
      var list = Sch.candidates(ctx);
      return householdBoost(list, a.household);
    }
    return Sch.candidates(ctx);
  };

  /* ---------- filling a week ---------- */

  /* Fills every empty slot, scarcest pool first, honouring locks, away dates and
     each person's own availability. `state` carries counts between weeks so a run
     over several weeks stays balanced rather than restarting each week. */
  Sch.planWeek = function (week, opts) {
    opts = opts || {};
    var plan = [], skipped = [];
    var state = opts.state || { placed: {}, monthly: {} };
    var maxWeek = opts.maxPerWeek || 2;

    ['midweek', 'weekend'].forEach(function (meeting) {
      if (opts.meeting && opts.meeting !== meeting) return;
      var block = week[meeting];
      if (block.cancelled) return;
      var placedThisMeeting = {};
      var chairmanId = null;
      var period = U.period(block.date);

      block.parts.forEach(function (p) {
        if (p.assigneeId) placedThisMeeting[p.assigneeId] = true;
        if (p.assistantId) placedThisMeeting[p.assistantId] = true;
        if (p.type === 'chairman' && p.assigneeId) chairmanId = p.assigneeId;
      });

      /* Scarcest pools first: a part only four elders can take must be filled
         before one any brother can take, or the scarce people are used up. */
      var slots = [];
      block.parts.forEach(function (p, order) {
        var t = S.partType(p.type);
        // the part is ranked by its own pool, and its assistant follows it, so the
        // student is always known before their partner is chosen
        var rank = p.type === 'chairman' ? -1
          : Sch.eligible(p.type, { qual: t.qual, pool: t.pool }).length;
        ['assigneeId', 'assistantId'].forEach(function (field, fieldIndex) {
          if (field === 'assistantId' && !t.assistant) return;
          if (p.locked) return;
          if (p[field] && !opts.overwrite) return;
          slots.push({ part: p, field: field, order: order, fieldIndex: fieldIndex, rank: rank });
        });
      });
      slots = U.sortBy(slots, function (s) { return s.rank * 10000 + s.order * 10 + s.fieldIndex; });

      slots.forEach(function (s) {
        var p = s.part, field = s.field;
        var t = S.partType(p.type);

        // the chairman gives the opening and concluding comments himself
        if (field === 'assigneeId' && chairmanId && CHAIR_PARTS.indexOf(p.type) !== -1) {
          plan.push({ partId: p.id, field: field, personId: chairmanId, meeting: meeting, title: p.title });
          return;
        }

        var ctx = {
          typeId: p.type,
          date: block.date,
          meeting: meeting,
          weekStart: week.weekStart,
          excludeIds: Object.keys(placedThisMeeting),
          maxPerWeek: maxWeek,
          pending: state.placed,
          pendingMonth: state.monthly[period] || {}
        };
        if (field === 'assistantId') {
          var a = assistantContext(p, week, meeting);
          ctx.qual = a.qual; ctx.pool = a.pool; ctx.gender = a.gender;
        } else {
          ctx.qual = t.qual; ctx.pool = t.pool;
        }

        var cands = Sch.candidates(ctx).filter(function (c) {
          if (c.blocked) return false;
          if (state.placed[c.person.id + '|' + meeting + '|' + week.weekStart]) return false;
          if (p.type === 'chairman' && state.chaired && state.chaired[c.person.id + '|' + week.weekStart]) return false;
          var carriedThisWeek = Store.assignmentCountInWeek(c.person.id, week.weekStart)
            + (state.placed[c.person.id + '|week|' + week.weekStart] || 0);
          return carriedThisWeek < maxWeek;
        });
        if (field === 'assistantId') {
          var ac = assistantContext(p, week, meeting);
          cands = householdBoost(cands, ac.household);
        }

        if (!cands.length) {
          skipped.push({
            partId: p.id, title: p.title, field: field,
            why: 'No one both qualified and available'
          });
          return;
        }

        var chosen = cands[0].person;
        plan.push({ partId: p.id, field: field, personId: chosen.id, meeting: meeting, title: p.title });
        placedThisMeeting[chosen.id] = true;
        state.placed[chosen.id] = (state.placed[chosen.id] || 0) + 1;
        state.placed[chosen.id + '|' + meeting + '|' + week.weekStart] = true;
        state.placed[chosen.id + '|week|' + week.weekStart] =
          (state.placed[chosen.id + '|week|' + week.weekStart] || 0) + 1;
        state.monthly[period] = state.monthly[period] || {};
        state.monthly[period][chosen.id] = (state.monthly[period][chosen.id] || 0) + 1;
        if (p.type === 'chairman' && field === 'assigneeId') {
          chairmanId = chosen.id;
          state.chaired = state.chaired || {};
          state.chaired[chosen.id + '|' + week.weekStart] = true;
        }
      });
    });

    return { plan: plan, skipped: skipped, state: state };
  };

  /* Fill several weeks in one pass, keeping the rotation level across all of them. */
  Sch.planRange = function (weeks, opts) {
    opts = opts || {};
    var state = { placed: {}, monthly: {}, chaired: {} };
    var plan = [], skipped = [];
    weeks.forEach(function (w) {
      var r = Sch.planWeek(w, Object.assign({}, opts, { state: state }));
      r.plan.forEach(function (item) { item.weekId = w.id; item.weekStart = w.weekStart; plan.push(item); });
      r.skipped.forEach(function (s) { s.weekStart = w.weekStart; skipped.push(s); });
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

  Sch.applyRangePlan = function (weeks, plan) {
    Store.update({
      action: 'schedule.autofill.range',
      summary: U.plural(plan.length, 'assignment') + ' filled across ' + U.plural(weeks.length, 'week')
    }, function () {
      plan.forEach(function (item) {
        var week = weeks.filter(function (w) { return w.id === item.weekId; })[0];
        if (!week) return;
        var p = U.by(week.midweek.parts.concat(week.weekend.parts), item.partId);
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
          var chairsOwn = id === chairmanId && field === 'assigneeId'
            && (p.type === 'chairman' || CHAIR_PARTS.indexOf(p.type) !== -1);
          if (seen[id] && !chairsOwn) {
            out.push({ partId: p.id, field: field, personId: id, kind: 'double',
              message: Store.name(id) + ' has two parts on ' + U.fmtDate(block.date, 'day') });
          }
          seen[id] = true;

          var person = Store.person(id);
          if (person) {
            var why = Sch.unavailableReason(person, block.date, meeting, {});
            if (why) {
              out.push({ partId: p.id, field: field, personId: id, kind: 'available',
                message: Store.name(id) + ' — ' + why.toLowerCase() + ' on ' + U.fmtDate(block.date, 'day') });
            }
          }

          var t = S.partType(p.type);
          var qual = field === 'assistantId' ? (t.assistantQual || 'assistant') : t.qual;
          if (person && qual && (person.qualifications || []).indexOf(qual) === -1) {
            out.push({ partId: p.id, field: field, personId: id, kind: 'qual',
              message: Store.name(id) + ' is not marked for “'
                + (S.QUALIFICATIONS.filter(function (q) { return q.id === qual; })[0] || {}).name + '”' });
          }

          // a demonstration partner of the other sex is nearly always a mistake
          if (field === 'assistantId' && !t.assistantQual && p.assigneeId) {
            var main = Store.person(p.assigneeId);
            if (main && person && main.gender !== person.gender && Store.cong().pairSameGender !== false) {
              out.push({ partId: p.id, field: field, personId: id, kind: 'pairing',
                message: Store.name(id) + ' and ' + Store.name(main.id) + ' are not the same sex for a demonstration' });
            }
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

  /* Round-robin over the qualified pool, skipping anyone away, unavailable, over
     their own monthly limit, or already carrying a part that night. */
  Sch.planDuties = function (weeks, dutyTypeIds, opts) {
    opts = opts || {};
    var cong = Store.cong();
    var plan = [];
    var cursor = {};
    var placed = {};        // personId -> placed by this plan
    var monthly = {};

    dutyTypeIds.forEach(function (dtId) {
      var dt = S.dutyType(dtId, cong);
      var pool;
      if (dt.group) {
        pool = Store.groups().map(function (g) { return { id: g.id, group: true, name: g.name }; });
      } else {
        pool = Store.activePeople().filter(function (p) {
          if (dt.qual && (p.qualifications || []).indexOf(dt.qual) === -1) return false;
          return S.availabilityOf(p).duties;
        });
      }
      if (!pool.length) return;
      cursor[dtId] = cursor[dtId] || 0;

      weeks.forEach(function (week) {
        ['midweek', 'weekend'].forEach(function (meeting) {
          if (opts.meetings && opts.meetings.indexOf(meeting) === -1) return;
          var block = week[meeting];
          if (block.cancelled) return;
          if (Store.duties().some(function (d) { return d.date === block.date && d.type === dtId; })) return;

          var period = U.period(block.date);
          var candidates = pool;
          if (!dt.group) {
            // fairest first, same idea as the meeting parts
            candidates = U.sortBy(pool, function (p) {
              return Sch.carriedBy(p.id, placed[p.id] || 0) * 1e6
                + (Store.lastAssignedAt(p.id, null) ? U.diffDays('1970-01-01', Store.lastAssignedAt(p.id, null)) : 0);
            });
          }

          var pick = null;
          for (var i = 0; i < candidates.length; i++) {
            var cand = dt.group
              ? candidates[(cursor[dtId] + i) % candidates.length]
              : candidates[i];
            if (cand.group) { pick = cand; cursor[dtId] += 1; break; }
            if (!Sch.isAvailable(cand, block.date, meeting, {
              duty: true, pendingInMonth: (monthly[period] || {})[cand.id] || 0
            })) continue;
            var busy = block.parts.some(function (p) {
              return p.assigneeId === cand.id || p.assistantId === cand.id;
            });
            if (busy && !opts.allowBusy) continue;
            // not more than the week's ceiling, counting the parts already scheduled
            var inWeek = Store.assignmentCountInWeek(cand.id, week.weekStart)
              + plan.filter(function (x) { return x.personId === cand.id && U.weekStart(x.date) === week.weekStart; }).length;
            if (inWeek >= (opts.maxPerWeek || 2)) continue;
            if (plan.some(function (x) { return x.date === block.date && x.personId === cand.id; })) continue;
            pick = cand;
            break;
          }
          if (!pick) return;
          plan.push({
            date: block.date, meeting: meeting, type: dtId,
            personId: pick.group ? null : pick.id,
            groupId: pick.group ? pick.id : null
          });
          if (!pick.group) {
            placed[pick.id] = (placed[pick.id] || 0) + 1;
            monthly[period] = monthly[period] || {};
            monthly[period][pick.id] = (monthly[period][pick.id] || 0) + 1;
          }
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

  /* ---------- who is being used, and who is not ---------- */

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

  /* A row per publisher: what they carry, when they were last used, what is
     coming, and whether anything at all is open to them. */
  /* opts.from / opts.to are week starts; the window may run into the future,
     which is how you check the schedule you have just made rather than the one
     you already worked. */
  Sch.fairness = function (opts) {
    opts = opts || {};
    var from = opts.from || windowStart();
    var to = opts.to || U.weekStart(U.today());
    var future = U.weekStart(U.today());
    var people = Store.activePeople();

    var rows = people.map(function (p) {
      var past = Store.assignmentCountBetween(p.id, from, to);
      var upcoming = Store.assignmentsFor(p.id, { from: future });
      var lastAny = Store.lastAssignedAt(p.id, null);
      var av = S.availabilityOf(p);

      // what could this person ever be given, as things stand?
      var openTo = [];
      Object.keys(S.PART_TYPES).forEach(function (typeId) {
        if (Sch.eligible(typeId).some(function (x) { return x.id === p.id; })) {
          openTo.push(S.partType(typeId).name);
        }
      });
      // assisting on a demonstration counts — it is how most sisters are used
      var quals = p.qualifications || [];
      if (quals.indexOf('assistant') !== -1) openTo.push('Assistant on a demonstration');
      if (quals.indexOf('cbs_reader') !== -1) openTo.push('Congregation Bible Study reader');
      if (quals.indexOf('wt_reader') !== -1) openTo.push('Watchtower Study reader');
      S.dutyTypesFor(Store.cong()).forEach(function (dt) {
        if (dt.group) return;
        if (!dt.qual || quals.indexOf(dt.qual) !== -1) openTo.push(dt.name);
      });

      return {
        person: p,
        past: past,
        upcoming: upcoming.length,
        nextDate: upcoming.length ? upcoming[0].date : null,
        lastAt: lastAny,
        monthsQuiet: lastAny ? Math.floor(Math.abs(U.diffDays(lastAny, U.today())) / 30) : null,
        openTo: openTo,
        availability: av
      };
    });

    var used = rows.filter(function (r) { return r.past > 0; });
    var total = U.sum(rows, function (r) { return r.past; });
    var eligibleCount = rows.filter(function (r) { return r.openTo.length; }).length;
    var fairShare = eligibleCount ? total / eligibleCount : 0;

    return {
      rows: U.sortBy(rows, function (r) { return r.past * 1000 - (r.openTo.length ? 0 : 1); }),
      total: total,
      fairShare: fairShare,
      from: from,
      to: to,
      windowWeeks: Math.max(1, Math.round(U.diffDays(from, to) / 7) + 1),
      neverUsed: rows.filter(function (r) { return !r.lastAt && r.openTo.length; }),
      notUsedInWindow: rows.filter(function (r) { return r.past === 0 && r.openTo.length; }),
      nothingOpen: rows.filter(function (r) { return !r.openTo.length; }),
      overFairShare: rows.filter(function (r) { return fairShare && r.past > fairShare * 1.75; })
    };
  };

  /* Where the rotation is thin: a part or duty only a handful of people are
     marked for. This is the usual reason one brother carries far more than the
     rest, and it is something only the elders can fix — by marking more people. */
  Sch.thinPools = function (threshold) {
    var limit = threshold || 4;
    var out = [];

    Object.keys(S.PART_TYPES).forEach(function (typeId) {
      var t = S.partType(typeId);
      var people = Sch.eligible(typeId);
      var willing = people.filter(function (p) {
        var av = S.availabilityOf(p);
        return av.midweek || av.weekend;
      });
      if (willing.length < limit) {
        out.push({
          kind: 'part', id: typeId, name: t.name,
          count: willing.length, people: willing,
          qual: t.qual
        });
      }
    });

    S.dutyTypesFor(Store.cong()).forEach(function (dt) {
      if (dt.group) return;
      var people = Store.activePeople().filter(function (p) {
        if (dt.qual && (p.qualifications || []).indexOf(dt.qual) === -1) return false;
        return S.availabilityOf(p).duties;
      });
      if (people.length < limit) {
        out.push({ kind: 'duty', id: dt.id, name: dt.name, count: people.length, people: people, qual: dt.qual });
      }
    });

    return U.sortBy(out, function (r) { return r.count; });
  };

  global.Scheduler = Sch;
})(typeof window !== 'undefined' ? window : globalThis);
