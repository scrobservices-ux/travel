/* Meeting programs.
 *
 * IMPORTANT — where the program comes from.
 * The published meeting workbook and Watchtower study material are copyrighted by
 * their publisher, and their terms of use do not allow a third-party service to
 * scrape or redistribute them. So this app never fetches that content on its own.
 * Instead it gives a congregation four legitimate ways to get the week on screen:
 *
 *   1. Standard skeleton   — every week is generated with the normal part structure,
 *                            so assignments can be scheduled with no import at all.
 *   2. Paste               — an elder copies the week from the material the
 *                            congregation already has and pastes it in; parsed here.
 *   3. File import         — JSON or CSV produced by whatever tool the congregation
 *                            already uses.
 *   4. Configured feed     — an admin points the app at an endpoint their
 *                            congregation is licensed to read (self-hosted or a
 *                            provider they have rights to). Off by default.
 */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema;
  var P = {};

  /* ---------- skeletons ---------- */

  function part(section, type, title, minutes, no) {
    return {
      id: U.uid('part'),
      section: section,
      type: type,
      no: no || null,
      title: title,
      minutes: minutes || null,
      source: '',
      assigneeId: null,
      assistantId: null,
      status: 'unassigned',
      notes: '',
      locked: false
    };
  }
  P.part = part;

  P.midweekSkeleton = function () {
    return [
      part('opening', 'chairman', 'Chairman', null),
      part('opening', 'opening_song', 'Song and opening prayer', 5),
      part('opening', 'opening_words', 'Opening comments', 1),
      part('treasures', 'treasures', 'Treasures talk', 10, 1),
      part('treasures', 'gems', 'Spiritual gems', 10, 2),
      part('treasures', 'bible_reading', 'Bible reading', 4, 3),
      part('ministry', 'student', 'Starting a conversation', 3, 4),
      part('ministry', 'student', 'Following up', 4, 5),
      part('ministry', 'student_talk', 'Talk', 5, 6),
      part('living', 'living', 'Living as Christians part', 15, 7),
      part('living', 'cbs', 'Congregation Bible Study', 30, 8),
      part('closing', 'concluding', 'Concluding comments', 3),
      part('closing', 'closing_song', 'Song and closing prayer', 5)
    ];
  };

  P.weekendSkeleton = function () {
    return [
      part('weekend', 'chairman', 'Chairman', null),
      part('weekend', 'opening_song', 'Song and opening prayer', 5),
      part('weekend', 'public_talk', 'Public talk', 30),
      part('weekend', 'wt_study', 'Watchtower Study', 60),
      part('weekend', 'closing_song', 'Song and closing prayer', 5)
    ];
  };

  P.buildWeek = function (cong, weekStartIso) {
    return {
      id: 'week_' + cong.id + '_' + weekStartIso,
      congId: cong.id,
      weekStart: weekStartIso,
      label: U.fmtWeek(weekStartIso),
      bibleReading: '',
      theme: '',
      songs: {},
      midweek: {
        date: U.dayInWeek(weekStartIso, cong.meetings.midweek.dow),
        time: cong.meetings.midweek.time,
        cancelled: false,
        note: '',
        parts: P.midweekSkeleton()
      },
      weekend: {
        date: U.dayInWeek(weekStartIso, cong.meetings.weekend.dow),
        time: cong.meetings.weekend.time,
        cancelled: false,
        note: '',
        publicTalkNumber: '',
        visitingSpeaker: '',
        speakerCongregation: '',
        parts: P.weekendSkeleton()
      },
      source: 'skeleton',
      importedAt: null
    };
  };

  /* ---------- parsing pasted program text ---------- */

  var MONTH_RE = '(january|february|march|april|may|june|july|august|september|october|november|december)';

  function monthIndex(name) {
    return U.MONTHS.map(function (m) { return m.toLowerCase(); }).indexOf(String(name).toLowerCase());
  }

  // "JANUARY 5-11" / "December 29–January 4" / "5-11 JANUARY 2026"
  P.parseWeekHeader = function (line, defaultYear) {
    var s = line.trim().replace(/[–—]/g, '-');
    var m = new RegExp('^' + MONTH_RE + '\\s+(\\d{1,2})\\s*-\\s*(?:' + MONTH_RE + '\\s+)?(\\d{1,2})(?:,?\\s*(\\d{4}))?$', 'i').exec(s);
    if (m) {
      var year = +(m[5] || defaultYear || new Date().getFullYear());
      return U.iso(new Date(year, monthIndex(m[1]), +m[2]));
    }
    m = new RegExp('^(\\d{1,2})\\s*-\\s*(\\d{1,2})\\s+' + MONTH_RE + '(?:\\s+(\\d{4}))?$', 'i').exec(s);
    if (m) {
      var y2 = +(m[4] || defaultYear || new Date().getFullYear());
      return U.iso(new Date(y2, monthIndex(m[3]), +m[1]));
    }
    m = /^(\d{4}-\d{2}-\d{2})$/.exec(s);
    if (m) return U.weekStart(m[1]);
    return null;
  };

  function sectionOf(line) {
    var s = line.toLowerCase();
    if (/treasures\s+from/.test(s)) return 'treasures';
    if (/apply\s+yourself|field\s+ministry/.test(s)) return 'ministry';
    if (/living\s+as\s+christians/.test(s)) return 'living';
    return null;
  }

  P.inferType = function (title, section) {
    var s = String(title).toLowerCase();
    if (/^song\b/.test(s) && /prayer/.test(s)) return null;   // handled separately
    if (/opening comments/.test(s)) return 'opening_words';
    if (/concluding comments/.test(s)) return 'concluding';
    if (/spiritual gems/.test(s)) return 'gems';
    if (/bible reading/.test(s)) return 'bible_reading';
    if (/congregation bible study/.test(s)) return 'cbs';
    if (/public talk/.test(s)) return 'public_talk';
    if (/watchtower study/.test(s)) return 'wt_study';
    if (section === 'treasures') return 'treasures';
    if (section === 'ministry') return /\btalk\b/.test(s) ? 'student_talk' : 'student';
    if (section === 'living') return 'living';
    return 'living';
  };

  /* Returns [{weekStart, midweekParts, weekendParts, songs, bibleReading, theme}] */
  P.parseText = function (text, opts) {
    opts = opts || {};
    var lines = String(text || '').split(/\r?\n/);
    var out = [], cur = null, section = 'opening', order = 0;

    function startWeek(ws) {
      cur = {
        weekStart: ws, bibleReading: '', theme: '', songs: {},
        midweekParts: [], weekendParts: [], publicTalkNumber: ''
      };
      out.push(cur);
      section = 'opening';
      order = 0;
    }

    lines.forEach(function (raw) {
      var line = raw.replace(/\s+/g, ' ').trim();
      if (!line) return;

      var ws = P.parseWeekHeader(line, opts.year);
      if (ws) { startWeek(ws); return; }
      if (!cur) startWeek(U.weekStart(opts.startWeek || U.today()));

      var sec = sectionOf(line);
      if (sec) { section = sec; return; }

      // Bible reading reference line, e.g. "PROVERBS 21-22" or "Bible reading: Prov. 21"
      var br = /^(?:bible reading[:\s]+)?((?:[1-3]\s)?[a-z]+\.?\s+\d+(?:\s*-\s*\d+)?)$/i.exec(line);
      if (br && !cur.bibleReading && section === 'opening' && !/song/i.test(line)) {
        cur.bibleReading = U.titleCase(br[1]);
        return;
      }

      // Songs: "Song 45" / "Song 12 and Prayer"
      var songM = /^song\s+(\d{1,3})\b(.*)$/i.exec(line);
      if (songM) {
        var isClose = /closing|conclud/i.test(songM[2]) || cur.midweekParts.length > 6;
        cur.songs[isClose ? 'closing' : 'opening'] = +songM[1];
        return;
      }

      // Public talk / Watchtower study (weekend block)
      var pt = /^public talk[:\s]+(?:no\.?\s*(\d+)[:.\s-]*)?(.*)$/i.exec(line);
      if (pt) {
        var p1 = part('weekend', 'public_talk', (pt[2] || 'Public talk').trim(), 30);
        cur.publicTalkNumber = pt[1] || '';
        cur.weekendParts.push(p1);
        return;
      }
      var wt = /^watchtower study[:\s]+(.*)$/i.exec(line);
      if (wt) {
        cur.weekendParts.push(part('weekend', 'wt_study', wt[1].trim() || 'Watchtower Study', 60));
        return;
      }

      // Numbered / timed parts: "3. Bible Reading (4 min.) th study 2"
      var pm = /^(?:(\d{1,2})[.)]\s*)?(.+?)\s*\((\d{1,3})\s*min\.?\)\s*(.*)$/i.exec(line);
      if (pm) {
        order += 1;
        var title = pm[2].replace(/[:—-]\s*$/, '').trim();
        var type = P.inferType(title, section);
        if (!type) return;
        var pp = part(section === 'opening' && order > 1 ? 'treasures' : section, type, title, +pm[3], pm[1] ? +pm[1] : order);
        pp.source = (pm[4] || '').trim();
        cur.midweekParts.push(pp);
        return;
      }

      // Theme line for the weekend, if it looks like one
      if (/^theme[:\s]/i.test(line)) { cur.theme = line.replace(/^theme[:\s]+/i, ''); }
    });

    return out.filter(function (w) { return w.midweekParts.length || w.weekendParts.length; });
  };

  /* ---------- applying a parsed week onto a stored week ---------- */

  // Keeps existing assignees where the part type and position still match.
  P.applyParsed = function (week, parsed) {
    var keptMid = week.midweek.parts.slice();
    var keptWknd = week.weekend.parts.slice();

    function carry(newParts, oldParts) {
      var used = {};
      newParts.forEach(function (np) {
        for (var i = 0; i < oldParts.length; i++) {
          var op = oldParts[i];
          if (used[op.id]) continue;
          if (op.type !== np.type) continue;
          np.assigneeId = op.assigneeId;
          np.assistantId = op.assistantId;
          np.status = op.status;
          np.notes = op.notes;
          used[op.id] = true;
          break;
        }
      });
      return newParts;
    }

    if (parsed.midweekParts && parsed.midweekParts.length) {
      var mid = [];
      mid.push(part('opening', 'chairman', 'Chairman', null));
      mid.push(part('opening', 'opening_song', 'Song' + (parsed.songs.opening ? ' ' + parsed.songs.opening : '') + ' and opening prayer', 5));
      parsed.midweekParts.forEach(function (p) { mid.push(p); });
      if (!parsed.midweekParts.some(function (p) { return p.type === 'concluding'; })) {
        mid.push(part('closing', 'concluding', 'Concluding comments', 3));
      }
      mid.push(part('closing', 'closing_song', 'Song' + (parsed.songs.closing ? ' ' + parsed.songs.closing : '') + ' and closing prayer', 5));
      week.midweek.parts = carry(mid, keptMid);
    }

    if (parsed.weekendParts && parsed.weekendParts.length) {
      var wknd = [];
      wknd.push(part('weekend', 'chairman', 'Chairman', null));
      wknd.push(part('weekend', 'opening_song', 'Song and opening prayer', 5));
      parsed.weekendParts.forEach(function (p) { wknd.push(p); });
      wknd.push(part('weekend', 'closing_song', 'Song and closing prayer', 5));
      week.weekend.parts = carry(wknd, keptWknd);
      week.weekend.publicTalkNumber = parsed.publicTalkNumber || week.weekend.publicTalkNumber;
    }

    if (parsed.bibleReading) week.bibleReading = parsed.bibleReading;
    if (parsed.theme) week.theme = parsed.theme;
    week.songs = parsed.songs || week.songs;
    week.source = 'imported';
    week.importedAt = Date.now();
    return week;
  };

  /* ---------- JSON / CSV import ---------- */

  // Accepts either this app's export shape or a generic
  // [{week:"2026-01-05", parts:[{section,title,minutes,type,source}]}] feed.
  P.parseJSON = function (text) {
    var data = JSON.parse(text);
    var list = Array.isArray(data) ? data : (data.weeks || []);
    return list.map(function (w) {
      var ws = U.weekStart(w.week || w.weekStart || w.date);
      var mid = [], wknd = [];
      (w.parts || []).forEach(function (p) {
        var section = p.section || 'living';
        var type = p.type || P.inferType(p.title || '', section);
        var pp = part(section === 'weekend' ? 'weekend' : section, type, p.title || S.partType(type).name, p.minutes || null, p.no);
        pp.source = p.source || '';
        (section === 'weekend' ? wknd : mid).push(pp);
      });
      return {
        weekStart: ws, midweekParts: mid, weekendParts: wknd,
        songs: w.songs || {}, bibleReading: w.bibleReading || '', theme: w.theme || '',
        publicTalkNumber: w.publicTalkNumber || ''
      };
    });
  };

  // week,section,no,title,minutes,source
  P.parseCSV = function (text) {
    var rows = String(text).trim().split(/\r?\n/).map(function (r) {
      var out = [], cur = '', q = false;
      for (var i = 0; i < r.length; i++) {
        var c = r[i];
        if (q) {
          if (c === '"' && r[i + 1] === '"') { cur += '"'; i++; }
          else if (c === '"') q = false;
          else cur += c;
        } else if (c === '"') q = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
      out.push(cur);
      return out;
    });
    var head = rows.shift().map(function (h) { return h.trim().toLowerCase(); });
    var idx = function (n) { return head.indexOf(n); };
    var byWeek = {};
    rows.forEach(function (r) {
      if (!r[idx('week')]) return;
      var ws = U.weekStart(r[idx('week')].trim());
      var w = byWeek[ws] || (byWeek[ws] = { weekStart: ws, midweekParts: [], weekendParts: [], songs: {}, bibleReading: '', theme: '' });
      var section = (r[idx('section')] || 'living').trim().toLowerCase();
      var title = (r[idx('title')] || '').trim();
      var type = P.inferType(title, section);
      var pp = part(section, type, title, +r[idx('minutes')] || null, +r[idx('no')] || null);
      pp.source = idx('source') >= 0 ? (r[idx('source')] || '').trim() : '';
      (section === 'weekend' ? w.weekendParts : w.midweekParts).push(pp);
    });
    return Object.keys(byWeek).map(function (k) { return byWeek[k]; });
  };

  /* ---------- configured feed (opt-in) ---------- */

  P.fetchFeed = function (cong) {
    var src = cong.programSource || {};
    return new Promise(function (resolve, reject) {
      if (!src.endpoint) {
        reject(new Error('No program feed is configured for this congregation.'));
        return;
      }
      if (!src.acknowledged) {
        reject(new Error('The feed has not been acknowledged in Administration → Program source.'));
        return;
      }
      if (typeof fetch !== 'function') { reject(new Error('This browser cannot fetch a feed.')); return; }
      fetch(src.endpoint, { headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('Feed responded ' + r.status);
          return r.text();
        })
        .then(function (t) { resolve(P.parseJSON(t)); })
        .catch(reject);
    });
  };

  /* ---------- export ---------- */

  P.weekToText = function (week, cong, nameOf) {
    var lines = [];
    lines.push(cong.name + ' — week of ' + U.fmtWeek(week.weekStart));
    if (week.bibleReading) lines.push('Bible reading: ' + week.bibleReading);
    lines.push('');
    lines.push(cong.meetings.midweek.name.toUpperCase() + ' — ' + U.fmtDate(week.midweek.date, 'day') + ' ' + week.midweek.time);
    var lastSection = null;
    week.midweek.parts.forEach(function (p) {
      if (p.section !== lastSection) {
        lines.push('— ' + S.section(p.section).name + ' —');
        lastSection = p.section;
      }
      lines.push('  ' + partLine(p, nameOf));
    });
    lines.push('');
    lines.push(cong.meetings.weekend.name.toUpperCase() + ' — ' + U.fmtDate(week.weekend.date, 'day') + ' ' + week.weekend.time);
    week.weekend.parts.forEach(function (p) { lines.push('  ' + partLine(p, nameOf)); });
    return lines.join('\n');
  };

  function partLine(p, nameOf) {
    var who = p.assigneeId ? nameOf(p.assigneeId) : '(unassigned)';
    if (p.assistantId) who += ' / ' + nameOf(p.assistantId);
    return p.title + (p.minutes ? ' (' + p.minutes + ' min.)' : '') + ' — ' + who;
  }

  P.weekToJSON = function (week) {
    var parts = [];
    week.midweek.parts.forEach(function (p) {
      parts.push({ section: p.section, no: p.no, title: p.title, minutes: p.minutes, type: p.type, source: p.source });
    });
    week.weekend.parts.forEach(function (p) {
      parts.push({ section: 'weekend', no: p.no, title: p.title, minutes: p.minutes, type: p.type, source: p.source });
    });
    return { week: week.weekStart, bibleReading: week.bibleReading, theme: week.theme, songs: week.songs, parts: parts };
  };

  P.SAMPLE = [
    'NOVEMBER 3-9',
    'PROVERBS 30',
    'Song 88 and Prayer',
    'Opening Comments (1 min.)',
    "TREASURES FROM GOD'S WORD",
    '1. “Every Saying of God Is Refined” (10 min.)',
    '2. Spiritual Gems (10 min.)',
    '3. Bible Reading (4 min.) Prov. 30:1-14',
    'APPLY YOURSELF TO THE FIELD MINISTRY',
    '4. Starting a Conversation (3 min.) House to house.',
    '5. Following Up (4 min.) Informal witnessing.',
    '6. Talk (5 min.) Why we can trust the Bible.',
    'LIVING AS CHRISTIANS',
    'Song 101',
    '7. Local Needs (15 min.)',
    '8. Congregation Bible Study (30 min.)',
    'Concluding Comments (3 min.)',
    'Song 120 and Prayer',
    'Public Talk: No. 12 — Does God Really Care About Us?',
    'Watchtower Study: Keep Holding Men of That Sort Dear'
  ].join('\n');

  global.Program = P;
})(typeof window !== 'undefined' ? window : globalThis);
