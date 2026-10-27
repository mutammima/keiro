/**
 * barcodeApi.js — remote product-name lookup by barcode.
 *
 * Strategy:
 *  1. Open Food Facts (free, no API key, global food database) — tried first.
 *  2. Keiro's own /api/barcode route (api/barcode.js), which asks UPCitemdb —
 *     general merchandise like motor oil and shirts. UPCitemdb only allows
 *     requests from its own website, so the app can't call it directly.
 *
 * Open Food Facts times out after 6 seconds, the route after 8 (it has its
 * own 6-second upstream timeout). If neither returns a name, the function
 * resolves to null and the UI asks the user to type the name once.
 */

import { Capacitor } from '@capacitor/core';
import { timeoutSignal } from './timeoutSignal';
import { PROD_ORIGIN } from './constants';

// The iOS app serves its pages from capacitor://localhost, where a relative
// /api path would point inside the app bundle — so it calls the live site.
const PROD_LOOKUP_URL = `${PROD_ORIGIN}/api/barcode`;

function lookupRouteUrl(barcode) {
  const base = Capacitor.isNativePlatform() ? PROD_LOOKUP_URL : '/api/barcode';
  return `${base}?code=${encodeURIComponent(barcode)}`;
}

/**
 * Looks up a product name by barcode, trying two remote sources in sequence.
 *
 * `status` tells the caller what "no name" means:
 *  - 'found'       — a source named it.
 *  - 'not-found'   — both sources answered, and neither knows it.
 *  - 'unavailable' — at least one source couldn't be asked (offline, timeout,
 *                    service down, UPCitemdb out of quota), so it may exist.
 *
 * @param {string} barcode - The scanned barcode string (UPC, EAN, etc.).
 * @returns {Promise<{name: string|null, status: 'found'|'not-found'|'unavailable'}>}
 */
export async function lookupBarcode(barcode) {
  let unavailable = false;

  // ── 1. Open Food Facts ────────────────────────────────────────────────────
  // Free, no key required. Returns food/drink products globally.
  // Response shape: { status: 1, product: { product_name, brands } }; an
  // unknown code is a 404 (or status 0), which is an answer, not a failure.
  // We prepend the first brand token if it isn't already part of the name.
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,brands`,
      { signal: timeoutSignal(6000) }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product?.product_name) {
        const brand = (data.product.brands || '').split(',')[0].trim();
        const name  = data.product.product_name.trim();
        return {
          name: brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name,
          status: 'found',
        };
      }
    } else if (res.status !== 404) {
      unavailable = true; // 5xx / 429: Open Food Facts is down or throttling
    }
  } catch {
    // offline, 6s timeout, or malformed JSON — still try the route below
    unavailable = true;
  }

  // ── 2. Keiro's lookup route → UPCitemdb ─────────────────────────────────
  // Response shape: { name } — null when UPCitemdb doesn't know the code. A 400
  // means the code isn't a barcode it can look up (an answer); 502 means
  // UPCitemdb was down or out of quota.
  try {
    const res = await fetch(lookupRouteUrl(barcode), { signal: timeoutSignal(8000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.name) return { name: data.name, status: 'found' };
    } else if (res.status !== 400) {
      unavailable = true;
    }
  } catch {
    // offline, timeout, or the route itself is down
    unavailable = true;
  }

  return { name: null, status: unavailable ? 'unavailable' : 'not-found' };
}
