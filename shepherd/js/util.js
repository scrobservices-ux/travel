/* Small DOM / date / string helpers. No framework, no build step. */
(function (global) {
  'use strict';

  var U = {};

  /* ---------- DOM ---------- */

  // el('div.card#id', {attrs}, [children | 'text'])
  U.el = function (spec, attrs, children) {
    var m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec || 'div');
    var tag = (m && m[1]) || 'div';
    var node = document.createElement(tag);
    if (m && m[2]) {
      m[2].split(/(?=[.#])/).forEach(function (t) {
        if (t[0] === '#') node.id = t.slice(1);
        else if (t[0] === '.') node.classList.add(t.slice(1));
      });
    }
    if (attrs && (typeof attrs !== 'object' || Array.isArray(attrs) || attrs instanceof Node)) {
      children = attrs; attrs = null;
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'value') node.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') node[k] = !!v;
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    U.append(node, children);
    return node;
  };

  U.append = function (node, children) {
    if (children == null || children === false) return node;
    if (Array.isArray(children)) {
      children.forEach(function (c) { U.append(node, c); });
      return node;
    }
    node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
    return node;
  };

  U.clear = function (node) { while (node.firstChild) node.removeChild(node.firstChild); return node; };
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- icons (Atlassian-ish 24px line set) ---------- */
  var PATHS = {
    dashboard: 'M4 13h6V4H4v9zm0 7h6v-5H4v5zm9 0h7v-9h-7v9zm0-16v5h7V4h-7z',
    calendar: 'M7 3v2m10-2v2M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
    board: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
    duty: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z',
    people: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm7 0a3 3 0 100-6 3 3 0 000 6zM2 20c0-3.3 3-5.5 7-5.5s7 2.2 7 5.5M17 15c3 .4 5 2.3 5 5',
    report: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
    map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
    heart: 'M12 20s-7-4.4-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.6-7 9-7 9z',
    check: 'M5 12l5 5L19 7',
    chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
    cash: 'M3 7h18v10H3zM12 15a3 3 0 100-6 3 3 0 000 6z',
    megaphone: 'M4 10v4h3l7 4V6l-7 4H4zm13-1a4 4 0 010 6',
    cog: 'M12 15a3 3 0 100-6 3 3 0 000 6zM4 12l-1.5-1 1.2-2.5L5.6 9M20 12l1.5-1-1.2-2.5L18.4 9M12 4V2m0 20v-2',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-8 8c0-3.9 3.6-6 8-6s8 2.1 8 6',
    plus: 'M12 5v14M5 12h14',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14zm5.5-1.5L21 21',
    chevronDown: 'M6 9l6 6 6-6',
    chevronRight: 'M9 6l6 6-6 6',
    chevronLeft: 'M15 6l-6 6 6 6',
    close: 'M6 6l12 12M18 6L6 18',
    edit: 'M4 20h4L20 8l-4-4L4 16v4z',
    trash: 'M5 7h14M9 7V5h6v2m-8 0l1 13h8l1-13',
    download: 'M12 4v11m-5-4l5 5 5-5M4 20h16',
    upload: 'M12 20V9m-5 4l5-5 5 5M4 4h16',
    print: 'M7 8V4h10v4M7 18H5a1 1 0 01-1-1v-5a1 1 0 011-1h14a1 1 0 011 1v5a1 1 0 01-1 1h-2M7 14h10v6H7z',
    bell: 'M12 4a5 5 0 00-5 5v4l-2 3h14l-2-3V9a5 5 0 00-5-5zm-2 15a2 2 0 004 0',
    moon: 'M20 14a8 8 0 01-10-10 8 8 0 108.5 12.5A8 8 0 0120 14z',
    sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19',
    book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM19 17H6',
    clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-14v5l3 2',
    warn: 'M12 4l9 16H3l9-16zm0 6v4m0 3v.5',
    info: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-13v.5m0 3.5v5',
    lock: 'M6 11h12v9H6zM9 11V8a3 3 0 016 0v3',
    building: 'M4 21V6l7-3v18M11 21h9V10l-9-3M7 9v.5M7 13v.5M15 12v.5M15 16v.5',
    shield: 'M12 3l8 3v6c0 5-3.5 8.2-8 9.5C7.5 20.2 4 17 4 12V6l8-3zm-3 9l2 2 4-4',
    logout: 'M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 8l-4 4 4 4M6 12h10',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z',
    drag: 'M9 6h.5M9 12h.5M9 18h.5M15 6h.5M15 12h.5M15 18h.5',
    filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5z',
    copy: 'M9 9h10v11H9zM5 15V4h10v2'
  };

  U.icon = function (name, size, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 20);
    svg.setAttribute('height', size || 20);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', PATHS[name] || PATHS.info);
    svg.appendChild(p);
    return svg;
  };
  U.hasIcon = function (n) { return !!PATHS[n]; };

  /* ---------- ids & objects ---------- */
  var seq = 0;
  U.uid = function (prefix) {
    seq += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + seq.toString(36);
  };
  U.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  U.by = function (list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
  U.groupBy = function (list, fn) {
    return list.reduce(function (acc, item) {
      var k = fn(item);
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {});
  };
  U.sum = function (list, fn) {
    return list.reduce(function (a, b) { return a + (fn ? fn(b) : b) || 0; }, 0);
  };
  U.sortBy = function (list, fn, dir) {
    var d = dir === 'desc' ? -1 : 1;
    return list.slice().sort(function (a, b) {
      var x = fn(a), y = fn(b);
      if (x == null) return 1;
      if (y == null) return -1;
      return x < y ? -d : x > y ? d : 0;
    });
  };
  U.unique = function (list) {
    return list.filter(function (v, i) { return list.indexOf(v) === i; });
  };

  /* ---------- dates ---------- */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  U.MONTHS = MONTHS; U.DAYS = DAYS;

  U.today = function () { return U.iso(new Date()); };
  U.iso = function (d) {
    var dt = (d instanceof Date) ? d : new Date(d);
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  U.pad = pad;

  U.parse = function (isoStr) {
    var p = String(isoStr).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2] || 1);
  };
  U.addDays = function (isoStr, n) {
    var d = U.parse(isoStr); d.setDate(d.getDate() + n); return U.iso(d);
  };
  U.addMonths = function (isoStr, n) {
    var d = U.parse(isoStr); d.setMonth(d.getMonth() + n); return U.iso(d);
  };
  U.diffDays = function (a, b) {
    return Math.round((U.parse(b) - U.parse(a)) / 86400000);
  };
  // Monday of the week containing isoStr
  U.weekStart = function (isoStr) {
    var d = U.parse(isoStr || U.today());
    var dow = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - dow);
    return U.iso(d);
  };
  U.dow = function (isoStr) { return U.parse(isoStr).getDay(); };
  // next date on weekday `target` (0=Sun) on/after the given week start
  U.dayInWeek = function (weekStartIso, targetDow) {
    var offset = (targetDow + 6) % 7; // Monday-based index
    return U.addDays(weekStartIso, offset);
  };
  U.fmtDate = function (isoStr, style) {
    if (!isoStr) return '—';
    var d = U.parse(isoStr);
    if (style === 'long') return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    if (style === 'day') return DAYS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3);
    if (style === 'month') return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
  };
  U.fmtWeek = function (weekStartIso) {
    var a = U.parse(weekStartIso), b = U.parse(U.addDays(weekStartIso, 6));
    if (a.getMonth() === b.getMonth()) {
      return MONTHS[a.getMonth()] + ' ' + a.getDate() + '-' + b.getDate();
    }
    return MONTHS[a.getMonth()] + ' ' + a.getDate() + '–' + MONTHS[b.getMonth()] + ' ' + b.getDate();
  };
  U.fmtDateTime = function (ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return U.fmtDate(U.iso(d)) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  U.relative = function (ts) {
    if (!ts) return 'never';
    var s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    if (s < 604800) return Math.round(s / 86400) + 'd ago';
    return U.fmtDate(U.iso(new Date(ts)));
  };
  // service-year period key, e.g. '2026-07'
  U.period = function (isoStr) { return String(isoStr || U.today()).slice(0, 7); };
  U.periodLabel = function (p) {
    var parts = String(p).split('-');
    return MONTHS[(+parts[1] || 1) - 1] + ' ' + parts[0];
  };
  U.prevPeriod = function (p) { return U.period(U.addMonths(p + '-01', -1)); };
  U.nextPeriod = function (p) { return U.period(U.addMonths(p + '-01', 1)); };
  // Service year runs September → August
  U.serviceYear = function (p) {
    var y = +String(p).slice(0, 4), m = +String(p).slice(5, 7);
    return m >= 9 ? y + 1 : y;
  };
  U.serviceYearPeriods = function (sy) {
    var out = [], p = (sy - 1) + '-09';
    for (var i = 0; i < 12; i++) { out.push(p); p = U.nextPeriod(p); }
    return out;
  };

  /* ---------- strings ---------- */
  U.initials = function (name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  };
  U.titleCase = function (s) {
    return String(s || '').toLowerCase().replace(/(^|[\s-])(\w)/g, function (_, a, b) { return a + b.toUpperCase(); });
  };
  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  };
  U.plural = function (n, one, many) {
    return n + ' ' + (n === 1 ? one : (many || one + 's'));
  };
  // deterministic colour for an avatar, from the Atlassian accent set
  var AV = ['#0052CC', '#00875A', '#5243AA', '#DE350B', '#00A3BF', '#FF8B00', '#403294', '#006644'];
  U.colorFor = function (key) {
    var h = 0, s = String(key || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AV[h % AV.length];
  };
  U.money = function (n, cur) {
    var v = Math.round((+n || 0) * 100) / 100;
    return (cur || '') + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  U.hhmm = function (t) { return t || '—'; };

  /* ---------- files ---------- */
  U.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = U.el('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };
  U.csv = function (rows) {
    return rows.map(function (r) {
      return r.map(function (c) {
        var s = c == null ? '' : String(c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
  };
  /* Parse CSV, semicolon-CSV or tab-separated text (what you get when you copy
     straight out of a spreadsheet). Returns {header:[], rows:[[]], delimiter}. */
  U.parseDelimited = function (text) {
    var clean = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
    if (!clean) return { header: [], rows: [], delimiter: ',' };
    var firstLine = clean.split('\n')[0];
    var counts = { '\t': (firstLine.match(/\t/g) || []).length,
      ';': (firstLine.match(/;/g) || []).length,
      ',': (firstLine.match(/,/g) || []).length };
    var delimiter = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    if (!counts[delimiter]) delimiter = ',';

    var rows = [], row = [], cell = '', quoted = false;
    for (var i = 0; i < clean.length; i++) {
      var ch = clean[i];
      if (quoted) {
        if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delimiter) { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell.trim());
    rows.push(row);
    rows = rows.filter(function (r) { return r.some(function (c) { return c !== ''; }); });
    var header = rows.shift() || [];
    var width = header.length;
    rows = rows.map(function (r) {
      while (r.length < width) r.push('');
      return r.slice(0, width);
    });
    return { header: header, rows: rows, delimiter: delimiter };
  };

  /* "yes"/"y"/"true"/"1"/"x" → true */
  U.truthy = function (v) {
    return /^(y|yes|true|1|x|✓|shared)$/i.test(String(v || '').trim());
  };

  /* Accepts 2026-07, 07/2026, "July 2026", 2026-07-15 → "2026-07" */
  U.toPeriod = function (v) {
    var s = String(v || '').trim();
    var m = /^(\d{4})[-/](\d{1,2})/.exec(s);
    if (m) return m[1] + '-' + pad(+m[2]);
    m = /^(\d{1,2})[-/](\d{4})$/.exec(s);
    if (m) return m[2] + '-' + pad(+m[1]);
    m = /^([a-z]+)\.?\s+(\d{4})$/i.exec(s);
    if (m) {
      var want = m[1].toLowerCase();
      for (var i = 0; i < MONTHS.length; i++) {
        if (MONTHS[i].toLowerCase().indexOf(want) === 0) return m[2] + '-' + pad(i + 1);
      }
    }
    return null;
  };

  /* Accepts 2026-07-15, 15/07/2026, 07/15/2026 (when unambiguous) → ISO */
  U.toDate = function (v) {
    var s = String(v || '').trim();
    if (!s) return null;
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m) {
      var a = +m[1], b = +m[2];
      if (a > 12 && b <= 12) return m[3] + '-' + pad(b) + '-' + pad(a);   // d/m/y
      if (b > 12 && a <= 12) return m[3] + '-' + pad(a) + '-' + pad(b);   // m/d/y
      return m[3] + '-' + pad(b) + '-' + pad(a);                          // assume d/m/y
    }
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : U.iso(d);
  };

  U.readFile = function (file, cb) {
    var fr = new FileReader();
    fr.onload = function () { cb(null, String(fr.result)); };
    fr.onerror = function () { cb(fr.error); };
    fr.readAsText(file);
  };
  U.copy = function (text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done && done(true); },
        function () { done && done(false); });
    } else {
      var ta = U.el('textarea', { value: text, style: 'position:fixed;opacity:0' });
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      done && done(ok);
    }
  };

  /* ---------- misc ---------- */
  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  };
  U.matches = function (haystack, needle) {
    if (!needle) return true;
    return String(haystack || '').toLowerCase().indexOf(String(needle).toLowerCase()) !== -1;
  };

  global.U = U;
})(typeof window !== 'undefined' ? window : globalThis);
