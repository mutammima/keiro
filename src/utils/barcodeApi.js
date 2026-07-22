/**
 * barcodeApi.js — remote product-name lookup by barcode.
 *
 * Strategy:
 *  1. Open Food Facts (free, no API key, global food database) — tried first.
 *  2. UPC Item DB trial tier (100 requests/day, broader product coverage) — fallback.
 *
 * Both requests time out after 6 seconds. If neither source returns a name,
 * the function resolves to null and the UI prompts the user to type manually.
 */

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

  // ── 2. UPC Item DB (trial: 100 lookups/day) ───────────────────────────────
  // Broader product coverage beyond food. Free trial key embedded in URL.
  // Response shape: { items: [{ title }] }
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (res.ok) {
      const data = await res.json();
      const item = data?.items?.[0];
      if (item?.title) return item.title;
    }
  } catch {
    // offline, 6s timeout, or the trial key's daily quota is spent — this is the
    // last source, so fall through to the null return that prompts manual entry
  }

  // Both sources failed — caller should prompt for manual entry.
  return null;
}
