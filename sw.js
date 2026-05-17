const CACHE_NAME = "lista-spesa-cache-v4";

const FILES = [
  "/",
  "/index.html",
  "/login.html",
  "/spesa.html",
  "/spesa_prodotti.html",
  "/valigia.html",
  "/valigia_elencocose.html",
  "/manifest.json",
  "/logolistando.png",
];

/* INSTALL */
self.addEventListener("install", (event) => {
  self.skipWaiting(); // 🔥 forza attivazione immediata

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES);
    })
  );
});

/* ACTIVATE */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(k => {
          if (k !== CACHE_NAME) {
            return caches.delete(k); // 🔥 elimina vecchie versioni
          }
        })
      );
    })
  );

  self.clients.claim(); // 🔥 prende controllo subito
});

/* FETCH (NO CACHE BLOCCANTE) */
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});
