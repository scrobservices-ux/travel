/* Congregation files — letters from the branch, forms, cleaning schedules, maps.
   Uploaded into the same database as everything else, so in shared mode they
   reach everyone who is allowed to see them. PDFs open in the browser's own
   viewer, which is also how you print them. */
(function (global) {
  'use strict';

  var U = global.U, Store = global.Store, Auth = global.Auth, UI = global.UI, App = global.App;
  var el = U.el;
  var Views = global.Views = global.Views || {};

  var MAX_BYTES = 8 * 1024 * 1024;
  var AUDIENCES = [
    { id: 'all', name: 'Whole congregation' },
    { id: 'servants', name: 'Elders and ministerial servants' },
    { id: 'elders', name: 'Body of elders only' }
  ];

  var filter = { q: '', audience: '' };

  function visible(doc) {
    if (doc.audience === 'elders') return Auth.can('shepherding.view');
    if (doc.audience === 'servants') return Auth.can('tasks.view');
    return true;
  }

  function docs() {
    var cid = Store.congId();
    return (Store.state.documents || []).filter(function (d) { return d.congId === cid; });
  }

  function human(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function iconFor(mime) {
    if (/pdf/.test(mime)) return 'report';
    if (/image/.test(mime)) return 'map';
    if (/sheet|excel|csv/.test(mime)) return 'chart';
    return 'book';
  }

  /* data: URLs are what we store; a blob URL is what the browser opens */
  function toBlob(doc) {
    var parts = String(doc.data || '').split(',');
    var binary = atob(parts[1] || '');
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: doc.mime || 'application/octet-stream' });
  }

  function open(doc) {
    var url = URL.createObjectURL(toBlob(doc));
    var w = global.open(url, '_blank');
    if (!w) UI.flag('The browser blocked the new tab', 'Allow pop-ups for this site, or use Download.', 'danger');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function download(doc) {
    var url = URL.createObjectURL(toBlob(doc));
    var a = el('a', { href: url, download: doc.name });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function upload(files, audience, done) {
    var list = Array.prototype.slice.call(files);
    var tooBig = list.filter(function (f) { return f.size > MAX_BYTES; });
    if (tooBig.length) {
      UI.flag('Too large', tooBig.map(function (f) { return f.name; }).join(', ')
        + ' — the limit is ' + human(MAX_BYTES) + ' per file.', 'danger');
      list = list.filter(function (f) { return f.size <= MAX_BYTES; });
    }
    if (!list.length) return;

    var pending = list.length, records = [];
    list.forEach(function (f) {
      var fr = new FileReader();
      fr.onload = function () {
        records.push({
          id: U.uid('doc'), congId: Store.congId(), name: f.name,
          mime: f.type || 'application/octet-stream', size: f.size,
          data: String(fr.result), audience: audience || 'all', notes: '',
          uploadedBy: Auth.me().id, uploadedAt: Date.now()
        });
        if (--pending === 0) finish();
      };
      fr.onerror = function () {
        UI.flag('Could not read ' + f.name, String(fr.error), 'danger');
        if (--pending === 0) finish();
      };
      fr.readAsDataURL(f);
    });

    function finish() {
      if (!records.length) return;
      Store.update({ action: 'file.uploaded', summary: records.map(function (r) { return r.name; }).join(', ') },
        function (st) {
          st.documents = st.documents || [];
          records.forEach(function (r) { st.documents.push(r); });
        });
      UI.flag('Uploaded', U.plural(records.length, 'file') + ' added.', 'success');
      if (done) done();
    }
  }

  Views.files = {
    title: 'congregation files',
    render: function (root) {
      var canManage = Auth.can('files.manage');
      var all = docs().filter(visible);
      var totalBytes = U.sum(docs(), function (d) { return d.size || 0; });

      var audienceChoice = { value: 'all' };
      var fileInput = el('input', { type: 'file', multiple: true, style: 'display:none' });
      fileInput.addEventListener('change', function (e) {
        upload(e.target.files, audienceChoice.value, function () { fileInput.value = ''; });
      });

      root.appendChild(UI.pageHead({
        crumbs: [{ label: Store.cong().name }, { label: 'Files' }],
        title: 'Congregation files',
        sub: 'Letters, forms, maps and anything else the congregation keeps. PDFs open in the browser, where you can print them or save them again.',
        actions: canManage ? [
          UI.btn('Upload files', { variant: 'primary', icon: 'upload', onClick: function () { fileInput.click(); } })
        ] : []
      }));
      root.appendChild(fileInput);

      if (canManage) {
        var drop = el('div.empty', {
          style: 'padding:28px;margin-bottom:20px;cursor:pointer',
          ondragover: function (e) { e.preventDefault(); drop.style.borderColor = 'var(--B400)'; },
          ondragleave: function () { drop.style.borderColor = ''; },
          ondrop: function (e) {
            e.preventDefault();
            drop.style.borderColor = '';
            upload(e.dataTransfer.files, audienceChoice.value);
          },
          onclick: function (e) { if (!e.target.closest('select')) fileInput.click(); }
        }, [
          el('h3', { text: 'Drop files here, or click to choose' }),
          el('p', { text: 'PDF, images, spreadsheets, documents — up to ' + human(MAX_BYTES) + ' each.' }),
          el('div.row', { style: 'justify-content:center;margin-top:12px' }, [
            el('span.small.muted', { text: 'Who can see what you upload:' }),
            UI.select(AUDIENCES, 'all', function (v) { audienceChoice.value = v; })
          ])
        ]);
        root.appendChild(drop);
      }

      var bar = el('div.row', { style: 'margin-bottom:16px' }, [
        UI.search('Search files', function (v) { filter.q = v; App.render(); }, filter.q),
        UI.select([{ id: '', name: 'Everyone’s' }].concat(AUDIENCES), filter.audience, function (v) {
          filter.audience = v; App.render();
        })
      ]);
      bar.querySelector('select').style.maxWidth = '240px';
      root.appendChild(bar);

      var rows = all.filter(function (d) {
        if (filter.q && !U.matches(d.name + ' ' + d.notes, filter.q)) return false;
        if (filter.audience && d.audience !== filter.audience) return false;
        return true;
      });

      if (!docs().length) {
        root.appendChild(UI.empty('No files yet',
          canManage ? 'Upload the letters and forms the congregation keeps, and they are here for whoever needs them.'
            : 'Nothing has been shared with you yet.'));
      } else {
        root.appendChild(UI.table([
          { key: 'name', label: 'File', sort: function (d) { return d.name.toLowerCase(); },
            render: function (d) {
              return el('div.row', [
                U.icon(iconFor(d.mime), 18),
                el('div', [
                  el('div', { text: d.name }),
                  d.notes ? el('div.small.muted', { text: d.notes }) : null
                ])
              ]);
            } },
          { key: 'audience', label: 'Visible to', render: function (d) {
            var a = AUDIENCES.filter(function (x) { return x.id === d.audience; })[0];
            return UI.lozenge(a ? a.name : d.audience, d.audience === 'elders' ? 'removed' : d.audience === 'servants' ? 'warn' : '');
          } },
          { key: 'size', label: 'Size', num: true, sort: function (d) { return d.size; },
            render: function (d) { return human(d.size || 0); } },
          { key: 'by', label: 'Added by', render: function (d) {
            return el('div', [
              UI.person(d.uploadedBy),
              el('div.small.muted', { text: U.relative(d.uploadedAt) })
            ]);
          } },
          { key: 'actions', label: '', render: function (d) {
            return el('div.row', [
              UI.btn('Open', { sm: true, onClick: function () { open(d); } }),
              UI.btn('Download', { sm: true, variant: 'subtle', onClick: function () { download(d); } }),
              canManage ? UI.btn('', { sm: true, variant: 'subtle', icon: 'edit', title: 'Rename or change who sees it',
                onClick: function () { edit(d); } }) : null,
              canManage ? UI.btn('', { sm: true, variant: 'subtle', icon: 'trash', title: 'Delete',
                onClick: function () {
                  UI.confirm({ title: 'Delete ' + d.name + '?', danger: true, confirmLabel: 'Delete' }, function () {
                    Store.update({ action: 'file.deleted', summary: d.name }, function (st) {
                      st.documents = st.documents.filter(function (x) { return x.id !== d.id; });
                    });
                  });
                } }) : null
            ]);
          } }
        ], rows, { sortKey: 'name', empty: 'No files match.' }));
      }

      root.appendChild(el('p.small.muted', { style: 'margin-top:12px',
        text: U.plural(docs().length, 'file') + ' · ' + human(totalBytes) + ' stored'
          + (global.Sync.mode === 'server' ? ' on your server.' : ' in this browser.')
          + ' Files are part of the backup, so keep an eye on the total.' }));
    },
    upload: upload
  };

  function edit(doc) {
    var name = UI.input({ value: doc.name });
    var notes = UI.input({ value: doc.notes, placeholder: 'What is it for?' });
    var audience = { value: doc.audience };
    UI.modal({
      title: 'File details',
      body: [
        UI.field('Name', name),
        UI.field('Note', notes),
        UI.field('Visible to', UI.select(AUDIENCES, doc.audience, function (v) { audience.value = v; }))
      ],
      actions: [{ label: 'Save', variant: 'primary', onClick: function () {
        Store.update({ action: 'file.updated', summary: name.value }, function () {
          doc.name = name.value.trim() || doc.name;
          doc.notes = notes.value.trim();
          doc.audience = audience.value;
        });
      } }]
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
