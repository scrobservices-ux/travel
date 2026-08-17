/* Congregation accounts: receipts, expenses and the monthly report that is read
   to the congregation. */
(function (global) {
  'use strict';

  var U = global.U, S = global.Schema, Store = global.Store, Auth = global.Auth,
    UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var state = { period: null };
  function period() { return state.period || U.period(U.today()); }

  function money(n) { return U.money(n, Store.cong().currency); }

  function entry(txn) {
    var isNew = !txn;
    var draft = txn ? U.clone(txn) : {
      kind: 'income', category: S.ACCOUNT_CATEGORIES.income[0],
      amount: 0, date: U.today(), note: ''
    };
    var catField = UI.field('Category', UI.select(S.ACCOUNT_CATEGORIES[draft.kind], draft.category, function (v) { draft.category = v; }));

    UI.modal({
      title: isNew ? 'Add an entry' : 'Edit entry',
      body: [
        UI.field('Type', UI.select([{ id: 'income', name: 'Receipt' }, { id: 'expense', name: 'Expense' }], draft.kind, function (v) {
          draft.kind = v;
          draft.category = S.ACCOUNT_CATEGORIES[v][0];
          var fresh = UI.select(S.ACCOUNT_CATEGORIES[v], draft.category, function (c) { draft.category = c; });
          U.clear(catField).appendChild(el('label', { text: 'Category' }));
          catField.appendChild(fresh);
        })),
        catField,
        el('div.grid.c2', [
          UI.field('Amount', UI.input({ type: 'number', step: '0.01', min: 0, value: draft.amount,
            onInput: function (e) { draft.amount = +e.target.value || 0; } })),
          UI.field('Date', UI.input({ type: 'date', value: draft.date, onInput: function (e) { draft.date = e.target.value; } }))
        ]),
        UI.field('Note', UI.input({ value: draft.note, onInput: function (e) { draft.note = e.target.value; } }))
      ],
      actions: [
        !isNew ? { label: 'Delete', variant: 'danger', onClick: function () {
          Store.update({ action: 'accounts.deleted', summary: money(txn.amount) + ' ' + txn.category }, function (st) {
            st.transactions = st.transactions.filter(function (t) { return t.id !== txn.id; });
          });
        } } : null,
        { label: 'Save', variant: 'primary', onClick: function () {
          if (!draft.amount) { UI.flag('Enter an amount', null, 'danger'); return false; }
          draft.period = U.period(draft.date);
          Store.update({ action: isNew ? 'accounts.added' : 'accounts.updated', summary: draft.category + ' ' + money(draft.amount) },
            function (st) {
              if (isNew) {
                draft.id = U.uid('txn'); draft.congId = Store.congId(); st.transactions.push(draft);
              } else Object.keys(draft).forEach(function (k) { txn[k] = draft[k]; });
            });
        } }
      ].filter(Boolean)
    });
  }

  Views.accounts = {
    title: 'the congregation accounts',
    perm: 'accounts.view',
    render: function (root) {
      var per = period();
      var sum = Store.accountsSummary(per);
      var canEdit = Auth.can('accounts.edit');

      root.appendChild(UI.pageHead({
        crumbs: [{ label: Store.cong().name }, { label: 'Accounts' }],
        title: 'Accounts',
        sub: 'Receipts, expenses and the monthly report read to the congregation.',
        actions: [
          UI.dateNav(U.periodLabel(per),
            function () { state.period = U.prevPeriod(per); App.render(); },
            function () { state.period = U.nextPeriod(per); App.render(); },
            function () { state.period = U.period(U.today()); App.render(); }),
          canEdit ? UI.btn('Add entry', { variant: 'primary', icon: 'plus', onClick: function () { entry(null); } }) : null,
          UI.btn('Export CSV', { variant: 'subtle', icon: 'download', onClick: exportCsv })
        ].filter(Boolean)
      }));

      root.appendChild(el('div.grid.c4', [
        UI.stat('Opening balance', money(sum.opening), 'Brought forward'),
        UI.stat('Receipts', money(sum.income), U.plural(sum.rows.filter(function (r) { return r.kind === 'income'; }).length, 'entry', 'entries')),
        UI.stat('Expenses', money(sum.expense), U.plural(sum.rows.filter(function (r) { return r.kind === 'expense'; }).length, 'entry', 'entries')),
        UI.stat('Closing balance', money(sum.closing), sum.closing >= sum.opening ? 'Up on the month' : 'Down on the month',
          sum.closing >= sum.opening ? 'up' : 'down')
      ]));

      root.appendChild(UI.sectionTitle('Entries for ' + U.periodLabel(per)));
      root.appendChild(UI.table([
        { key: 'date', label: 'Date', sort: function (t) { return t.date; }, render: function (t) { return U.fmtDate(t.date); } },
        { key: 'kind', label: 'Type', render: function (t) {
          return UI.lozenge(t.kind === 'income' ? 'Receipt' : 'Expense', t.kind === 'income' ? 'success' : 'removed');
        } },
        { key: 'category', label: 'Category', sort: function (t) { return t.category; } },
        { key: 'note', label: 'Note' },
        { key: 'amount', label: 'Amount', num: true, sort: function (t) { return t.amount; },
          render: function (t) { return money(t.amount); } },
        { key: 'actions', label: '', render: function (t) {
          if (!canEdit) return el('span');
          return UI.btn('Edit', { sm: true, variant: 'subtle', onClick: function () { entry(t); } });
        } }
      ], sum.rows, { sortKey: 'date', empty: 'Nothing recorded this month.' }));

      /* monthly report */
      root.appendChild(UI.sectionTitle('Monthly accounts report'));
      root.appendChild(UI.card(null, [
        el('pre', { style: 'white-space:pre-wrap;font-family:var(--font);margin:0', text: reportText(per, sum) }),
        el('div', { style: 'margin-top:16px' }, UI.copyBtn(function () { return reportText(per, sum); }, 'Copy the report'))
      ]));

      /* by category */
      root.appendChild(UI.sectionTitle('Twelve-month view'));
      var hist = [];
      var p = per;
      for (var i = 0; i < 12; i++) { hist.unshift(Store.accountsSummary(p)); p = U.prevPeriod(p); }
      var max = Math.max.apply(null, hist.map(function (h) { return Math.max(h.income, h.expense); }).concat([1]));
      root.appendChild(UI.card(null, el('div.stack', hist.map(function (h) {
        return el('div.row', [
          el('span.small', { style: 'width:120px', text: U.periodLabel(h.period) }),
          el('span', { style: 'flex:1' }, UI.meter(h.income / max, 'good')),
          el('span.small.muted', { style: 'width:90px;text-align:right', text: money(h.income) }),
          el('span', { style: 'flex:1' }, UI.meter(h.expense / max, 'bad')),
          el('span.small.muted', { style: 'width:90px;text-align:right', text: money(h.expense) })
        ]);
      }))));
      root.appendChild(el('p.small.muted', { style: 'margin-top:8px', text: 'Green: receipts · red: expenses.' }));
    }
  };

  function reportText(per, sum) {
    var cong = Store.cong();
    var lines = [
      cong.name + ' — accounts report for ' + U.periodLabel(per),
      '',
      'Opening balance: ' + money(sum.opening)
    ];
    S.ACCOUNT_CATEGORIES.income.forEach(function (c) {
      var v = U.sum(sum.rows.filter(function (r) { return r.kind === 'income' && r.category === c; }), function (r) { return r.amount; });
      if (v) lines.push('  Receipts — ' + c + ': ' + money(v));
    });
    lines.push('Total receipts: ' + money(sum.income));
    S.ACCOUNT_CATEGORIES.expense.forEach(function (c) {
      var v = U.sum(sum.rows.filter(function (r) { return r.kind === 'expense' && r.category === c; }), function (r) { return r.amount; });
      if (v) lines.push('  Expenses — ' + c + ': ' + money(v));
    });
    lines.push('Total expenses: ' + money(sum.expense));
    lines.push('Closing balance: ' + money(sum.closing));
    return lines.join('\n');
  }

  function exportCsv() {
    var rows = [['Date', 'Period', 'Type', 'Category', 'Amount', 'Note']];
    U.sortBy(Store.transactions(), function (t) { return t.date; }).forEach(function (t) {
      rows.push([t.date, t.period, t.kind, t.category, t.amount, t.note || '']);
    });
    U.download('accounts-' + U.today() + '.csv', U.csv(rows), 'text/csv');
  }
})(typeof window !== 'undefined' ? window : globalThis);
