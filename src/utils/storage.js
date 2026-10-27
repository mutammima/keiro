/**
 * storage.js — centralised data helpers for Keiro.
 *
 * Functions that touch cloud data delegate to src/services/db.js.
 * Functions that touch device-only preferences (business name, pinned stores,
 * dark mode) still use localStorage directly — they are not worth a DB table.
 *
 * IMPORTANT: invoice/product/store functions are now async.
 * Callers that previously called these synchronously must be updated to await them.
 */

import * as db from '../services/db';
import { enqueueSync, forgetInvoiceUploads } from './syncQueue';
import { incrementalLoader } from './incrementalSync';
import { STORAGE_KEYS, INVOICE_NUMBER_START } from './constants';
import { writeLocal } from './storageRoom';

// ─── Keys (localStorage only — device preferences) ───────────────────────────
const KEYS = {
  BUSINESS_NAME:    STORAGE_KEYS.BUSINESS_NAME,
  BUSINESS_PHONE:   STORAGE_KEYS.BUSINESS_PHONE,
  PINNED_STORES:    STORAGE_KEYS.PINNED_STORES,
  PRODUCT_NAMES:    STORAGE_KEYS.PRODUCT_NAMES,  // autocomplete cache (derived from DB)
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

/**
 * Writes a value as JSON. Returns whether it was written: false means this
 * phone's storage is full even after freeing room (StorageBanner says so).
 * @returns {boolean}
 */
export function lsSet(key, value) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch (e) {
    console.error('lsSet: value cannot be stored', key, e);
    return false;
  }
  return writeLocal(key, text);
}

// ─── Invoice Number ───────────────────────────────────────────────────────────

/**
 * The highest invoice number this device knows is taken: the last number it
 * handed out (`inv_number`), every invoice made on it (including ones made
 * offline that haven't reached the cloud yet) and the account's cloud copy.
 * @returns {number}
 */
function highestLocalInvoiceNumber() {
  const cachedMax = [...lsGet(STORAGE_KEYS.LIST, []), ...mirrorRows()]
    .reduce((max, i) => Math.max(max, Number(i.number ?? i.invoice_number) || 0), 0);
  return Math.max(INVOICE_NUMBER_START, Number(lsGet(STORAGE_KEYS.NUMBER, 0)) || 0, cachedMax);
}

/**
 * Returns the next invoice number: above the cloud's highest (when reachable)
 * AND above every number this device has seen. Saves upsert on the number, so
 * reusing one silently overwrites that invoice — the cloud alone misses
 * invoices still queued offline, and the device alone misses the cloud's.
 * @returns {Promise<number>}
 */
