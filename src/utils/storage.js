// ─── Keys ───────────────────────────────────────────────────────────────────
const KEYS = {
  INVOICE_NUMBER:   'inv_number',
  INVOICES:         'inv_list',
  PRODUCT_CATALOG:  'inv_catalog',        // barcode → { name, lastPrice }
  STORE_NAMES:      'inv_stores',         // string[]
  PRODUCT_NAMES:    'inv_product_names',  // string[]
  BUSINESS_NAME:    'inv_business_name',
  BUSINESS_PHONE:   'inv_business_phone',
  STORE_PHONES:     'inv_store_phones',   // { storeName: phone }
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

export function getAllProducts() {
  return get(KEYS.PRODUCT_CATALOG, {});
}

export function updateProduct(barcode, name, price) {
  const catalog = get(KEYS.PRODUCT_CATALOG, {});
  catalog[barcode] = { name, lastPrice: Number(price) };
  set(KEYS.PRODUCT_CATALOG, catalog);
}

export function deleteProduct(barcode) {
  const catalog = get(KEYS.PRODUCT_CATALOG, {});
  delete catalog[barcode];
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

// ─── Store Phones ─────────────────────────────────────────────────────────────
export function getStorePhone(storeName) {
  if (!storeName?.trim()) return '';
  const phones = get(KEYS.STORE_PHONES, {});
  return phones[storeName.trim()] || '';
}

export function saveStorePhone(storeName, phone) {
  if (!storeName?.trim()) return;
  const phones = get(KEYS.STORE_PHONES, {});
  phones[storeName.trim()] = phone.trim();
  set(KEYS.STORE_PHONES, phones);
}

// ─── Business Name ────────────────────────────────────────────────────────────
export function getBusinessName() {
  return get(KEYS.BUSINESS_NAME, '');
}

export function saveBusinessName(name) {
  set(KEYS.BUSINESS_NAME, name.trim());
}

// ─── Business Phone ───────────────────────────────────────────────────────────
export function getBusinessPhone() {
  return get(KEYS.BUSINESS_PHONE, '');
}

export function saveBusinessPhone(phone) {
  set(KEYS.BUSINESS_PHONE, phone.trim());
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

export function deleteProductName(name) {
  const names = get(KEYS.PRODUCT_NAMES, []);
  set(KEYS.PRODUCT_NAMES, names.filter(n => n !== name));
}
