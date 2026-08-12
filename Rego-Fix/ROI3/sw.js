const CACHE_NAME = 'regofix-roi-v5';

// Archivos esenciales del proyecto
const ASSETS = [
  '/rego-fix/roi3/index.html',
  '/rego-fix/roi3/manifest.json',
  '/assets/regofixlogo.png',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Instalación recurso por recurso (evita que falle si un CDN o imagen falla)
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((response) => {
              if (response.ok) return cache.put(url, response);
            })
            .catch((err) => console.warn('No se pudo precargar:', url, err))
        )
      );
    })
  );
});

// Activación y limpieza de versiones viejas
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

// Estrategia: Servir desde caché si existe, si no consultar red
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return;

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          if (e.request.mode === 'navigate') {
            return caches.match('/rego-fix/roi3/index.html');
          }
        });
    })
  );
});
