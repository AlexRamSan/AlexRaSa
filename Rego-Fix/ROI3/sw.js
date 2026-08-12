const CACHE_NAME = 'regofix-roi-v3';

// Recursos locales de tu subcarpeta que se guardarán para uso 100% offline
const LOCAL_ASSETS = [
  '/rego-fix/roi3/',
  '/rego-fix/roi3/index.html',
  '/rego-fix/roi3/manifest.json',
  '/assets/regofixlogo.png'
];

// Librerías externas en CDN
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// 1. Instalación: Guarda los archivos en la caché del dispositivo
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Guardar assets locales
      await cache.addAll(LOCAL_ASSETS);
      
      // Guardar CDNs de forma tolerante a fallos de red
      EXTERNAL_ASSETS.forEach(async (url) => {
        try {
          const response = await fetch(url, { mode: 'no-cors' });
          await cache.put(url, response);
        } catch (err) {
          console.warn('No se pudo precargar el recurso externo:', url);
        }
      });
    })
  );
});

// 2. Activación: Toma control inmediato de la app y limpia versiones antiguas de caché
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

// 3. Estrategia de Red / Caché (Stale-While-Revalidate)
self.addEventListener('fetch', (e) => {
  // Ignorar llamadas dinámicas a la API de Inteligencia Artificial
  if (e.request.url.includes('/api/')) return;

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
          // Si falla la red (modo avión), sirve el HTML desde la caché
          if (e.request.mode === 'navigate') {
            return caches.match('/rego-fix/roi3/index.html');
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});
