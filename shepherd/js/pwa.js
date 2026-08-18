/* Installing to a phone.
 *
 * The app is a web page, but with a manifest and a service worker a phone will
 * add it to the home screen and open it full-screen, so a publisher taps an
 * icon rather than hunting for a bookmark. Nothing here is required for the app
 * to work — if the browser will not have it, everything carries on as before. */
(function (global) {
  'use strict';

  var PWA = {
    supported: 'serviceWorker' in global.navigator,
    installed: false,      // running from the home screen already
    prompt: null,          // the browser's install prompt, when it offers one
    updateReady: false,
    listeners: []
  };

  function emit() {
    PWA.listeners.forEach(function (fn) { try { fn(PWA); } catch (e) { console.error(e); } });
  }
  PWA.subscribe = function (fn) { PWA.listeners.push(fn); };

  function standalone() {
    return (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) ||
      global.navigator.standalone === true;
  }
  PWA.installed = standalone();

  /* iPhones never fire the install prompt — Safari wants Share ▸ Add to Home
     Screen — so the app has to tell the person that itself. */
  PWA.isIOS = /iPad|iPhone|iPod/.test(global.navigator.userAgent || '') ||
    (global.navigator.platform === 'MacIntel' && global.navigator.maxTouchPoints > 1);

  PWA.canInstall = function () {
    return !PWA.installed && (!!PWA.prompt || PWA.isIOS);
  };

  PWA.install = function () {
    if (!PWA.prompt) return Promise.resolve('unavailable');
    var deferred = PWA.prompt;
    PWA.prompt = null;
    deferred.prompt();
    return deferred.userChoice.then(function (choice) {
      emit();
      return choice && choice.outcome;
    });
  };

  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    PWA.prompt = e;
    emit();
  });
  global.addEventListener('appinstalled', function () {
    PWA.installed = true;
    PWA.prompt = null;
    emit();
  });

  PWA.register = function () {
    if (!PWA.supported) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;  // file:// has no worker
    global.navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', function () {
          if (next.state === 'installed' && global.navigator.serviceWorker.controller) {
            PWA.updateReady = true;
            PWA.applyUpdate = function () { next.postMessage('skip-waiting'); };
            emit();
          }
        });
      });
      PWA.checkPush();
    }).catch(function () { /* a stale or blocked worker is not worth a warning */ });

    /* Reload only when a worker replaces an earlier one — on the very first
       visit the worker takes control of a page that is already correct. */
    var hadController = !!global.navigator.serviceWorker.controller;
    var reloading = false;
    global.navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
  };

  /* ---------- pop-up reminders ---------- *
   * Asking is a one-time thing and the browser only asks once, so the app never
   * asks on its own: a brother taps a button when he wants them. */
  PWA.pushSupported = function () {
    return PWA.supported && 'PushManager' in global && 'Notification' in global;
  };

  PWA.pushState = function () {
    if (!PWA.pushSupported()) {
      return PWA.isIOS && !PWA.installed
        ? 'needs-install'          // iPhones only allow it from the home screen
        : 'unsupported';
    }
    if (global.Notification.permission === 'denied') return 'blocked';
    if (global.Notification.permission === 'granted') return PWA.subscribed ? 'on' : 'granted';
    return 'off';
  };
  PWA.subscribed = false;

  /* Has this device already got a subscription with the browser? */
  PWA.checkPush = function () {
    if (!PWA.pushSupported()) return Promise.resolve(false);
    return global.navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      PWA.subscribed = !!sub;
      emit();
      return !!sub;
    }).catch(function () { return false; });
  };

  function urlBase64ToUint8Array(base64) {
    var padding = '='.repeat((4 - base64.length % 4) % 4);
    var raw = global.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  /* Asks the phone, then tells the server where to send. */
  PWA.enablePush = function () {
    if (!PWA.pushSupported()) return Promise.reject(new Error('This browser cannot show reminders.'));
    var Sync = global.Sync;
    if (!Sync || Sync.mode !== 'server') {
      return Promise.reject(new Error('Reminders are sent by the congregation’s server.'));
    }
    return global.Notification.requestPermission().then(function (permission) {
      if (permission !== 'granted') throw new Error('The phone did not allow reminders.');
      return Sync.api('GET', 'api/push');
    }).then(function (info) {
      if (!info || !info.publicKey) throw new Error('The server has no reminder key yet.');
      return global.navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (existing) {
          if (existing) return existing;
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(info.publicKey)
          });
        });
      });
    }).then(function (sub) {
      return Sync.api('POST', 'api/push/subscribe', { subscription: sub.toJSON() });
    }).then(function (out) {
      PWA.subscribed = true;
      emit();
      return out;
    });
  };

  PWA.disablePush = function () {
    if (!PWA.pushSupported()) return Promise.resolve();
    return global.navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      if (!sub) return null;
      var endpoint = sub.endpoint;
      return sub.unsubscribe().then(function () {
        var Sync = global.Sync;
        if (Sync && Sync.mode === 'server') {
          return Sync.api('POST', 'api/push/unsubscribe', { endpoint: endpoint }).catch(function () { });
        }
      });
    }).then(function () {
      PWA.subscribed = false;
      emit();
    });
  };

  global.PWA = PWA;
})(typeof window !== 'undefined' ? window : globalThis);
