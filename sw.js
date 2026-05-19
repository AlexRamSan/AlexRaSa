// Service Worker requerido para la correcta instalación en Safari (iOS)
self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
    // Listo para manejar peticiones de red
});
