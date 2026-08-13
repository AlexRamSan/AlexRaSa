const CACHE_NAME = 'regofix-roi-v18';

// Rutas ajustadas exactamente con las mayúsculas de tu servidor
const LOCAL_ASSETS = [
  '/Rego-Fix/ROI3/',
  '/Rego-Fix/ROI3/index.html',
  '/Rego-Fix/ROI3/manifest.json',
  '/Rego-Fix/ROI3/lib/tailwindcss.js',
  '/Rego-Fix/ROI3/lib/chart.js',
  '/assets/regofixlogo.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        LOCAL_ASSETS.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => {
              if (res.ok) return cache.put(url, res);
            })
            .catch((err) => console.warn('Error precargando:', url, err))
        )
      );
    })
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

  // Intercepción de navegación para el arranque en frío/multitarea desde la pantalla de inicio
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/Rego-Fix/ROI3/index.html')
        .then((cachedIndex) => {
          if (cachedIndex) return cachedIndex;
          return caches.match('/Rego-Fix/ROI3/');
        })
        .then((fallback) => {
          if (fallback) return fallback;
          return fetch(e.request);
        })
        .catch(() => {
          return caches.match('/Rego-Fix/ROI3/index.html') || caches.match('/Rego-Fix/ROI3/');
        })
    );
    return;
  }

  // Recursos estáticos
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && e.request.method === 'GET') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkResponse;
      });
    })
  );
});
