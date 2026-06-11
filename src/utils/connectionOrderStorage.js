/**
 * connectionOrderStorage.js — orders that travel ACROSS accounts over an
 * active driver ↔ store connection (table: connection_orders).
 *
 * Unlike same-account data, these rows are only useful once they reach the
 * cloud — the other party lives on a different account. Writes are still
 * local-first so the sender's own list renders instantly, but a failed cloud
 * write surfaces a sync-error toast instead of failing silently.
 *
 * ConnectionOrder shape (camelCase):
 * {
 *   id, connectionId, storeUserId, driverUserId, storeName, driverName,
 *   productName, quantity, price, deliveryDate, notes,
 *   status: 'pending'|'accepted'|'delivered'|'cancelled',
 *   invoiceNumber, createdAt, updatedAt
 * }
 *
 * Keys:
 *   inv_conn_orders       — ConnectionOrder[] (local cache)
 *   inv_conn_order_active — { id, ts } order being filled into an invoice;
 *                           completed (status→delivered) on invoice generate.
 */

import { lsGet, lsSet } from './storage';
import { notifySyncError } from './syncNotify';
import { getActiveConnections } from './connectionStorage';
import * as db from '../services/db';

const KEY        = 'inv_conn_orders';
const ACTIVE_KEY = 'inv_conn_order_active';

// An order parked behind ACTIVE_KEY goes stale after 30 minutes — if the
// driver abandons the prefilled invoice, a later unrelated invoice must not
// silently mark the order delivered.
const ACTIVE_TTL_MS = 30 * 60 * 1000;

export function getConnectionOrders() {
  return lsGet(KEY, []);
}

function upsertLocal(order) {
  const list = getConnectionOrders().filter(o => o.id !== order.id);
  list.unshift(order);
  lsSet(KEY, list);
}

function mapRow(row) {
  return {
    id:            row.id,
    connectionId:  row.connection_id,
    storeUserId:   row.store_user_id,
    driverUserId:  row.driver_user_id,
    storeName:     row.store_name  || '',
    driverName:    row.driver_name || '',
    productName:   row.product_name,
    quantity:      Number(row.quantity) || 1,
    price:         Number(row.price)    || 0,
    deliveryDate:  row.delivery_date || '',
    notes:         row.notes || '',
    status:        row.status,
    invoiceNumber: row.invoice_number ?? null,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

/** Pull the user's connection orders from the cloud and refresh the cache. */
export async function loadConnectionOrdersFromCloud() {
  const { data, error } = await db.getConnectionOrders();
  if (error || !data) return getConnectionOrders();
  const mapped = data.map(mapRow);
  lsSet(KEY, mapped);
  return mapped;
}

/**
 * Store side: send an order to a connected driver. `conn` is an ACTIVE
 * connection from connectionStorage (carries both user ids).
 */
export async function sendConnectionOrder(conn, { productName, quantity, price, deliveryDate, notes, storeName, driverName }) {
  const order = {
    id:            `co_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    connectionId:  conn.id,
    storeUserId:   conn.storeUserId,
    driverUserId:  conn.driverUserId,
    storeName:     storeName  || '',
    driverName:    driverName || '',
    productName,
    quantity:      Number(quantity) || 1,
    price:         Number(price)    || 0,
    deliveryDate:  deliveryDate || '',
    notes:         notes || '',
    status:        'pending',
    invoiceNumber: null,
    createdAt:     new Date().toISOString(),
    updatedAt:     new Date().toISOString(),
  };
  upsertLocal(order);
  const { error } = await db.saveConnectionOrder(order);
  if (error) {
    console.error('saveConnectionOrder cloud error', error);
    notifySyncError('Order saved on this device but has not reached your driver yet. It will not be visible to them until you are back online and signed in.');
  }
  return order;
}

/** Patch status (+ optional invoice number) locally, then best-effort cloud. */
export function updateConnectionOrderStatus(id, status, { invoiceNumber } = {}) {
  const list = getConnectionOrders();
  const idx = list.findIndex(o => o.id === id);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      status,
      ...(invoiceNumber != null ? { invoiceNumber } : {}),
      updatedAt: new Date().toISOString(),
    };
    lsSet(KEY, list);
  }
  db.updateConnectionOrder(id, { status, invoiceNumber })
    .then(({ error }) => { if (error) console.error('updateConnectionOrder cloud error', error); })
    .catch(e => console.error('updateConnectionOrder cloud error', e));
}

// ── Invoice hand-off (driver side) ─────────────────────────────────────────────

/** Park an order id while the driver fills the prefilled invoice. */
export function setActiveConnectionOrder(id) {
  lsSet(ACTIVE_KEY, { id, ts: Date.now() });
}

/**
 * Invoice generated: if a parked order is still fresh, flip it to 'delivered'
 * with the invoice number so the store sees the loop close. Always clears.
 */
export function completeActiveConnectionOrder(invoiceNumber) {
  const parked = lsGet(ACTIVE_KEY, null);
  try { localStorage.removeItem(ACTIVE_KEY); } catch {}
  if (!parked || !parked.id) return;
  if (Date.now() - (parked.ts || 0) > ACTIVE_TTL_MS) return; // stale — ignore
  updateConnectionOrderStatus(parked.id, 'delivered', { invoiceNumber });
}

/**
 * The connected store account a new invoice should be shared with, or null.
 *
 * Resolution order, strongest signal first:
 *   1. The parked connection order — its storeUserId came straight from the
 *      connection, so this is an exact, unambiguous link.
 *   2. A typed store name that matches EXACTLY ONE active connection by the
 *      store-side display name. If two connected stores share a name (or none
 *      match) we return null rather than guess — a wrong stamp would expose the
 *      driver's invoice to the wrong store account, so we'd rather not share at
 *      all than share with the wrong party.
 */
export function resolveConnectedStoreUserId(storeName) {
  const parked = lsGet(ACTIVE_KEY, null);
  if (parked?.id) {
    const o = getConnectionOrders().find(x => x.id === parked.id);
    if (o?.storeUserId) return o.storeUserId;
  }
  const target = (storeName || '').trim().toLowerCase();
  if (!target) return null;
  const matches = getActiveConnections().filter(c => {
    const name = (c.inviterRole === 'store_owner' ? c.inviterName : c.redeemerName) || '';
    return name.trim().toLowerCase() === target && c.storeUserId;
  });
  // Only stamp on an unambiguous single match.
  return matches.length === 1 ? matches[0].storeUserId : null;
}

// ── Shared invoices (store side, read-only) ────────────────────────────────────
// Invoices the connected driver stamped with this store's user id. The store
// can read them (header + items) but never edit — RLS only spans SELECT.

const SHARED_KEY = 'inv_shared_invoices';

export function getSharedInvoices() {
  return lsGet(SHARED_KEY, []);
}

/** Pull invoices addressed to this store account; refresh the local cache. */
export async function loadSharedInvoicesFromCloud() {
  const { data, error } = await db.getSharedInvoices();
  if (error || !data) return getSharedInvoices();
  const mapped = data.map(row => ({
    id:            row.id,
    number:        row.invoice_number,
    driverName:    row.business_name || 'Driver',
    driverPhone:   row.business_phone || '',
    date:          row.date,
    time:          row.time || '',
    notes:         row.notes || '',
    paymentStatus: row.payment_status || 'unpaid',
    createdAt:     row.created_at,
    updatedAt:     row.updated_at || row.created_at, // may be undefined pre-migration
    items: (row.invoice_items || []).map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })),
  }));
  lsSet(SHARED_KEY, mapped);
  return mapped;
}
