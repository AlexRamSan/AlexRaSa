const CACHE_NAME = 'regofix-roi-v15';

// Rutas exactas a precargar en la memoria del dispositivo
const LOCAL_ASSETS = [
  '/rego-fix/roi3/',
  '/rego-fix/roi3/index.html',
  '/rego-fix/roi3/manifest.json',
  '/rego-fix/roi3/lib/tailwindcss.js',
  '/rego-fix/roi3/lib/chart.js',
  '/assets/regofixlogo.png'
];

// Instalación: Carga tolerante a fallos
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
            .catch((err) => console.warn('Error precargando recurso:', url, err))
        )
      );
    })
  );
});

// Activación: Limpieza de cachés antiguas
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

// Fetch: Responder siempre desde la caché si está disponible
self.addEventListener('fetch', (e) => {
  // Ignora las llamadas a la API de la IA (requieren internet)
  if (e.request.url.includes('/api/')) return;

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && e.request.method === 'GET') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Si falla la red al iniciar, sirve el index.html
          return caches.match('/rego-fix/roi3/index.html') || caches.match('/rego-fix/roi3/');
        });
    })
  );
});
