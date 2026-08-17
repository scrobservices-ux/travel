/* Component kit: page furniture, tables, lozenges, modals, flags, pickers.
   Everything returns a DOM node so views stay declarative. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store;
  var el = U.el;
  var UI = {};

  /* ---------- page furniture ---------- */

  UI.pageHead = function (opts) {
    var head = el('div');
    if (opts.crumbs && opts.crumbs.length) {
      var bc = el('nav.breadcrumbs', { 'aria-label': 'Breadcrumbs' });
      opts.crumbs.forEach(function (c, i) {
        if (i) bc.appendChild(U.icon('chevronRight', 12));
        bc.appendChild(c.href
          ? el('a', { href: c.href, text: c.label })
          : el('span', { text: c.label }));
      });
      head.appendChild(bc);
    }
    var row = el('div.page-head', [
      el('div', [
        el('h1.page-title', { text: opts.title }),
        opts.sub ? el('div.page-sub', { text: opts.sub }) : null
      ]),
      opts.actions && opts.actions.length ? el('div.page-actions', opts.actions) : null
    ]);
    head.appendChild(row);
    return head;
  };

  UI.sectionTitle = function (text, right) {
    if (!right) return el('h2.section-title', { text: text });
    return el('div.row', { style: 'margin:24px 0 12px' }, [
      el('h2.section-title', { style: 'margin:0', text: text }),
      el('div.right', right)
    ]);
  };

  /* ---------- primitives ---------- */

  UI.btn = function (label, opts) {
    opts = opts || {};
    var cls = '.btn' + (opts.variant ? '.' + opts.variant : '') + (opts.sm ? '.sm' : '');
    var b = el('button' + cls, {
      type: 'button',
      title: opts.title || null,
      disabled: !!opts.disabled,
      'aria-pressed': opts.pressed == null ? null : String(!!opts.pressed),
      onclick: opts.onClick || null
    });
    if (opts.icon) b.appendChild(U.icon(opts.icon, opts.sm ? 14 : 16));
    if (label) b.appendChild(document.createTextNode(label));
    return b;
  };

  UI.lozenge = function (text, tone) {
    return el('span.lozenge' + (tone ? '.' + tone : ''), { text: text });
  };

  UI.statusLozenge = function (list, id) {
    var s = list.filter(function (x) { return x.id === id; })[0];
    return UI.lozenge(s ? s.name : id, s ? s.tone : '');
  };

  UI.tag = function (text) { return el('span.tag', { text: text }); };

  UI.avatar = function (personOrName, size) {
    var name = typeof personOrName === 'string' ? personOrName
      : (personOrName ? personOrName.firstName + ' ' + personOrName.lastName : '?');
    var key = typeof personOrName === 'string' ? personOrName : (personOrName && personOrName.id) || name;
    return el('span.avatar' + (size ? '.' + size : ''), {
      style: 'background:' + U.colorFor(key),
      title: name,
      text: U.initials(name)
    });
  };

  UI.person = function (personId, opts) {
    opts = opts || {};
    var p = Store.person(personId);
    if (!p) return el('span.muted', { text: opts.empty || '—' });
    return el('span.person', [
      UI.avatar(p, opts.size || 'sm'),
      el('span', [
        el('span.person-name', { text: Store.name(p.id) }),
        opts.sub ? el('span.person-sub', { text: opts.sub === true ? subFor(p) : opts.sub }) : null
      ])
    ]);
  };

  function subFor(p) {
    var bits = [];
    if (p.appointment === 'elder') bits.push('Elder');
    else if (p.appointment === 'servant') bits.push('Ministerial servant');
    var t = S.PUBLISHER_TYPES.filter(function (x) { return x.id === p.publisherType; })[0];
    if (t && p.publisherType !== 'publisher') bits.push(t.name);
    var g = Store.group(p.serviceGroupId);
    if (g) bits.push(g.name.split('—')[0].trim());
    return bits.join(' · ');
  }
  UI.personSub = subFor;

  UI.avatarGroup = function (ids, max) {
    var g = el('span.avatar-group');
    (ids || []).slice(0, max || 4).forEach(function (id) {
      var p = Store.person(id);
      if (p) g.appendChild(UI.avatar(p, 'sm'));
    });
    if ((ids || []).length > (max || 4)) {
      g.appendChild(el('span.avatar.sm.ghost', { text: '+' + (ids.length - (max || 4)) }));
    }
    return g;
  };

  UI.card = function (title, children, opts) {
    opts = opts || {};
    var c = el('div.card' + (opts.flat ? '.flat' : ''));
    if (title) {
      c.appendChild(el('div.card-head', [
        opts.icon ? U.icon(opts.icon, 18) : null,
        el('span.card-title', { text: title }),
        opts.action ? el('span.right', opts.action) : null
      ]));
    }
    U.append(c, children);
    return c;
  };

  UI.stat = function (label, value, foot, tone) {
    return el('div.stat', [
      el('div.stat-label', { text: label }),
      el('div.stat-value', { text: String(value) }),
      foot ? el('div.stat-foot' + (tone ? '.' + tone : ''), { text: foot }) : null
    ]);
  };

  UI.meter = function (fraction, tone) {
    var pct = Math.max(0, Math.min(1, fraction || 0)) * 100;
    return el('div.meter' + (tone ? '.' + tone : ''), [el('i', { style: 'width:' + pct.toFixed(1) + '%' })]);
  };

  UI.banner = function (tone, title, body, action) {
    return el('div.banner' + (tone ? '.' + tone : ''), [
      U.icon(tone === 'danger' || tone === 'warn' ? 'warn' : 'info', 18),
      el('div', [
        title ? el('span.b-title', { text: title }) : null,
        body ? el('span', { text: body }) : null
      ]),
      action ? el('span.right', action) : null
    ]);
  };

  UI.empty = function (title, body, action) {
    return el('div.empty', [
      el('h3', { text: title }),
      body ? el('p', { text: body }) : null,
      action ? el('div', { style: 'margin-top:16px' }, action) : null
    ]);
  };

  UI.divider = function () { return el('div.divider'); };

  UI.kv = function (pairs) {
    var dl = el('dl.kv');
    pairs.forEach(function (p) {
      if (!p) return;
      dl.appendChild(el('dt', { text: p[0] }));
      dl.appendChild(el('dd', typeof p[1] === 'string' || typeof p[1] === 'number'
        ? String(p[1]) : (p[1] || el('span.muted', { text: '—' }))));
    });
    return dl;
  };

  /* ---------- tabs ---------- */

  UI.tabs = function (items, activeId, onChange) {
    var bar = el('div.tabs', { role: 'tablist' });
    items.forEach(function (it) {
      bar.appendChild(el('button.tab', {
        role: 'tab', type: 'button',
        'aria-selected': String(it.id === activeId),
        text: it.label,
        onclick: function () { onChange(it.id); }
      }));
    });
    return bar;
  };

  UI.pillToggle = function (items, activeId, onChange) {
    var w = el('div.pill-toggle');
    items.forEach(function (it) {
      w.appendChild(el('button', {
        type: 'button', 'aria-pressed': String(it.id === activeId), text: it.label,
        onclick: function () { onChange(it.id); }
      }));
    });
    return w;
  };

  UI.btnGroup = function (items, activeId, onChange) {
    var w = el('div.btn-group');
    items.forEach(function (it) {
      w.appendChild(UI.btn(it.label, {
        pressed: it.id === activeId,
        onClick: function () { onChange(it.id); }
      }));
    });
    return w;
  };

  /* ---------- form fields ---------- */

  UI.field = function (label, control, hint) {
    return el('div.field', [
      label ? el('label', { text: label, for: control && control.id ? control.id : null }) : null,
      control,
      hint ? el('div.hint', { text: hint }) : null
    ]);
  };

  UI.input = function (opts) {
    opts = opts || {};
    return el('input', {
      type: opts.type || 'text',
      id: opts.id || null,
      value: opts.value == null ? '' : opts.value,
      placeholder: opts.placeholder || null,
      min: opts.min == null ? null : opts.min,
      max: opts.max == null ? null : opts.max,
      step: opts.step || null,
      disabled: !!opts.disabled,
      oninput: opts.onInput || null,
      onchange: opts.onChange || null
    });
  };

  UI.textarea = function (opts) {
    opts = opts || {};
    var t = el('textarea', {
      placeholder: opts.placeholder || null,
      rows: opts.rows || null,
      disabled: !!opts.disabled,
      oninput: opts.onInput || null,
      onchange: opts.onChange || null
    });
    t.value = opts.value || '';
    return t;
  };

  UI.select = function (options, value, onChange, opts) {
    opts = opts || {};
    var s = el('select', { disabled: !!opts.disabled, onchange: function (e) { onChange(e.target.value); } });
    if (opts.placeholder) s.appendChild(el('option', { value: '', text: opts.placeholder }));
    options.forEach(function (o) {
      var v = typeof o === 'string' ? o : o.id;
      var l = typeof o === 'string' ? o : o.name;
      s.appendChild(el('option', { value: v, text: l, selected: String(v) === String(value) }));
    });
    s.value = value == null ? '' : String(value);
    return s;
  };

  UI.checkbox = function (label, checked, onChange, hint) {
    return el('label.checkline', [
      el('input', { type: 'checkbox', checked: !!checked, onchange: function (e) { onChange(e.target.checked); } }),
      el('span', [el('span', { text: label }), hint ? el('div.hint', { text: hint }) : null])
    ]);
  };

  UI.search = function (placeholder, onInput, value) {
    var input = UI.input({ type: 'search', placeholder: placeholder || 'Search', value: value || '' });
    input.addEventListener('input', U.debounce(function (e) { onInput(e.target.value); }, 160));
    return el('div', { style: 'max-width:280px;flex:1 1 200px' }, input);
  };

  /* ---------- table ---------- */

  /* columns: [{key,label,render(row),num,width,sort(row)}] */
  UI.table = function (columns, rows, opts) {
    opts = opts || {};
    var state = { key: opts.sortKey || null, dir: opts.sortDir || 'asc' };

    var wrap = el('div.table-wrap');
    var table = el('table.tbl');
    var thead = el('thead');
    var tr = el('tr');
    columns.forEach(function (c) {
      var sortable = !!c.sort;
      var th = el('th' + (c.num ? '.num' : '') + (sortable ? '.sortable' : ''), {
        style: [c.width ? 'width:' + c.width : null, c.minWidth ? 'min-width:' + c.minWidth : null]
          .filter(Boolean).join(';') || null,
        onclick: sortable ? function () {
          if (state.key === c.key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
          else { state.key = c.key; state.dir = 'asc'; }
          draw();
        } : null
      });
      th.appendChild(document.createTextNode(c.label));
      if (sortable && state.key === c.key) {
        th.appendChild(document.createTextNode(state.dir === 'asc' ? ' ▲' : ' ▼'));
      }
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    var tbody = el('tbody');
    table.appendChild(thead); table.appendChild(tbody);
    wrap.appendChild(table);

    function draw() {
      U.clear(tbody);
      var data = rows.slice();
      if (state.key) {
        var col = columns.filter(function (c) { return c.key === state.key; })[0];
        if (col && col.sort) data = U.sortBy(data, col.sort, state.dir);
      }
      if (!data.length) {
        tbody.appendChild(el('tr', [el('td', { colspan: columns.length },
          el('div.muted', { style: 'padding:24px;text-align:center', text: opts.empty || 'Nothing here yet.' }))]));
        return;
      }
      data.forEach(function (row) {
        var rtr = el('tr', {
          onclick: opts.onRow ? function (e) {
            if (e.target.closest('button,a,input,select')) return;
            opts.onRow(row);
          } : null,
          style: opts.onRow ? 'cursor:pointer' : null
        });
        columns.forEach(function (c) {
          var cell = c.render ? c.render(row) : row[c.key];
          rtr.appendChild(el('td' + (c.num ? '.num' : '') + (c.key === 'actions' ? '.actions' : ''),
            cell instanceof Node ? cell : (cell == null ? '—' : String(cell))));
        });
        tbody.appendChild(rtr);
      });
      // header sort arrows
      U.$$('th', thead).forEach(function (th, i) {
        var c = columns[i];
        if (!c.sort) return;
        th.textContent = c.label + (state.key === c.key ? (state.dir === 'asc' ? ' ▲' : ' ▼') : '');
      });
    }
    draw();
    return wrap;
  };

  /* ---------- modal ---------- */

  var openModals = [];

  UI.modal = function (opts) {
    var scrim = U.$('#scrim');
    var node = el('div.modal' + (opts.wide ? '.wide' : ''), {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog'
    });
    node.appendChild(el('h2', { text: opts.title || '' }));
    if (opts.sub) node.appendChild(el('div.modal-sub', { text: opts.sub }));
    var body = el('div.modal-body');
    U.append(body, opts.body);
    node.appendChild(body);

    function close() {
      node.remove();
      openModals = openModals.filter(function (m) { return m !== node; });
      if (!openModals.length) scrim.hidden = true;
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    var foot = el('div.modal-foot');
    (opts.actions || []).forEach(function (a) {
      foot.appendChild(UI.btn(a.label, {
        variant: a.variant,
        disabled: a.disabled,
        onClick: function () {
          if (a.onClick) { if (a.onClick(close) === false) return; }
          if (a.keepOpen) return;
          close();
        }
      }));
    });
    if (!opts.hideClose) {
      foot.insertBefore(UI.btn(opts.closeLabel || 'Cancel', { variant: 'subtle', onClick: close }), foot.firstChild);
    }
    if (foot.childNodes.length) node.appendChild(foot);

    scrim.hidden = false;
    scrim.onclick = function () { if (openModals.length) openModals[openModals.length - 1].__close(); };
    node.__close = close;
    openModals.push(node);
    U.$('#modal-root').appendChild(node);
    document.addEventListener('keydown', onKey);
    var focusable = node.querySelector('input,select,textarea,button');
    if (focusable) setTimeout(function () { focusable.focus(); }, 30);
    return close;
  };

  UI.confirm = function (opts, onYes) {
    UI.modal({
      title: opts.title || 'Are you sure?',
      sub: opts.body,
      body: opts.node || null,
      actions: [{
        label: opts.confirmLabel || 'Confirm',
        variant: opts.danger ? 'danger' : 'primary',
        onClick: function () { onYes(); }
      }]
    });
  };

  UI.prompt = function (opts, onDone) {
    var input = opts.multiline
      ? UI.textarea({ value: opts.value || '', placeholder: opts.placeholder })
      : UI.input({ value: opts.value || '', placeholder: opts.placeholder });
    UI.modal({
      title: opts.title,
      sub: opts.sub,
      body: UI.field(opts.label, input, opts.hint),
      actions: [{
        label: opts.confirmLabel || 'Save', variant: 'primary',
        onClick: function () { onDone(input.value); }
      }]
    });
  };

  /* ---------- flags (toasts) ---------- */

  UI.flag = function (title, body, tone) {
    var root = U.$('#flag-root');
    var node = el('div.flag', [
      U.icon(tone === 'success' ? 'check' : tone === 'danger' ? 'warn' : 'info', 18),
      el('div', [
        el('div.f-title', { text: title }),
        body ? el('div.f-body', { text: body }) : null
      ])
    ]);
    root.appendChild(node);
    setTimeout(function () {
      node.style.transition = 'opacity .2s';
      node.style.opacity = '0';
      setTimeout(function () { node.remove(); }, 220);
    }, tone === 'danger' ? 6000 : 3600);
  };

  /* ---------- person picker with eligibility reasons ---------- */

  /* candidates: [{person, score, reasons:[], blocked:bool, note}] */
  /* opts.candidates      ranked candidates, blocked ones included
     opts.onPick(id)      chosen, or null to clear
     opts.onEveryone(fn)  called when "anyone in the congregation" is ticked; should
                          return a fresh candidate list including unqualified people */
  UI.personPicker = function (opts) {
    var listWrap = el('div.picker-list');
    var searchInput = UI.input({ type: 'search', placeholder: 'Filter by name…' });
    var showRuledOut = { value: false };
    var everyone = { value: false };
    var candidates = opts.candidates;

    function draw() {
      U.clear(listWrap);
      var q = searchInput.value;
      var rows = candidates.filter(function (c) {
        if (!showRuledOut.value && c.blocked) return false;
        return U.matches(Store.name(c.person.id), q);
      });
      if (!rows.length) {
        listWrap.appendChild(el('div.muted', { style: 'padding:16px',
          text: everyone.value ? 'No one matches.'
            : 'Nobody is both marked for this and free. Tick “anyone in the congregation” to choose regardless.' }));
        return;
      }
      rows.forEach(function (c) {
        listWrap.appendChild(el('button.picker-item' + (c.blocked || c.notMarked ? '.blocked' : ''), {
          type: 'button',
          onclick: function () { close(); opts.onPick(c.person.id, c); }
        }, [
          UI.avatar(c.person),
          el('span', { style: 'flex:1;min-width:0' }, [
            el('div', [
              document.createTextNode(Store.name(c.person.id)),
              c.notMarked ? el('span', { style: 'margin-left:6px' }, UI.lozenge('Not marked', 'warn')) : null
            ]),
            el('div.person-sub', { text: c.note || UI.personSub(c.person) })
          ]),
          el('span.why', { text: (c.reasons || []).join(' · ') })
        ]));
      });
    }

    searchInput.addEventListener('input', draw);

    var controls = el('div', [
      UI.checkbox('Show people the scheduler ruled out', false, function (v) {
        showRuledOut.value = v; draw();
      }, 'Away, or already busy that night. You can still choose them.')
    ]);
    if (opts.onEveryone) {
      controls.appendChild(UI.checkbox('Choose anyone in the congregation', false, function (v) {
        everyone.value = v;
        candidates = v ? opts.onEveryone() : opts.candidates;
        if (v) showRuledOut.value = true;
        draw();
      }, 'Ignores who is marked for this part — for when you know best.'));
    }

    var close = UI.modal({
      title: opts.title || 'Assign',
      sub: opts.sub,
      body: [
        searchInput,
        controls,
        listWrap,
        opts.allowClear ? el('div', { style: 'margin-top:12px' },
          UI.btn('Clear this assignment', {
            variant: 'subtle', icon: 'close',
            onClick: function () { close(); opts.onPick(null); }
          })) : null
      ],
      hideClose: false,
      closeLabel: 'Close'
    });
    draw();
    return close;
  };

  /* ---------- misc ---------- */

  UI.dateNav = function (label, onPrev, onNext, onToday) {
    return el('div.row', [
      UI.btn('', { icon: 'chevronLeft', variant: 'subtle', onClick: onPrev, title: 'Previous' }),
      el('strong', { style: 'min-width:190px;text-align:center', text: label }),
      UI.btn('', { icon: 'chevronRight', variant: 'subtle', onClick: onNext, title: 'Next' }),
      onToday ? UI.btn('Today', { variant: 'subtle', sm: true, onClick: onToday }) : null
    ]);
  };

  UI.copyBtn = function (getText, label) {
    return UI.btn(label || 'Copy', {
      icon: 'copy', variant: 'subtle',
      onClick: function () {
        U.copy(getText(), function (ok) {
          UI.flag(ok ? 'Copied to the clipboard' : 'Could not copy', ok ? null : 'Select the text and copy manually.', ok ? 'success' : 'danger');
        });
      }
    });
  };

  UI.noAccess = function (what) {
    return UI.empty('Not available to your role',
      'Your assignments in this congregation do not include ' + (what || 'this area') + '. Speak to the coordinator if that looks wrong.');
  };

  global.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
