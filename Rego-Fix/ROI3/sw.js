const CACHE_NAME = 'regofix-roi-v10';

// Todos los recursos locales que deben guardarse en el teléfono
const LOCAL_ASSETS = [
  '/rego-fix/roi3/',
  '/rego-fix/roi3/index.html',
  '/rego-fix/roi3/manifest.json',
  '/rego-fix/roi3/lib/tailwindcss.js',
  '/rego-fix/roi3/lib/chart.js',
  '/assets/regofixlogo.png'
];

// Instalación: guardar todos los archivos locales
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
            .catch((err) => console.warn('No se pudo precargar:', url, err))
        )
      );
    })
  );
});

// Activación: tomar el control inmediato de la app y borrar cachés viejas
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

// Fetch: Responder SIEMPRE desde la caché si existe (Cache First)
self.addEventListener('fetch', (e) => {
  // Ignorar las peticiones a la API de IA (requieren internet)
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
          // Si no hay red y navega, sirve la página principal desde caché
          return caches.match('/rego-fix/roi3/index.html') || caches.match('/rego-fix/roi3/');
        });
    })
  );
});
