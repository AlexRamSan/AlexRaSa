/* sw-solidcam.js */
const CACHE = "solidcam-roi-v1";
const PRECACHE = [
  "/proyectos/calculadoras/solidcam/",
  "/proyectos/calculadoras/solidcam/index.html",
  "/proyectos/calculadoras/solidcam/solidcam.webmanifest",
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  "/assets/hero-industrial.png",
  "/assets/logo.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Network-first para HTML, cache-first para estáticos
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
  } else {
    e.respondWith(
      caches.match(req).then(cached =>
        cached || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
      )
    );
  }
});
