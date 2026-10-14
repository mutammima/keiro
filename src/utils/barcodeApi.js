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

// The iOS app serves its pages from capacitor://localhost, where a relative
// /api path would point inside the app bundle — so it calls the live site.
const PROD_LOOKUP_URL = 'https://keiro-mutammimas-projects.vercel.app/api/barcode';

function lookupRouteUrl(barcode) {
  const base = Capacitor.isNativePlatform() ? PROD_LOOKUP_URL : '/api/barcode';
  return `${base}?code=${encodeURIComponent(barcode)}`;
}

/**
 * Looks up a product name by barcode, trying two remote APIs in sequence.
 *
 * @param {string} barcode - The scanned barcode string (UPC, EAN, etc.).
 * @returns {Promise<string|null>} The product name if found, or null.
 */
export async function lookupBarcode(barcode) {
  // ── 1. Open Food Facts ────────────────────────────────────────────────────
  // Free, no key required. Returns food/drink products globally.
  // Response shape: { status: 1, product: { product_name, brands } }
  // We prepend the first brand token if it isn't already part of the name.
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,brands`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product?.product_name) {
        const brand = (data.product.brands || '').split(',')[0].trim();
        const name  = data.product.product_name.trim();
        return brand && !name.toLowerCase().startsWith(brand.toLowerCase())
          ? `${brand} ${name}`
          : name;
      }
    }
  } catch {
    // offline, 6s timeout, or malformed JSON from Open Food Facts — this is
    // only the first of two sources, so fall through to UPC Item DB below
  }

  // ── 2. Keiro's lookup route → UPCitemdb ─────────────────────────────────
  // Response shape: { name } — null when UPCitemdb doesn't know the code.
  try {
    const res = await fetch(lookupRouteUrl(barcode), { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.name) return data.name;
    }
  } catch {
    // offline, timeout, or the route is down / out of its daily quota — this is
    // the last source, so fall through to the null return that asks for the name
  }

  // Both sources failed — caller should prompt for manual entry.
  return null;
}
