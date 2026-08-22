const CACHE_NAME = 'regofix-roi-lab-v1';

// Archivos precargados para el entorno /Rego-Fix/ROI/
const LOCAL_ASSETS = [
  '/Rego-Fix/ROI/',
  '/Rego-Fix/ROI/index.html',
  '/Rego-Fix/ROI/manifest.json',
  '/Rego-Fix/ROI/lib/tailwindcss.css',
  '/Rego-Fix/ROI/lib/chart.js',
  '/assets/regofixlogo.png',
  '/assets/applogo.png'
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
  // Las llamadas a API no se guardan en caché para permitir sync y peticiones dinámicas
  if (e.request.url.includes('/api/')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/Rego-Fix/ROI/index.html')
        .then((cachedIndex) => {
          if (cachedIndex) return cachedIndex;
          return caches.match('/Rego-Fix/ROI/');
        })
        .then((fallback) => {
          if (fallback) return fallback;
          return fetch(e.request);
        })
        .catch(() => {
          return caches.match('/Rego-Fix/ROI/index.html') || caches.match('/Rego-Fix/ROI/');
        })
    );
    return;
  }

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
