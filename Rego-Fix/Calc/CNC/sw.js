const CACHE_NAME = 'regofix-cnc-calc-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './api/cut-conditions.js',
  './api/recommend.js',
  './lib/tailwindcss.css',
  './lib/chart.js',
  'https://alexrasa.store/assets/regofixlogo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, cloned));
        return response;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
