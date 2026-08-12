const CACHE_NAME = 'regofix-roi-offline-v1';

// Recursos de la app y CDNs que se guardarán en la memoria del iPhone
const ASSETS_TO_CACHE = [
  '/rego-fix/roi3/',
  '/rego-fix/roi3/index.html',
  '/rego-fix/roi3/manifest.json',
  '/assets/regofixlogo.png',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Instalar y precargar todo
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return fetch(url, { mode: 'cors' })
            .then((response) => cache.put(url, response))
            .catch((err) => console.warn('Error precargando:', url, err));
        })
      );
    })
  );
});

// Activar y limpiar cachés viejas
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

// Interceptar llamadas (Estrategia Cache First)
self.addEventListener('fetch', (e) => {
  // Las llamadas a la IA NO se guardan en caché (necesitan red)
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
