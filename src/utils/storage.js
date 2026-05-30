// ─── Keys ───────────────────────────────────────────────────────────────────
const KEYS = {
  INVOICE_NUMBER: 'inv_number',
  INVOICES: 'inv_list',
  PRODUCT_CATALOG: 'inv_catalog',   // barcode → { name, lastPrice }
  STORE_NAMES: 'inv_stores',        // string[]
  PRODUCT_NAMES: 'inv_product_names', // string[]
  BUSINESS_NAME: 'inv_business_name', // string
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function get(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('localStorage write failed', e);
  }
}

// ─── Invoice Number ───────────────────────────────────────────────────────────
export function getNextInvoiceNumber() {
  const current = get(KEYS.INVOICE_NUMBER, 1000);
  const next = current + 1;
  set(KEYS.INVOICE_NUMBER, next);
  return next;
}

export function peekInvoiceNumber() {
  return get(KEYS.INVOICE_NUMBER, 1000) + 1;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
export function saveInvoice(invoice) {
  const list = get(KEYS.INVOICES, []);
  list.push(invoice);
  set(KEYS.INVOICES, list);
}

export function getInvoices() {
  return get(KEYS.INVOICES, []);
}

// ─── Product Catalog (barcode → { name, lastPrice }) ─────────────────────────
export function getProductByBarcode(barcode) {
  const catalog = get(KEYS.PRODUCT_CATALOG, {});
  return catalog[barcode] || null;
}

export function saveProductBarcode(barcode, name, price) {
  const catalog = get(KEYS.PRODUCT_CATALOG, {});
  catalog[barcode] = { name, lastPrice: price };
  set(KEYS.PRODUCT_CATALOG, catalog);
}

// ─── Store Name History ───────────────────────────────────────────────────────
export function getStoreNames() {
  return get(KEYS.STORE_NAMES, []);
}

export function saveStoreName(name) {
  if (!name || !name.trim()) return;
  const names = get(KEYS.STORE_NAMES, []);
  const trimmed = name.trim();
  if (!names.includes(trimmed)) {
    names.unshift(trimmed);
    if (names.length > 50) names.pop();
    set(KEYS.STORE_NAMES, names);
  }
}

// ─── Business Name ────────────────────────────────────────────────────────────
export function getBusinessName() {
  return get(KEYS.BUSINESS_NAME, '');
}

export function saveBusinessName(name) {
  set(KEYS.BUSINESS_NAME, name.trim());
}

// ─── Product Name History ─────────────────────────────────────────────────────
export function getProductNames() {
  return get(KEYS.PRODUCT_NAMES, []);
}

export function saveProductName(name) {
  if (!name || !name.trim()) return;
  const names = get(KEYS.PRODUCT_NAMES, []);
  const trimmed = name.trim();
  if (!names.includes(trimmed)) {
    names.unshift(trimmed);
    if (names.length > 200) names.pop();
    set(KEYS.PRODUCT_NAMES, names);
  }
}