export async function getNextInvoiceNumber() {
  const { data, error } = await db.getNextInvoiceNumber();
  if (error) console.error('getNextInvoiceNumber error, numbering from this device', error);
  const localNext = highestLocalInvoiceNumber() + 1;
  const next = error ? localNext : Math.max(data, localNext);
  lsSet(STORAGE_KEYS.NUMBER, next);
  return next;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

/**
 * Saves an invoice to the cloud, and to this phone's cache either way.
 * @param {object} invoice
 * @returns {Promise<{ error: object|null, savedLocally: boolean }>} savedLocally
 *   is false when this phone's storage is full; with an error as well, the
 *   invoice is nowhere and the caller must keep it on screen.
 */
export async function saveInvoice(invoice) {
  const { error } = await db.saveInvoice(invoice);

  // Mirror the invoice into the localStorage cache regardless of outcome so the
  // local copy always matches what we attempted to persist (including
  // customerName and paymentMethod). On error this is the offline fallback;
  // on success it keeps the cache in sync with the cloud.
  const list = lsGet(STORAGE_KEYS.LIST, []);
  const idx = list.findIndex(i => (i.number || i.invoice_number) === invoice.number);
  if (idx >= 0) list[idx] = invoice; else list.unshift(invoice);
  const savedLocally = lsSet(STORAGE_KEYS.LIST, list);
  patchMirror(rows => [invoice, ...rows.filter(i => numberOf(i) !== invoice.number)]);

  if (error) {
    console.warn('saveInvoice: cloud save failed, queued for retry', error);
    enqueueSync({ type: 'save_invoice', payload: { invoice } });
  }
  return { error, savedLocally };
}

const numberOf = inv => inv.number ?? inv.invoice_number;

// The account's invoices as the cloud has them, kept apart from inv_list:
// inv_list holds invoices made on this phone, and migration uploads it on
// sign-in, so cloud copies stored there would be re-uploaded over newer edits,
// and a guest's invoices overwritten before migration reads them.
function mirrorRows() {
  const m = lsGet(STORAGE_KEYS.INVOICE_MIRROR, null);
  return Array.isArray(m?.rows) ? m.rows : [];
}

// Applies this phone's own write to the cloud copy at once, so screens see it
// before the next refresh (or while the refresh can't reach the cloud).
function patchMirror(fn) {
  const m = lsGet(STORAGE_KEYS.INVOICE_MIRROR, null);
  if (Array.isArray(m?.rows)) lsSet(STORAGE_KEYS.INVOICE_MIRROR, { ...m, rows: fn(m.rows) });
}

// Changes not yet in the cloud are the phone's truth until they upload: a
// pending save shows the phone's copy (or the invoice itself, if the cloud has
// never seen it), a pending delete keeps it gone, and a pending payment status
// stays. "Pending" is queued, set aside (rejected MAX_RETRIES times) or held
// for the free plan's limit. They apply oldest first: set-aside and held
// changes left the head of the queue, so they are older than all still queued
// (syncQueue.retryFailedSyncs / releaseHeldSyncs rely on the same order).
// A save shows inv_list's copy when it has one: that is the newest version,
// with any edit or status made since the save was queued.
function pendingInvoiceChanges() {
  const phone = new Map();
  const list = lsGet(STORAGE_KEYS.LIST, []);
  if (Array.isArray(list)) for (const inv of list) phone.set(numberOf(inv), inv);
  const saves = new Map();
  const deletes = new Set();
  const statuses = new Map();
  for (const key of [STORAGE_KEYS.SYNC_FAILED, STORAGE_KEYS.SYNC_HELD, STORAGE_KEYS.SYNC_QUEUE]) {
    const items = lsGet(key, []);
    for (const item of Array.isArray(items) ? items : []) {
      const p = item?.payload || {};
      if (item?.type === 'save_invoice' && p.invoice?.number != null) {
        const n = p.invoice.number;
        saves.set(n, phone.get(n) ?? p.invoice); deletes.delete(n); statuses.delete(n);
      } else if (item?.type === 'delete_invoice' && p.number != null) {
        deletes.add(p.number); saves.delete(p.number); statuses.delete(p.number);
      } else if (item?.type === 'update_payment_status' && p.number != null) {
        statuses.set(p.number, p.status);
      }
    }
  }
  return { saves, deletes, statuses };
}

function withPendingChanges(rows) {
  const { saves, deletes, statuses } = pendingInvoiceChanges();
  const shown = rows
    .filter(inv => !deletes.has(numberOf(inv)))
    .map(inv => saves.get(numberOf(inv)) ?? inv);
  const onServer = new Set(rows.map(numberOf));
  for (const [number, inv] of saves) if (!onServer.has(number)) shown.push(inv);
  return shown
    .map(inv => (statuses.has(numberOf(inv))
      ? { ...inv, paymentStatus: statuses.get(numberOf(inv)), payment_status: statuses.get(numberOf(inv)) }
      : inv))
    .sort(newestFirst);
}

// Newest first by when it was made (cloud rows carry created_at, the phone's
// copies createdAt). An invoice with no date goes first rather than to the
// bottom, where it would read as lost.
function newestFirst(a, b) {
  const t = inv => Date.parse(inv.createdAt ?? inv.created_at ?? '');
  const ta = t(a), tb = t(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.isNaN(tb) - Number.isNaN(ta);
  return tb - ta;
}

const loadInvoices = incrementalLoader({
  key: STORAGE_KEYS.INVOICE_MIRROR,
  owner: () => db.getCurrentUserId(),
  full: () => db.getInvoices(),
  ids: () => db.getInvoiceNumberIndex(),
  changedSince: since => db.getInvoicesChangedSince(since),
  idOf: numberOf,
  rowIdOf: row => row.invoice_number,
  view: withPendingChanges,
  absentOnPurpose: number => pendingInvoiceChanges().deletes.has(number),
  // No cloud copy for this account yet (a guest, or offline since before the
  // first download): the invoices made on this phone, as before the mirror.
  fallback: rows => {
    console.warn('getInvoices falling back to localStorage');
    return rows ? withPendingChanges(rows) : lsGet(STORAGE_KEYS.LIST, []);
  },
});

/**
 * Returns all of this account's invoices, newest first, and keeps a copy of
 * them on the phone (inv_invoice_mirror) for when the cloud can't be reached.
 * Downloads everything once per launch, then only changes (see
 * utils/incrementalSync.js); screens that ask at the same moment share one
 * request. A guest, or an account with no copy yet, gets inv_list.
 * @returns {Promise<object[]>}
 */
export function getInvoices() {
  return loadInvoices();
}

/**
 * Delete an invoice by invoice number.
 * Removes from localStorage first (so offline deletes persist), then syncs to cloud.
 * @param {number} number
 * @returns {Promise<void>}
 */
export async function deleteInvoice(number) {
  // Local-first: remove immediately so the delete survives offline
  const list = lsGet(STORAGE_KEYS.LIST, []);
  lsSet(STORAGE_KEYS.LIST, list.filter(i => (i.number || i.invoice_number) !== number));
  patchMirror(rows => rows.filter(i => numberOf(i) !== number));
  // Nothing left to upload for it, whether the save is queued, set aside or held.
  forgetInvoiceUploads(number);
  // Best-effort cloud delete. A failure (offline, a dropped connection) queues a
  // delete_invoice for the sync queue to replay; until it goes through,
  // getInvoices keeps the invoice hidden over the cloud copy that survives.
  const { error } = await db.deleteInvoice(number);
  if (error) {
    console.error('deleteInvoice cloud error, queued for retry', error);
    enqueueSync({ type: 'delete_invoice', payload: { number } });
  }
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
  const list = lsGet(STORAGE_KEYS.LIST, []);
  const updated = list.map(i =>
    (i.number || i.invoice_number) === number
      ? { ...i, paymentStatus: status, payment_status: status }
      : i
  );
  lsSet(STORAGE_KEYS.LIST, updated);
  patchMirror(rows => rows.map(i => (numberOf(i) === number ? { ...i, paymentStatus: status, payment_status: status } : i)));
  // Best-effort cloud sync — a silent failure here reverts the status on the
  // next cloud load (and the store side never sees the change), so surface it.
  const { error } = await db.updateInvoicePaymentStatus(number, status);
  if (error) {
    console.error('updateInvoicePaymentStatus cloud error, queued for retry', error);
    enqueueSync({ type: 'update_payment_status', payload: { number, status } });
  }
}

// ─── Product Catalog ──────────────────────────────────────────────────────────

/**
 * Look up a product by barcode: the cloud catalog first, then this phone's.
 * The phone's catalog is checked whenever the cloud has no row, not only on an
 * error — a guest's query doesn't fail, RLS just returns nothing, and a product
 * saved offline isn't in the cloud until the sync queue uploads it.
 * @param {string} barcode
 * @returns {Promise<{name:string,lastPrice:number}|null>}
 */
export async function getProductByBarcode(barcode) {
  const { data } = await db.getProductByBarcode(barcode);
  if (data) return data;
  const catalog = lsGet(STORAGE_KEYS.CATALOG, {});
  return catalog[barcode] || null;
}

/**
 * Case-insensitive product name search: the cloud catalog first, then this
 * phone's (see getProductByBarcode for why).
 * @param {string} name
 * @returns {Promise<{name:string,lastPrice:number}|null>}
 */
export async function getProductByName(name) {
  if (!name?.trim()) return null;
  const { data } = await db.getProductByName(name);
  if (data) return data;
  const catalog = lsGet(STORAGE_KEYS.CATALOG, {});
  const lower = name.trim().toLowerCase();
  return Object.values(catalog).find(p => p.name.toLowerCase() === lower) || null;
}

/**
 * What other Keiro drivers call this barcode, trimmed — or null (not shared
 * yet, guest, offline, or the cloud function isn't there). Never throws.
 * @param {string} barcode
 * @returns {Promise<string|null>}
 */
export async function getSharedProductName(barcode) {
  const { data } = await db.getSharedProductName(barcode);
  return typeof data === 'string' && data.trim() ? data.trim() : null;
}

/**
 * Product names other drivers use that contain `query`, trimmed, blanks
 * dropped. [] on any problem. Never throws.
 * @param {string} query
 * @returns {Promise<string[]>}
 */
export async function getSharedProductSuggestions(query) {
  const { data } = await db.suggestProductNames(query);
  return Array.isArray(data) ? data.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim()) : [];
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
    const catalog = lsGet(STORAGE_KEYS.CATALOG, {});
    catalog[barcode] = { name, lastPrice: Number(price) };
    lsSet(STORAGE_KEYS.CATALOG, catalog);
    enqueueSync({ type: 'save_product', payload: { barcode, name, price } });
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
    return lsGet(STORAGE_KEYS.CATALOG, {});
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
    const catalog = lsGet(STORAGE_KEYS.CATALOG, {});
    catalog[barcode] = { name, lastPrice: Number(price) };
    lsSet(STORAGE_KEYS.CATALOG, catalog);
    enqueueSync({ type: 'update_product', payload: { barcode, name, price } });
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
  const catalog = lsGet(STORAGE_KEYS.CATALOG, {});
  delete catalog[barcode];
  lsSet(STORAGE_KEYS.CATALOG, catalog);

  // Best-effort cloud delete; log + queue for retry on failure.
  const { error } = await db.deleteProduct(barcode);
  if (error) {
    console.error('deleteProduct remote error, queued for retry', error);
    enqueueSync({ type: 'delete_product', payload: { barcode } });
  }
}

/**
 * Clear all products for the current user.
 * @returns {Promise<void>}
 */
export async function clearAllProducts() {
  const { error } = await db.clearAllProducts();
  if (error) console.error('clearAllProducts error', error);
  lsSet(STORAGE_KEYS.PRODUCT_NAMES, []);
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
    return lsGet(STORAGE_KEYS.STORES, []);
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
    const stores = lsGet(STORAGE_KEYS.STORES, []);
    if (!stores.includes(name.trim())) stores.unshift(name.trim());
    lsSet(STORAGE_KEYS.STORES, stores);
    enqueueSync({ type: 'save_store_name', payload: { name } });
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
    const phones = lsGet(STORAGE_KEYS.STORE_PHONES, {});
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
  if (error) {
    console.error('saveStorePhone error, queued for retry', error);
    enqueueSync({ type: 'save_store_phone', payload: { storeName, phone } });
  }
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
    const addrs = lsGet(STORAGE_KEYS.STORE_ADDRS, {});
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
  if (error) {
    console.error('saveStoreAddress error, queued for retry', error);
    enqueueSync({ type: 'save_store_address', payload: { storeName, address } });
  }
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
    const phones = lsGet(STORAGE_KEYS.STORE_PHONES, {});
    const addrs  = lsGet(STORAGE_KEYS.STORE_ADDRS,  {});
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
  if (error) {
    console.error('saveStoreDetails error, queued for retry', error);
    enqueueSync({ type: 'save_store_details', payload: { storeName, phone, address } });
  }
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

