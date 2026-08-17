/* Sync.
 *
 * Two ways to run, decided at start-up by asking for /api/health:
 *
 *   local mode   — the file was opened directly (file://) or no server answered.
 *                  Everything stays in this browser exactly as before.
 *   server mode  — a Shepherd server is behind the same address. Everyone signs
 *                  in with their own account and shares one database, while a
 *                  copy is still cached in the browser so the app keeps working
 *                  when the network drops. Changes made offline are queued and
 *                  pushed when it comes back.
 *
 * Records sync one at a time (collection + id), so two elders editing different
 * things at the same time never overwrite each other. */
(function (global) {
  'use strict';

  var U = global.U;
  var Sync = {
    mode: 'local',          // 'local' | 'server'
    status: 'local',        // 'local' | 'syncing' | 'synced' | 'offline' | 'error'
    user: null,             // {personId, name, roles, mustChangePassword}
    needsSetup: false,
    lastError: null,
    lastSyncAt: null,
    seq: -1,
    queue: [],
    origin: null,
    listeners: []
  };

  var POLL_MS = 5000;
  var QUEUE_KEY = 'shepherd.queue.v1';
  var pollTimer = null;
  var pushTimer = null;
  var pushing = false;
  var backoff = 0;

  /* ---------- plumbing ---------- */

  function api(method, endpoint, body) {
    return fetch(endpoint, {
      method: method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error((data && data.error) || ('Server responded ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }
  Sync.api = api;

  function emit() {
    Sync.listeners.forEach(function (fn) {
      try { fn(Sync); } catch (e) { console.error(e); }
    });
  }
  Sync.subscribe = function (fn) { Sync.listeners.push(fn); };

  function setStatus(status, error) {
    Sync.status = status;
    Sync.lastError = error || null;
    emit();
  }

  function loadQueue() {
    try { Sync.queue = JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; }
    catch (e) { Sync.queue = []; }
  }
  function saveQueue() {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(Sync.queue)); } catch (e) { /* full */ }
  }

  /* ---------- start-up ---------- */

  Sync.init = function (done) {
    Sync.origin = U.uid('client');
    if (location.protocol === 'file:') { finishLocal(done); return; }

    var timeout = setTimeout(function () { finishLocal(done); done = null; }, 4000);
    api('GET', 'api/health').then(function (health) {
      clearTimeout(timeout);
      if (!done) return;
      if (!health || health.server !== 'shepherd') { finishLocal(done); return; }
      Sync.mode = 'server';
      Sync.needsSetup = !!health.needsSetup;
      if (Sync.needsSetup) { setStatus('syncing'); done(); return; }
      loadQueue();
      api('GET', 'api/me').then(function (me) {
        Sync.user = me;
        pullFull().then(function () { start(); done(); }, function () { done(); });
      }, function () {
        Sync.user = null;
        setStatus('syncing');
        done();
      });
    }, function () {
      clearTimeout(timeout);
      if (done) finishLocal(done);
    });
  };

  function finishLocal(done) {
    Sync.mode = 'local';
    Sync.status = 'local';
    if (done) done();
  }

  function start() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      Sync.pull();
    }, POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) Sync.pull();
    });
    global.addEventListener('online', function () { Sync.push(); Sync.pull(); });
    if (Sync.queue.length) Sync.push();
  }

  /* ---------- authentication ---------- */

  Sync.setup = function (payload) {
    return api('POST', 'api/setup', payload).then(function (out) {
      Sync.needsSetup = false;
      return api('GET', 'api/me').then(function (me) {
        Sync.user = me;
        return pullFull().then(function () { start(); return out; });
      });
    });
  };

  Sync.login = function (email, password) {
    return api('POST', 'api/login', { email: email, password: password }).then(function (out) {
      return api('GET', 'api/me').then(function (me) {
        Sync.user = me;
        Sync.queue = [];
        saveQueue();
        return pullFull().then(function () { start(); return out; });
      });
    });
  };

  Sync.logout = function () {
    return api('POST', 'api/logout', {}).then(function () {
      Sync.user = null;
      Sync.queue = [];
      saveQueue();
      if (pollTimer) clearInterval(pollTimer);
      try { localStorage.removeItem(global.Store.storageKey); } catch (e) { /* ignore */ }
      location.reload();
    });
  };

  Sync.changePassword = function (payload) {
    return api('POST', 'api/password', payload);
  };

  /* ---------- pulling ---------- */

  function pullFull() {
    setStatus('syncing');
    return api('GET', 'api/state').then(function (out) {
      Sync.seq = out.seq;
      global.Store.replaceDocument(out.doc, out.personId);
      Sync.lastSyncAt = Date.now();
      setStatus('synced');
    }, function (err) {
      setStatus('offline', err.message);
      throw err;
    });
  }
  Sync.pullFull = pullFull;

  Sync.pull = function () {
    if (Sync.mode !== 'server' || !Sync.user || pushing) return Promise.resolve();
    return api('GET', 'api/changes?since=' + Sync.seq).then(function (out) {
      if (out.full) return pullFull();
      if (out.changes && out.changes.length) {
        var foreign = out.changes.filter(function (ch) { return ch.origin !== Sync.origin; });
        if (foreign.length) global.Store.applyRemote(foreign);
      }
      Sync.seq = out.seq;
      Sync.lastSyncAt = Date.now();
      if (Sync.status !== 'synced') setStatus('synced');
      backoff = 0;
    }, function (err) {
      if (err.status === 401) { Sync.user = null; setStatus('syncing'); global.App && global.App.render(); return; }
      setStatus('offline', err.message);
    });
  };

  /* ---------- pushing ---------- */

  /* Called by Store after every local mutation. */
  Sync.record = function (changes) {
    if (Sync.mode !== 'server' || !Sync.user || !changes.length) return;
    changes.forEach(function (ch) {
      // one pending change per record — the latest state of it is what matters
      Sync.queue = Sync.queue.filter(function (q) { return !(q.c === ch.c && q.id === ch.id); });
      Sync.queue.push(ch);
    });
    saveQueue();
    setStatus('syncing');
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(Sync.push, 400);
  };

  Sync.push = function () {
    if (Sync.mode !== 'server' || !Sync.user || pushing) return Promise.resolve();
    if (!Sync.queue.length) return Sync.pull();
    pushing = true;
    var batch = Sync.queue.slice();
    return api('POST', 'api/changes', { changes: batch, since: Sync.seq, origin: Sync.origin })
      .then(function (out) {
        pushing = false;
        Sync.queue = Sync.queue.filter(function (q) {
          return !batch.some(function (b) { return b.c === q.c && b.id === q.id && b.rev === q.rev; });
        });
        saveQueue();
        if (out.rejected && out.rejected.length) {
          setStatus('error', out.rejected[0].reason);
          if (global.UI) {
            global.UI.flag('The server would not accept a change',
              out.rejected[0].reason, 'danger');
          }
          return pullFull();
        }
        if (out.full) return pullFull();
        if (out.changes && out.changes.length) {
          var foreign = out.changes.filter(function (ch) { return ch.origin !== Sync.origin; });
          if (foreign.length) global.Store.applyRemote(foreign);
        }
        Sync.seq = out.seq;
        Sync.lastSyncAt = Date.now();
        setStatus(Sync.queue.length ? 'syncing' : 'synced');
        backoff = 0;
        if (Sync.queue.length) setTimeout(Sync.push, 200);
      }, function (err) {
        pushing = false;
        if (err.status === 401) {
          Sync.user = null;
          setStatus('syncing');
          global.App && global.App.render();
          return;
        }
        setStatus('offline', err.message);
        backoff = Math.min(backoff ? backoff * 2 : 2000, 60000);
        setTimeout(Sync.push, backoff);
      });
  };

  Sync.pendingCount = function () { return Sync.queue.length; };

  Sync.label = function () {
    if (Sync.mode === 'local') return 'This browser only';
    if (!Sync.user) return 'Not signed in';
    if (Sync.status === 'offline') return Sync.queue.length
      ? U.plural(Sync.queue.length, 'change') + ' waiting — offline' : 'Offline';
    if (Sync.status === 'error') return 'Sync problem';
    if (Sync.status === 'syncing') return 'Saving…';
    return 'Shared · saved';
  };

  global.Sync = Sync;
})(typeof window !== 'undefined' ? window : globalThis);
