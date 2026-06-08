/**
 * storage.js — centralised data helpers for InvoGo.
 *
 * Functions that touch cloud data delegate to src/lib/db.js.
 * Functions that touch device-only preferences (business name, pinned stores,
 * dark mode) still use localStorage directly — they are not worth a DB table.
 *
 * IMPORTANT: invoice/product/store functions are now async.
 * Callers that previously called these synchronously must be updated to await them.
 */

import * as db from '../services/db';
import { notifySyncError } from './syncNotify';

// ─── Keys (localStorage only — device preferences) ───────────────────────────
const KEYS = {
  BUSINESS_NAME:    'inv_business_name',
  BUSINESS_PHONE:   'inv_business_phone',
  PINNED_STORES:    'inv_pinned_stores',
  PRODUCT_NAMES:    'inv_product_names',  // autocomplete cache (derived from DB)
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('localStorage write failed', e);
  }
}

// ─── Invoice Number ───────────────────────────────────────────────────────────

/**
 * Returns the next invoice number from the cloud (max existing + 1, min 1001).
 * @returns {Promise<number>}
 */
export async function getNextInvoiceNumber() {
  const { data, error } = await db.getNextInvoiceNumber();
  if (error) {
    console.error('getNextInvoiceNumber error', error);
    // Fallback to localStorage counter for offline support
    const current = lsGet('inv_number', 1000);
    const next = current + 1;
    lsSet('inv_number', next);
    return next;
  }
  return data;
}

/**
 * Returns what the next invoice number would be (read-only). Used for display.
 * @returns {Promise<number>}
 */
