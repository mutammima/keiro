// ── InvoiceGo Service Worker ──────────────────────────────────────────────────
// User-friendly update strategy:
//   • On install: waits (does NOT skipWaiting) so the new SW sits in "waiting"
//     state where useAppUpdate.js can detect it and show the banner
//   • On "Update Now" tap: the banner posts SKIP_WAITING here, triggering
//     controllerchange in the page which reloads cleanly
//   • clients.claim() on activate — existing tabs get the new SW right away
//   • index.html is always fetched network-first (never served stale from cache)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'invoicego-v7';

const PRECACHE_URLS = [
  '/manifest.json',
];

// ── Install: precache but DO NOT skipWaiting ──────────────────────────────────
// Staying in "waiting" is what allows useAppUpdate to detect the pending update
// and show the "Update now / Later" banner. If we skipWaiting here the new SW
// takes over silently and the user never gets a choice.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // intentionally NOT calling self.skipWaiting() here
});

// ── Activate: wipe old caches, claim all open tabs instantly ──────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim()) // take over all open tabs immediately
  );
});

// ── Message: still support manual SKIP_WAITING from the UI banner ─────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
// • index.html → always network-first, never cache (ensures latest app shell)
// • JS/CSS assets → cache-first (they are content-hashed, safe to cache long)
// • Everything else → network-first with cache fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never cache version.json — always go to network
  if (url.pathname === '/version.json') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Always fetch index.html fresh from the network
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Hashed assets (e.g. /assets/index-abc123.js) — cache-first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Everything else — network-first, cache as fallback.
  // IMPORTANT: only cache SAME-ORIGIN, successful responses. Caching every GET
  // (cross-origin map tiles, the barcode API, Supabase, opaque responses) grew
  // this cache without bound — on a storage-tight phone iOS would eventually
  // evict the whole PWA. Cross-origin requests now pass through uncached; only
  // our own finite set of same-origin assets is ever stored.
  const sameOrigin = url.origin === self.location.origin;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (sameOrigin && response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
