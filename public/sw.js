// Ovia service worker: makes the installed app open without internet.
// User data (pool, texts, media) lives in IndexedDB and is never touched here;
// this only caches the app files (HTML, JS, CSS, fonts, icons).

const CACHE = 'ovia-app-v1';
const SCOPE = self.registration.scope; // e.g. https://alatar17.github.io/ovia/

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([SCOPE, `${SCOPE}manifest.webmanifest`]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page itself: try the network first so updates arrive, fall back to the cached copy offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(SCOPE, copy));
          return res;
        })
        .catch(() => caches.match(SCOPE))
    );
    return;
  }

  // App files (hashed names never change) and Google Fonts: cache first.
  const isOwnFile = req.url.startsWith(SCOPE);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!isOwnFile && !isFont) return;

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});
