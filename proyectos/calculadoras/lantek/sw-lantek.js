/* v1 – 2025-11-10 */
const CACHE_NAME = "lantek-roi-v1";
const APP_SCOPE  = "/proyectos/calculadoras/lantek/";
const ORIGIN     = self.location.origin;

/* Precache mínimo. Agrega aquí cualquier asset estático adicional propio. */
const PRECACHE_URLS = [
  `${APP_SCOPE}`,
  `${APP_SCOPE}index.html`,
  `${APP_SCOPE}lantek.webmanifest`,
  `${APP_SCOPE}icons/icon-192.png`,
  `${APP_SCOPE}icons/icon-256.png`,
  `${APP_SCOPE}icons/icon-512.png`,
  `${APP_SCOPE}icons/maskable-512.png`,
  // activos compartidos de tu sitio
  `/assets/logo.png`,
  `/assets/hero-industrial.png`
];

/* Respuesta offline básica para navegaciones si no hay caché. */
const OFFLINE_HTML = `
<!doctype html><meta charset="utf-8">
<title>Sin conexión — Lantek ROI</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;font:15px/1.45 system-ui;background:#071027;color:#e6eef8;padding:24px}
.card{max-width:720px;margin:10vh auto;padding:24px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:#0f172a}
h1{margin:0 0 8px}p{margin:8px 0}</style>
<div class="card">
  <h1>Estás sin conexión</h1>
  <p>No pude descargar la página. Reintenta cuando vuelvas a tener Internet.</p>
</div>`;

/* Install: precache básico */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* Activate: limpia cachés viejas */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim();
  })());
});

/* Estrategias:
   - Navegaciones (mode: navigate): network-first → cache → offline HTML
   - Misma-origen estáticos: cache-first → network (actualiza en background con SWR)
   - Cross-origin (CDNs): network-first → cache si existe
*/
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Navegación de páginas
  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
    return;
  }

  // 2) Misma-origen
  if (url.origin === ORIGIN) {
    event.respondWith(cacheFirstSWR(req));
    return;
  }

  // 3) Cross-origin (CDNs como tailwind)
  event.respondWith(networkFirst(req));
});

/* Helpers */
async function networkFirstPage(request) {
  try {
    const fresh = await fetch(request);
    // opcional: cachear la página
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function cacheFirstSWR(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchAndUpdate = fetch(request).then((resp) => {
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  }).catch(() => null);

  // responde de caché si existe, y actualiza en background
  if (cached) {
    eventWaitUntil(fetchAndUpdate);
    return cached;
  }
  // si no hay caché, intenta red
  const fresh = await fetchAndUpdate;
  return fresh || new Response("", { status: 504, statusText: "Offline" });
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request, { credentials: "omit", cache: "no-store" });
    // guarda si es cacheable
    const cache = await caches.open(CACHE_NAME);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    return cached || new Response("", { status: 504, statusText: "Offline" });
  }
}

/* allow background tasks during response from cache */
function eventWaitUntil(promise) {
  // no-op fuera de listeners, pero útil si llamas desde dentro
}
