// ── InvoiceGo Service Worker ──────────────────────────────────────────────────
// Bump CACHE_NAME on every deploy so browsers detect a new SW version.
// The app controls when the new SW takes over — it never skips waiting
// silently. Instead it waits for a SKIP_WAITING message from the UI.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'invoicego-v4';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── Install: pre-cache shell, but do NOT skip waiting ────────────────────────
// The new SW sits in "waiting" state until the app sends SKIP_WAITING.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // intentionally no self.skipWaiting() here
});

// ── Activate: clear old caches, claim clients ─────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Message: app posts SKIP_WAITING when user approves the update ─────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch: network-first, fall back to cache ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
