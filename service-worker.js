// ============================================================
//  SKY AGRICULTURE — PWA ISOBUS
//  service-worker.js — Version simplifiée
// ============================================================

const CACHE_NAME = "sky-isobus-v2";
const CACHE_URLS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/api.js",
  "./js/app.js",
  "./manifest.json",
];

// Installation
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS))
  );
});

// Activation
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — on laisse TOUT passer librement (pas de blocage API)
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Ne jamais intercepter les appels Google Apps Script
  if (url.includes("script.google.com") || url.includes("googleusercontent.com")) {
    return; // Laisse le navigateur gérer directement
  }

  // Pour les assets locaux : cache first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
