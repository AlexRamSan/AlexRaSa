const CACHE_NAME = 'regofix-roi-v2';

// Archivos locales indispensables
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/regofixlogo.png'
];

// Scripts/CDNs externos
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Instalación tolerante a fallos
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Forzar activación inmediata
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Guardar recursos locales primero
      await cache.addAll(LOCAL_ASSETS);
      
      // 2. Intentar guardar CDNs individualmente (sin tumbar la instalación si falla una)
      EXTERNAL_ASSETS.forEach(async (url) => {
        try {
          const response = await fetch(url, { mode: 'no-cors' });
          await cache.put(url, response);
        } catch (err) {
          console.warn('No se pudo guardar en caché recurso externo:', url);
        }
      });
    })
  );
});

// Activación y limpieza de cachés antiguas
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(), // Tomar control de las pestañas abiertas
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

// Estrategia Stale-While-Revalidate (Servir desde caché primero, luego actualizar en background)
self.addEventListener('fetch', (e) => {
  // Ignorar peticiones a las APIs del servidor (ej. /api/recommend.js)
  if (e.request.url.includes('/api/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});
