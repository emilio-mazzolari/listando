const CACHE_NAME = "lista-spesa-cache-v121";
const API_CACHE  = "lista-spesa-api-v121";

const FILES = [
  "/manifest.json",
  "/logolistando.png",
  "/logolistando-192.png",
  "/icon-pwa-192.png",
  "/icon-pwa-512.png",
  "/favicon-32.png",
  "/favicon-16.png",
  "/index.html",
  "/login.html",
  "/canzoni.html",
  "/debiti.html",
  "/desideri.html",
  "/faccende.html",
  "/film.html",
  "/foto.html",
  "/foto_album.html",
  "/hobby.html",
  "/libri.html",
  "/luoghi.html",
  "/note.html",
  "/password.html",
  "/profilo.html",
  "/ricette.html",
  "/risparmi.html",
  "/spesa.html",
  "/spesa_prodotti.html",
  "/spese_viaggio.html",
  "/todo.html",
  "/utenze.html",
  "/valigia.html",
  "/valigia_elencocose.html",
  "/vendita.html",
];

/* INSTALL */
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES);
    })
  );
});

/* ACTIVATE */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(k => (k !== CACHE_NAME && k !== API_CACHE) ? caches.delete(k) : null)
      ))
      .then(() => self.clients.claim())
  );
});

/* FETCH */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Supabase REST API — GET: network first, cache come fallback offline
  if (url.hostname === 'eejdpophfxsrqdvsucye.supabase.co' &&
      url.pathname.startsWith('/rest/v1/') &&
      event.request.method === 'GET') {
    event.respondWith(
      caches.open(API_CACHE).then(cache =>
        fetch(event.request)
          .then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cache.match(event.request).then(r => r || Response.error()))
      )
    );
    return;
  }

  // Risorse esterne (CDN, auth Supabase, ecc.): solo network
  if (url.hostname !== self.location.hostname) {
    event.respondWith(fetch(event.request).catch(() => Response.error()));
    return;
  }

  // File locali: cache first + aggiornamento in background
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => null);
        return cached || networkFetch;
      })
    )
  );
});

/* PUSH */
self.addEventListener("push", (event) => {
  let data = { title: "Listando", body: "", url: "/todo.html" };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logolistando.png",
      badge: "/logolistando.png",
      tag: data.tag || ("listando-" + Date.now()),
      renotify: true,
      requireInteraction: true,
      data: { url: data.url || "/todo.html" },
    })
  );
});

/* NOTIFICATION CLICK */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/todo.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes("listando") || c.url.endsWith("/"));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});
