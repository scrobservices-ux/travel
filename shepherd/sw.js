/* Service worker.
 *
 * Two jobs, both modest:
 *   1. Let the app be installed to a phone's home screen and open without a
 *      browser bar, so it behaves like the other apps on the phone.
 *   2. Keep the shell (page, styles, scripts, icons) on the device, so it still
 *      opens in a hall with poor signal. The data itself is already cached by
 *      the app in localStorage and any change made offline is queued by Sync.
 *
 * What is never cached: anything under /api/ and the calendar feed. Those are
 * live, sometimes personal, and a stale answer would be worse than no answer. */
var VERSION = 'shepherd-v1';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/app.css',
  './js/util.js',
  './js/schema.js',
  './js/seed.js',
  './js/store.js',
  './js/auth.js',
  './js/ui.js',
  './js/program.js',
  './js/scheduler.js',
  './js/sync.js',
  './js/pwa.js',
  './js/app.js',
  './js/views/dashboard.js',
  './js/views/meetings.js',
  './js/views/board.js',
  './js/views/duties.js',
  './js/views/publishers.js',
  './js/views/reports.js',
  './js/views/territories.js',
  './js/views/shepherding.js',
  './js/views/tasks.js',
  './js/views/attendance.js',
  './js/views/accounts.js',
  './js/views/announcements.js',
  './js/views/profile.js',
  './js/views/fairness.js',
  './js/views/print.js',
  './js/views/import.js',
  './js/views/files.js',
  './js/views/admin.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // one missing file must not stop the rest being stored
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isLive(url) {
  return url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/calendar/') === 0;
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  if (isLive(url)) return;                       // straight to the network, never stored

  // A page load: try the network so a signed-in visitor gets the live shell,
  // and fall back to the stored copy when there is no signal.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (hit) {
          return hit || caches.match('./');
        });
      })
    );
    return;
  }

  // Everything else in the shell: answer from the cache at once, then quietly
  // refresh it so the next start-up has the newer file.
  event.respondWith(
    caches.match(req).then(function (hit) {
      var live = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || live;
    })
  );
});

/* The app posts this after it notices a new version so the waiting worker
   takes over without the person having to close every tab. */
self.addEventListener('message', function (event) {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
