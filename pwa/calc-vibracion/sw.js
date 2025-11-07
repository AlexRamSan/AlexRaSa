// Simple app-shell cache
const CACHE = "rpm-vib-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./sw.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
  "./icons/icon-167.png",
  "./icons/icon-152.png",
  "./icons/icon-120.png",
  "./icons/maskable-512.png"
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
