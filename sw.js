// Offline support. Vendor files (Pyodide, CodeMirror) never change, so they are
// served from the cache. Everything else is fetched fresh when online and falls
// back to the cached copy when offline, so new content shows up straight away.
const CACHE = 'pp-cache-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const save = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };
  if (url.pathname.includes('/vendor/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(save)));
  } else {
    event.respondWith(fetch(req).then(save).catch(() => caches.match(req, { ignoreSearch: true })));
  }
});
