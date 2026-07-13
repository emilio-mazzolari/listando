const CACHE_NAME = "lista-spesa-cache-v5";

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

/* PUSH */
self.addEventListener("push", (event) => {
  let data = { title: "Listando", body: "", url: "/debiti.html" };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logolistando.png",
      badge: "/logolistando.png",
      tag: "listando-weekly",
      renotify: true,
      data: { url: data.url || "/debiti.html" },
    })
  );
});

/* NOTIFICATION CLICK */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/debiti.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes("listando") || c.url.endsWith("/"));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});
