// ============================================================
//  SKY AGRICULTURE — PWA ISOBUS
//  service-worker.js — Gestion offline
// ============================================================

const CACHE_NAME  = "sky-isobus-v1";
const CACHE_URLS  = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/api.js",
  "./js/app.js",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css",
];

// ── Installation : mise en cache des ressources statiques ──
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activation : nettoyage des anciens caches ──────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch : stratégie Cache-First pour les assets,
//            Network-First pour l'API ──────────────────────
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Requêtes API → Network-first (avec fallback cache)
  if (url.includes("script.google.com")) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets statiques → Cache-first
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
