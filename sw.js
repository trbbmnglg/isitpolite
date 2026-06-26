const CACHE = 'isitpolite-v19';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  // Cache API only supports GET — let everything else (POST /api/ask) pass through.
  if (e.request.method !== 'GET') return;

  var url = e.request.url;
  // Never touch the API or fonts.
  if (url.indexOf('/api/') !== -1 ||
      url.indexOf('fonts.googleapis.com') !== -1 ||
      url.indexOf('fonts.gstatic.com') !== -1) {
    return; // default network behavior
  }

  // Network-first: always try the network so new deploys are picked up immediately,
  // falling back to cache only when offline. Keeps the app shell available offline
  // without ever serving stale code while online.
  e.respondWith(
    fetch(e.request)
      .then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      })
      .catch(function () {
        return caches.match(e.request, { ignoreSearch: true }).then(function (cached) {
          return cached || caches.match('./index.html');
        });
      })
  );
});
