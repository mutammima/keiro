/**
 * storage.js — centralised localStorage helpers for InvoiceGo.
 * All reads and writes to localStorage go through this module.
 */

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
  STORE_ADDRESSES:  'inv_store_addrs',    // { storeName: address }
  PINNED_STORES:    'inv_pinned_stores',  // string[]
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reads a JSON-encoded value from localStorage.
 * @template T
 * @param {string} key - The localStorage key to read.
 * @param {T} fallback - Value to return if the key is missing or parse fails.
 * @returns {T} The parsed value, or `fallback`.
 */
function get(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * JSON-encodes a value and writes it to localStorage.
 * Logs to console.error if the write fails (e.g. storage quota exceeded).
 * @param {string} key - The localStorage key to write.
 * @param {*} value - Any JSON-serialisable value.
 */
function set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('localStorage write failed', e);
  }
}

// ─── Invoice Number ───────────────────────────────────────────────────────────

/**
 * Increments the stored invoice counter and returns the new number.
 * Call once per invoice generation — it mutates the stored counter.
 * @returns {number} The next invoice number.
 */
export function getNextInvoiceNumber() {
  const current = get(KEYS.INVOICE_NUMBER, 1000);
  const next = current + 1;
  set(KEYS.INVOICE_NUMBER, next);
  return next;
}

/**
 * Returns what the next invoice number *would* be, without incrementing.
 * Safe to call for display purposes.
 * @returns {number} The next invoice number (read-only).
 */