export async function peekInvoiceNumber() {
  const { data } = await db.getNextInvoiceNumber();
  return data ?? (lsGet('inv_number', 1000) + 1);
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

/**
 * Save an invoice to Supabase, falling back to localStorage if not authenticated.
 * @param {object} invoice
 * @returns {Promise<void>}
 */
export async function saveInvoice(invoice) {
  const { error } = await db.saveInvoice(invoice);

  // Mirror the invoice into the localStorage cache regardless of outcome so the
  // local copy always matches what we attempted to persist (including
  // customerName and paymentMethod). On error this is the offline fallback;
  // on success it keeps the cache in sync with the cloud.
  const list = lsGet('inv_list', []);
  const idx = list.findIndex(i => (i.number || i.invoice_number) === invoice.number);
  if (idx >= 0) list[idx] = invoice; else list.unshift(invoice);
  lsSet('inv_list', list);

  if (error) {
    console.warn('saveInvoice: cloud save failed, using localStorage fallback', error);
    notifySyncError('Invoice saved on this device but could not sync to the cloud. It will retry when your connection is restored.');
  }
  return { error };
}

/**
 * Returns all invoices, newest first.
 * Falls back to localStorage on error (offline support).
 * @returns {Promise<object[]>}
 */
export async function getInvoices() {
  const { data, error } = await db.getInvoices();
  if (error || !data) {
    console.warn('getInvoices falling back to localStorage', error);
    return lsGet('inv_list', []);
  }
  return data;
}

/**
 * Delete an invoice by invoice number.
 * Removes from localStorage first (so offline deletes persist), then syncs to cloud.
 * @param {number} number
 * @returns {Promise<void>}
 */
export async function deleteInvoice(number) {
  // Local-first: remove immediately so the delete survives offline
  const list = lsGet('inv_list', []);
  lsSet('inv_list', list.filter(i => (i.number || i.invoice_number) !== number));
  // Best-effort cloud delete
  const { error } = await db.deleteInvoice(number);
  if (error) console.error('deleteInvoice error', error);
}

/**
 * Update payment status of an invoice.
 * Updates localStorage immediately so offline changes survive, then syncs to cloud.
 * @param {number} number
 * @param {string} status
 * @returns {Promise<void>}
 */
export async function updateInvoicePaymentStatus(number, status) {
  // Local-first: update the cache so the change survives offline
  const list = lsGet('inv_list', []);
  const updated = list.map(i =>
    (i.number || i.invoice_number) === number
      ? { ...i, paymentStatus: status, payment_status: status }
      : i
  );
  lsSet('inv_list', updated);
  // Best-effort cloud sync
  const { error } = await db.updateInvoicePaymentStatus(number, status);
  if (error) console.error('updateInvoicePaymentStatus error', error);
}

// ─── Product Catalog ──────────────────────────────────────────────────────────

/**
 * Look up a product by barcode.
 * Falls back to localStorage cache on error.
 * @param {string} barcode
 * @returns {Promise<{name:string,lastPrice:number}|null>}
 */
export async function getProductByBarcode(barcode) {
  const { data, error } = await db.getProductByBarcode(barcode);
  if (error) {
    // offline fallback
    const catalog = lsGet('inv_catalog', {});
    return catalog[barcode] || null;
  }
  return data;
}

/**
 * Case-insensitive product name search.
 * @param {string} name
 * @returns {Promise<{name:string,lastPrice:number}|null>}
 */
export async function getProductByName(name) {
  if (!name?.trim()) return null;
  const { data, error } = await db.getProductByName(name);
  if (error) {
    // offline fallback
    const catalog = lsGet('inv_catalog', {});
    const lower = name.trim().toLowerCase();
    return Object.values(catalog).find(p => p.name.toLowerCase() === lower) || null;
  }
  return data;
}

/**
 * Upsert a product in the cloud catalog, falling back to localStorage if not authenticated.
 * @param {string} barcode
 * @param {string} name
 * @param {number} price
 * @returns {Promise<void>}
 */
export async function saveProductBarcode(barcode, name, price) {
  const { error } = await db.saveProductBarcode(barcode, name, price);
  if (error) {
    console.warn('saveProductBarcode: cloud save failed, using localStorage fallback', error);
    const catalog = lsGet('inv_catalog', {});
    catalog[barcode] = { name, lastPrice: Number(price) };
    lsSet('inv_catalog', catalog);
  }
}

/**
 * Returns the full product catalog as { barcode: { name, lastPrice } }.
 * Falls back to localStorage cache on error.
 * @returns {Promise<Object.<string,{name:string,lastPrice:number}>>}
 */
export async function getAllProducts() {
  const { data, error } = await db.getAllProducts();
  if (error || !data) {
    console.warn('getAllProducts falling back to localStorage', error);
    return lsGet('inv_catalog', {});
  }
  return data;
}

/**
 * Update an existing product.
 * @param {string} barcode
 * @param {string} name
 * @param {number|string} price
 * @returns {Promise<void>}
 */
export async function updateProduct(barcode, name, price) {
  const { error } = await db.updateProduct(barcode, name, price);
  if (error) {
    const catalog = lsGet('inv_catalog', {});
    catalog[barcode] = { name, lastPrice: Number(price) };
    lsSet('inv_catalog', catalog);
  }
}

/**
 * Delete a product by barcode.
 * @param {string} barcode
 * @returns {Promise<void>}
 */
export async function deleteProduct(barcode) {
  // Always remove from localStorage first (local source of truth).
  // Supabase delete may silently no-op when unauthenticated (RLS) so we
  // cannot rely on an error to trigger the local delete.
  const catalog = lsGet('inv_catalog', {});
  delete catalog[barcode];
  lsSet('inv_catalog', catalog);

  // Best-effort cloud delete; log but don't re-throw.
  const { error } = await db.deleteProduct(barcode);
  if (error) console.error('deleteProduct remote error', error);
}

/**
 * Clear all products for the current user.
 * @returns {Promise<void>}
 */
export async function clearAllProducts() {
  const { error } = await db.clearAllProducts();
  if (error) console.error('clearAllProducts error', error);
  lsSet('inv_product_names', []);
}

// ─── Store Names ──────────────────────────────────────────────────────────────

/**
 * Returns string[] of store names.
 * Falls back to localStorage on error.
 * @returns {Promise<string[]>}
 */
export async function getStoreNames() {
  const { data, error } = await db.getStoreNames();
  if (error || !data) {
    console.warn('getStoreNames falling back to localStorage', error);
    return lsGet('inv_stores', []);
  }
  return data;
}

/**
 * Upsert a store name, falling back to localStorage if not authenticated.
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function saveStoreName(name) {
  if (!name?.trim()) return;
  const { error } = await db.saveStoreName(name);
  if (error) {
    console.warn('saveStoreName: cloud save failed, using localStorage fallback', error);
    const stores = lsGet('inv_stores', []);
    if (!stores.includes(name.trim())) stores.unshift(name.trim());
    lsSet('inv_stores', stores);
  }
}

// ─── Store Phones ─────────────────────────────────────────────────────────────

/**
 * Returns the phone for a store.
 * @param {string} storeName
 * @returns {Promise<string>}
 */
export async function getStorePhone(storeName) {
  const { data, error } = await db.getStorePhone(storeName);
  if (error) {
    const phones = lsGet('inv_store_phones', {});
    return phones[storeName?.trim()] || '';
  }
  return data;
}

/**
 * Upsert store phone.
 * @param {string} storeName
 * @param {string} phone
 * @returns {Promise<void>}
 */
export async function saveStorePhone(storeName, phone) {
  const { error } = await db.saveStorePhone(storeName, phone);
  if (error) console.error('saveStorePhone error', error);
}

// ─── Store Addresses ──────────────────────────────────────────────────────────

/**
 * Returns the address for a store.
 * @param {string} storeName
 * @returns {Promise<string>}
 */
export async function getStoreAddress(storeName) {
  const { data, error } = await db.getStoreAddress(storeName);
  if (error) {
    const addrs = lsGet('inv_store_addrs', {});
    return addrs[storeName?.trim()] || '';
  }
  return data;
}

/**
 * Upsert store address.
 * @param {string} storeName
 * @param {string} address
 * @returns {Promise<void>}
 */
export async function saveStoreAddress(storeName, address) {
  const { error } = await db.saveStoreAddress(storeName, address);
  if (error) console.error('saveStoreAddress error', error);
}

// ─── Store Details (combined phone + address) ────────────────────────────────

/**
 * Fetches both phone and address for a store in ONE query.
 * Falls back to separate localStorage keys if Supabase fails.
 * @param {string} storeName
 * @returns {Promise<{phone:string, address:string}>}
 */
export async function getStoreDetails(storeName) {
  const { data, error } = await db.getStoreDetails(storeName);
  if (error) {
    const phones = lsGet('inv_store_phones', {});
    const addrs  = lsGet('inv_store_addrs',  {});
    const key    = storeName?.trim();
    return { phone: phones[key] || '', address: addrs[key] || '' };
  }
  return data;
}

/**
 * Upserts both phone and address for a store in ONE query.
 * @param {string} storeName
 * @param {string} phone
 * @param {string} address
 * @returns {Promise<void>}
 */
export async function saveStoreDetails(storeName, phone, address) {
  const { error } = await db.saveStoreDetails(storeName, phone, address);
  if (error) console.error('saveStoreDetails error', error);
}

// ─── Pinned Stores — localStorage (UI preference) ────────────────────────────

export function getPinnedStores() {
  return lsGet(KEYS.PINNED_STORES, []);
}

export function togglePinnedStore(storeName) {
  if (!storeName?.trim()) return [];
  const pinned = lsGet(KEYS.PINNED_STORES, []);
  const idx = pinned.indexOf(storeName.trim());
  if (idx >= 0) pinned.splice(idx, 1);
  else pinned.unshift(storeName.trim());
  lsSet(KEYS.PINNED_STORES, pinned);
  return [...pinned];
}

export function isStorePinned(storeName) {
  if (!storeName?.trim()) return false;
  return lsGet(KEYS.PINNED_STORES, []).includes(storeName.trim());
}

// ─── Business Name / Phone — localStorage (single-user config) ───────────────

export function getBusinessName() {
  return lsGet(KEYS.BUSINESS_NAME, '');
}

export function saveBusinessName(name) {
  lsSet(KEYS.BUSINESS_NAME, name.trim());
}

export function getBusinessPhone() {
  return lsGet(KEYS.BUSINESS_PHONE, '');
}

export function saveBusinessPhone(phone) {
  lsSet(KEYS.BUSINESS_PHONE, phone.trim());
}

// ─── Product Name History (autocomplete cache) ────────────────────────────────
// Derived from products table; local list is a fast cache for autocomplete UI.

export function getProductNames() {
  return lsGet(KEYS.PRODUCT_NAMES, []);
}

export function saveProductName(name) {
  if (!name?.trim()) return;
  const names = lsGet(KEYS.PRODUCT_NAMES, []);
  const trimmed = name.trim();
  if (!names.includes(trimmed)) {
    names.unshift(trimmed);
    if (names.length > 200) names.pop();
    lsSet(KEYS.PRODUCT_NAMES, names);
  }
}

export function deleteProductName(name) {
  const names = lsGet(KEYS.PRODUCT_NAMES, []);
  lsSet(KEYS.PRODUCT_NAMES, names.filter(n => n !== name));
}
