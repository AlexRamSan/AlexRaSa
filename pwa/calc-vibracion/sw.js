// App-shell cache con rutas absolutas
const CACHE = "rpm-vib-v3";
const ASSETS = [
  "/pwa/calc-vibracion/",
  "/pwa/calc-vibracion/index.html",
  "/pwa/calc-vibracion/manifest.json",
  "/pwa/calc-vibracion/sw.js",
  "/pwa/calc-vibracion/icons/icon-192.png",
  "/pwa/calc-vibracion/icons/icon-512.png",
  "/pwa/calc-vibracion/icons/icon-180.png",
  "/pwa/calc-vibracion/icons/icon-167.png",
  "/pwa/calc-vibracion/icons/icon-152.png",
  "/pwa/calc-vibracion/icons/icon-120.png",
  "/pwa/calc-vibracion/icons/maskable-512.png"
];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=> c.addAll(ASSETS)));
});

self.addEventListener("activate", e=>{
  e.waitUntil(
    caches.keys().then(keys=> Promise.all(keys.filter(k=>k!==CACHE).map(k=> caches.delete(k))))
  );
});

self.addEventListener("fetch", e=>{
  e.respondWith(
    caches.match(e.request).then(r=> r || fetch(e.request))
  );
});
