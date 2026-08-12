const CACHE_NAME = 'regofix-roi-v4';

const LOCAL_ASSETS = [
  '/rego-fix/roi3/',
  '/rego-fix/roi3/index.html',
  '/rego-fix/roi3/manifest.json',
  '/rego-fix/roi3/lib/tailwindcss.css',
  '/rego-fix/roi3/lib/chart.js',
  '/assets/regofixlogo.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(LOCAL_ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match('/rego-fix/roi3/index.html');
        }
      });
    })
  );
});
