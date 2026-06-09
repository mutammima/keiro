/**
 * geo.js — lightweight device-location + distance helpers for the marketplace.
 *
 * Location is always best-effort: every caller must tolerate a null/failed fix
 * (user denied permission, no GPS, insecure context). When we can't get coords
 * we simply publish/sort without distance rather than blocking the action.
 */

// In-memory cache so we don't re-prompt / re-poll GPS on every feed render.
let _cached = null; // { lat, lng, ts }
const MAX_AGE = 10 * 60 * 1000; // 10 minutes

/**
 * Resolve the device's current position as { lat, lng }, or null on any failure.
 * Never rejects — callers can `await getCurrentPosition()` and branch on null.
 */
export function getCurrentPosition({ timeout = 8000, maxAge = MAX_AGE } = {}) {
  if (_cached && Date.now() - _cached.ts < maxAge) {
    return Promise.resolve({ lat: _cached.lat, lng: _cached.lng });
  }
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        _cached = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
        resolve({ lat: _cached.lat, lng: _cached.lng });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout, maximumAge: maxAge }
    );
  });
}

/** Great-circle distance in miles, or null if either point lacks coords. */
export function haversineMiles(a, b) {
  if (!a || !b) return null;
  const lat1 = Number(a.lat), lng1 = Number(a.lng);
  const lat2 = Number(b.lat), lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const R = 3958.8; // Earth radius, miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Human-friendly distance label. Returns '' for null. */
export function formatDistance(mi) {
  if (mi == null || !Number.isFinite(mi)) return '';
  if (mi < 0.1) return 'Nearby';
  if (mi < 10) return `${mi.toFixed(1)} mi away`;
  return `${Math.round(mi)} mi away`;
}
