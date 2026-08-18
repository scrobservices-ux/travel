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

  global.PWA = PWA;
})(typeof window !== 'undefined' ? window : globalThis);
