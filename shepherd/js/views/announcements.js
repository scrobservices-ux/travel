/* Announcements: what is read to the congregation and posted on the board. */
(function (global) {
  'use strict';

  var U = global.U, Store = global.Store, Auth = global.Auth, UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var AUDIENCES = [
    { id: 'all', name: 'Whole congregation' },
    { id: 'elders', name: 'Body of elders' },
    { id: 'servants', name: 'Elders and ministerial servants' },
    { id: 'pioneers', name: 'Pioneers' }
  ];

  function visible(a) {
    if (a.audience === 'all') return true;
    if (a.audience === 'elders') return Auth.can('shepherding.view');
    if (a.audience === 'servants') return Auth.can('tasks.view');
    if (a.audience === 'pioneers') {
      var me = Auth.me();
      return Auth.can('publishers.view') || ['regular', 'auxiliary', 'special'].indexOf(me.publisherType) !== -1;
    }
    return true;
  }

  function compose(existing) {
    var draft = existing ? U.clone(existing) : { title: '', body: '', audience: 'all', pinned: false };
    UI.modal({
      wide: true,
      title: existing ? 'Edit announcement' : 'New announcement',
      body: [
        UI.field('Title', UI.input({ value: draft.title, onInput: function (e) { draft.title = e.target.value; } })),
        UI.field('Announcement', UI.textarea({ rows: 6, value: draft.body, onInput: function (e) { draft.body = e.target.value; } })),
        UI.field('Who sees it', UI.select(AUDIENCES, draft.audience, function (v) { draft.audience = v; })),
        UI.checkbox('Pin to the top', draft.pinned, function (v) { draft.pinned = v; })
      ],
      actions: [
        existing ? { label: 'Delete', variant: 'danger', onClick: function () {
          Store.update({ action: 'announcement.deleted', summary: existing.title }, function (st) {
            st.announcements = st.announcements.filter(function (a) { return a.id !== existing.id; });
          });
        } } : null,
        { label: existing ? 'Save' : 'Publish', variant: 'primary', onClick: function () {
          if (!draft.title.trim()) { UI.flag('A title is needed', null, 'danger'); return false; }
          Store.update({ action: existing ? 'announcement.updated' : 'announcement.published', summary: draft.title },
            function (st) {
              if (existing) { Object.keys(draft).forEach(function (k) { existing[k] = draft[k]; }); return; }
              st.announcements.push(Object.assign({
                id: U.uid('ann'), congId: Store.congId(), authorId: Auth.me().id, publishedAt: Date.now()
              }, draft));
            });
          UI.flag(existing ? 'Saved' : 'Published', draft.title, 'success');
        } }
      ].filter(Boolean)
    });
  }

  Views.announcements = {
    title: 'announcements',
    render: function (root) {
      var canPublish = Auth.can('announce.publish');
      var list = U.sortBy(Store.announcements().filter(visible), function (a) {
        return (a.pinned ? '1' : '0') + a.publishedAt;
      }, 'desc');

      root.appendChild(UI.pageHead({
        crumbs: [{ label: Store.cong().name }, { label: 'Announcements' }],
        title: 'Announcements',
        sub: 'What is read to the congregation and posted on the information board.',
        actions: [canPublish ? UI.btn('New announcement', { variant: 'primary', icon: 'plus', onClick: function () { compose(null); } }) : null].filter(Boolean)
      }));

      if (!list.length) {
        root.appendChild(UI.empty('Nothing posted', 'Announcements appear here for everyone who should see them.'));
        return;
      }

      root.appendChild(el('div.stack', list.map(function (a) {
        return UI.card(null, [
          el('div.row', [
            a.pinned ? UI.lozenge('Pinned', 'inprogress') : null,
            a.audience !== 'all' ? UI.lozenge((AUDIENCES.filter(function (x) { return x.id === a.audience; })[0] || {}).name, 'moved') : null,
            el('h3', { style: 'font-size:16px;font-weight:600;flex:1', text: a.title }),
            canPublish ? UI.btn('Edit', { sm: true, variant: 'subtle', icon: 'edit', onClick: function () { compose(a); } }) : null
          ]),
          el('p', { style: 'margin-top:8px;white-space:pre-wrap', text: a.body }),
          el('div.small.muted', { style: 'margin-top:12px',
            text: Store.name(a.authorId) + ' · ' + U.fmtDateTime(a.publishedAt) })
        ]);
      })));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
