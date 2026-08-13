const CACHE_NAME = 'regofix-roi-v16';

// Assets requeridos para que funcione offline
const LOCAL_ASSETS = [
  '/rego-fix/roi3/',
  '/rego-fix/roi3/index.html',
  '/rego-fix/roi3/manifest.json',
  '/rego-fix/roi3/lib/tailwindcss.js',
  '/rego-fix/roi3/lib/chart.js',
  '/assets/regofixlogo.png'
];

// Instalación: Precarga agresiva
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Obliga al Service Worker a tomar el control de inmediato
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

// Activación: Reclama clientes activos y borra cachés viejas
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(), // Asegura que la PWA esté controlada en el primer arranque
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

// Intercepción de Peticiones (El truco para el arranque en frío)
self.addEventListener('fetch', (e) => {
  // Ignora llamadas a la API de IA
  if (e.request.url.includes('/api/')) return;

  // 1. SI ES UN ARRANQUE DE APLICACIÓN O NAVEGACIÓN (Pantalla de inicio / Recarga)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/rego-fix/roi3/index.html').then((cachedIndex) => {
        if (cachedIndex) return cachedIndex; // Si está offline, sirve el HTML guardado de inmediato
        return fetch(e.request).catch(() => caches.match('/rego-fix/roi3/'));
      })
    );
    return;
  }

  // 2. PARA OTROS RECURSOS (Imágenes, scripts JS, CSS) -> Cache First
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
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