export function peekInvoiceNumber() {
  return get(KEYS.INVOICE_NUMBER, 1000) + 1;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

/**
 * Appends a new invoice object to the persisted invoice list.
 * @param {object} invoice - The invoice to save.
 */
export function saveInvoice(invoice) {
  const list = get(KEYS.INVOICES, []);
  list.push(invoice);
  set(KEYS.INVOICES, list);
}

/**
 * Returns the full list of saved invoices in creation order (oldest first).
 * @returns {object[]} Array of invoice objects.
 */
export function getInvoices() {
  return get(KEYS.INVOICES, []);
}

// ─── Product Catalog (barcode → { name, lastPrice }) ─────────────────────────

/**
 * Looks up a product in the local catalog by barcode.
 * @param {string} barcode - The barcode string.
 * @returns {{ name: string, lastPrice: number } | null} The product, or null if not found.
 */
export function getProductByBarcode(barcode) {
  const catalog = get(KEYS.PRODUCT_CATALOG, {});
  return catalog[barcode] || null;
}

/**
 * Inserts or updates a product in the catalog.
 * @param {string} barcode - The barcode key.
 * @param {string} name - Human-readable product name.
 * @param {number} price - Most recent unit price.
 */
export function saveProductBarcode(barcode, name, price) {
  const catalog = get(KEYS.PRODUCT_CATALOG, {});
  catalog[barcode] = { name, lastPrice: price };
  set(KEYS.PRODUCT_CATALOG, catalog);
}

/**
 * Returns the entire product catalog as a barcode-keyed object.
 * @returns {Object.<string, { name: string, lastPrice: number }>}
 */
export function getAllProducts() {
  return get(KEYS.PRODUCT_CATALOG, {});
}

/**
 * Updates the name and price of an existing catalog entry.
 * @param {string} barcode - The barcode key to update.
 * @param {string} name - New product name.
 * @param {number|string} price - New unit price (coerced to Number).
 */
export function updateProduct(barcode, name, price) {
  const catalog = get(KEYS.PRODUCT_CATALOG, {});
  catalog[barcode] = { name, lastPrice: Number(price) };
  set(KEYS.PRODUCT_CATALOG, catalog);
}

/**
 * Removes a product from the catalog by barcode.
 * @param {string} barcode - The barcode key to delete.
 */
export function deleteProduct(barcode) {
  const catalog = get(KEYS.PRODUCT_CATALOG, {});
  delete catalog[barcode];
  set(KEYS.PRODUCT_CATALOG, catalog);
}

/**
 * Wipes the entire product catalog and product name history.
 * This action is irreversible without a backup restore.
 */
export function clearAllProducts() {
  set(KEYS.PRODUCT_CATALOG, {});
  set(KEYS.PRODUCT_NAMES, []);
}

// ─── Store Name History ───────────────────────────────────────────────────────

/**
 * Returns the list of previously used store names (most-recent first).
 * @returns {string[]}
 */
export function getStoreNames() {
  return get(KEYS.STORE_NAMES, []);
}

/**
 * Adds a store name to the history list if it is not already present.
 * Caps the list at 50 entries (oldest entry dropped).
 * @param {string} name - Store name to record.
 */
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

/**
 * Returns the saved phone number for a store, or empty string if unknown.
 * @param {string} storeName
 * @returns {string}
 */
export function getStorePhone(storeName) {
  if (!storeName?.trim()) return '';
  const phones = get(KEYS.STORE_PHONES, {});
  return phones[storeName.trim()] || '';
}

/**
 * Associates a phone number with a store name.
 * @param {string} storeName
 * @param {string} phone
 */
export function saveStorePhone(storeName, phone) {
  if (!storeName?.trim()) return;
  const phones = get(KEYS.STORE_PHONES, {});
  phones[storeName.trim()] = phone.trim();
  set(KEYS.STORE_PHONES, phones);
}

// ─── Store Addresses ──────────────────────────────────────────────────────────

/**
 * Returns the saved address for a store, or empty string if unknown.
 * @param {string} storeName
 * @returns {string}
 */
export function getStoreAddress(storeName) {
  if (!storeName?.trim()) return '';
  const addrs = get(KEYS.STORE_ADDRESSES, {});
  return addrs[storeName.trim()] || '';
}

/**
 * Associates a street address with a store name.
 * @param {string} storeName
 * @param {string} address
 */
export function saveStoreAddress(storeName, address) {
  if (!storeName?.trim()) return;
  const addrs = get(KEYS.STORE_ADDRESSES, {});
  addrs[storeName.trim()] = address.trim();
  set(KEYS.STORE_ADDRESSES, addrs);
}

// ─── Delete Invoice ───────────────────────────────────────────────────────────

/**
 * Permanently removes an invoice from the persisted list.
 * @param {number} number - The invoice number to delete.
 */
export function deleteInvoice(number) {
  const list = get(KEYS.INVOICES, []);
  set(KEYS.INVOICES, list.filter(inv => inv.number !== number));
}

// ─── Pinned Stores ────────────────────────────────────────────────────────────

/**
 * Returns the list of pinned store names (most-recently pinned first).
 * @returns {string[]}
 */
export function getPinnedStores() {
  return get(KEYS.PINNED_STORES, []);
}

/**
 * Pins the store if it is not already pinned; unpins it if it is.
 * @param {string} storeName
 * @returns {string[]} The updated pinned-stores list.
 */
export function togglePinnedStore(storeName) {
  if (!storeName?.trim()) return [];
  const pinned = get(KEYS.PINNED_STORES, []);
  const idx = pinned.indexOf(storeName.trim());
  if (idx >= 0) pinned.splice(idx, 1);
  else pinned.unshift(storeName.trim());
  set(KEYS.PINNED_STORES, pinned);
  return [...pinned];
}

/**
 * Returns true if the given store name is currently pinned.
 * @param {string} storeName
 * @returns {boolean}
 */
export function isStorePinned(storeName) {
  if (!storeName?.trim()) return false;
  return get(KEYS.PINNED_STORES, []).includes(storeName.trim());
}

// ─── Invoice Payment Status ───────────────────────────────────────────────────

/**
 * Updates the `paymentStatus` field of a single invoice in place.
 * @param {number} number - Invoice number to update.
 * @param {string} status - One of 'unpaid' | 'paid' | 'partial'.
 */
export function updateInvoicePaymentStatus(number, status) {
  const list = get(KEYS.INVOICES, []);
  const idx = list.findIndex(inv => inv.number === number);
  if (idx !== -1) {
    list[idx] = { ...list[idx], paymentStatus: status };
    set(KEYS.INVOICES, list);
  }
}

// ─── Business Name ────────────────────────────────────────────────────────────

/**
 * Returns the saved business name, or empty string if not set.
 * @returns {string}
 */
export function getBusinessName() {
  return get(KEYS.BUSINESS_NAME, '');
}

/**
 * Persists the business name (trimmed).
 * @param {string} name
 */
export function saveBusinessName(name) {
  set(KEYS.BUSINESS_NAME, name.trim());
}

// ─── Business Phone ───────────────────────────────────────────────────────────

/**
 * Returns the saved business phone number, or empty string if not set.
 * @returns {string}
 */
export function getBusinessPhone() {
  return get(KEYS.BUSINESS_PHONE, '');
}

/**
 * Persists the business phone number (trimmed).
 * @param {string} phone
 */
export function saveBusinessPhone(phone) {
  set(KEYS.BUSINESS_PHONE, phone.trim());
}

// ─── Product Name History ─────────────────────────────────────────────────────

/**
 * Returns the list of previously used product names for autocomplete (most-recent first).
 * @returns {string[]}
 */
export function getProductNames() {
  return get(KEYS.PRODUCT_NAMES, []);
}

/**
 * Adds a product name to the history list if not already present.
 * Caps the list at 200 entries.
 * @param {string} name - Product name to record.
 */
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

/**
 * Removes a specific product name from the history list.
 * @param {string} name - Product name to remove.
 */
export function deleteProductName(name) {
  const names = get(KEYS.PRODUCT_NAMES, []);
  set(KEYS.PRODUCT_NAMES, names.filter(n => n !== name));
}
