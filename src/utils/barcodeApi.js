/**
 * Look up a product name by barcode using Open Food Facts (free, no key).
 * Falls back to UPC Item DB trial if needed.
 * Returns a string name, or null if not found.
 */
export async function lookupBarcode(barcode) {
  // ── Open Food Facts ───────────────────────────────────────────────────────
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
  } catch {}

  // ── UPC Item DB (trial: 100/day) ──────────────────────────────────────────
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
  } catch {}

  return null;
}
