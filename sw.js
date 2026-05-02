const CACHE_NAME = "lista-spesa-cache-v1";

const FILES = [
  "/",
  "/index.html",
  "/prodotti.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

/* INSTALL */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES);
    })
  );
});

/* FETCH */
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});