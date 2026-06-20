/**
 * storeOwnerStorage.js — localStorage helpers for the Store Owner role.
 *
 * All keys are prefixed inv_ to stay within the app's namespace.
 * Everything is synchronous (localStorage) — when Supabase integration
 * comes in a later sprint, these functions become async wrappers.
 *
 * Keys used:
 *   inv_user_role     — 'driver' | 'store_owner'
 *   inv_so_orders     — StoreOrder[]
 *   inv_so_drivers    — SODriver[]
 */

import { lsGet, lsSet } from './storage';
import { enqueueSync } from './syncQueue';
import * as db from '../services/db';

// ─── Role ─────────────────────────────────────────────────────────────────────

export function setRole(role) {
  lsSet('inv_user_role', role);
}

/**
 * Determine the role to use at app startup.
 * - If a role has been explicitly saved: use it.
 * - If the user has existing driver data (onboarding done / invoices saved):
 *   silently default to 'driver' and save it so this branch never runs again.
 * - Otherwise: return null → show the RoleSelector.
 */
export function resolveStartupRole() {
  const saved = localStorage.getItem('inv_user_role');
  if (saved !== null) {
    try { return JSON.parse(saved); } catch { return 'driver'; }
  }
  // Existing driver user — has invoice data or completed onboarding
  const isExistingUser =
    localStorage.getItem('inv_onboarding_complete') ||
    localStorage.getItem('inv_list');
  if (isExistingUser) {
    lsSet('inv_user_role', 'driver');
    return 'driver';
  }
  return null; // brand-new user — needs to pick a role
}

// ─── Orders ───────────────────────────────────────────────────────────────────
//
// StoreOrder shape:
// {
//   id: string,
//   productName: string,
//   quantity: number,
//   price: number,          // unit price; 0 when not provided
//   deliveryDate: string,   // ISO date string YYYY-MM-DD
//   driverId: string|null,
//   driverName: string,     // cached for display
//   status: 'pending'|'accepted'|'delivered'|'cancelled',
//   createdAt: string,      // ISO timestamp
//   notes: string,
// }

export function getOrders() {
  return lsGet('inv_so_orders', []);
}

export function saveOrder(order) {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === order.id);
  if (idx >= 0) orders[idx] = order;
  else orders.unshift(order);
  lsSet('inv_so_orders', orders);
  db.saveSOOrder(order)
    .then(({ error }) => {
      if (error) {
        console.error('saveSOOrder cloud error, queued for retry', error);
        enqueueSync({ type: 'save_order', payload: { order } });
      }
    })
    .catch(e => {
      console.error('saveSOOrder cloud error, queued for retry', e);
      enqueueSync({ type: 'save_order', payload: { order } });
    });
}

export function updateOrderStatus(id, status) {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx < 0) return;
  orders[idx] = { ...orders[idx], status };
  lsSet('inv_so_orders', orders);
  db.updateSOOrderStatus(id, status)
    .then(({ error }) => { if (error) { console.error('updateSOOrderStatus cloud error, queued for retry', error); enqueueSync({ type: 'update_order_status', payload: { id, status } }); } })
    .catch(e => { console.error('updateSOOrderStatus cloud error, queued for retry', e); enqueueSync({ type: 'update_order_status', payload: { id, status } }); });
}

export function deleteOrder(id) {
  lsSet('inv_so_orders', getOrders().filter(o => o.id !== id));
  db.deleteSOOrder(id)
    .then(({ error }) => { if (error) { console.error('deleteSOOrder cloud error, queued for retry', error); enqueueSync({ type: 'delete_order', payload: { id } }); } })
    .catch(e => { console.error('deleteSOOrder cloud error, queued for retry', e); enqueueSync({ type: 'delete_order', payload: { id } }); });
}

/**
 * Stages a reorder: writes the New Request form prefill (product, quantity,
 * price, driver, original notes) for a previous order, then the caller navigates
 * to 'so-request'. NewRequest reads & clears `inv_prefill` on mount (same
 * transient-prefill pattern as the invoice Duplicate flow). A connection order
 * maps to its `conn:<id>` driver option; a local order keeps its driver id.
 * @param {object} order - a previous order (connection or local).
 */
export function stageReorder(order) {
  if (!order) return;
  const driverId = order.connectionId ? `conn:${order.connectionId}` : (order.driverId || '');
  lsSet('inv_prefill', {
    reorder: true,
    productName: order.productName || '',
    quantity: order.quantity,
    price: order.price,
    driverId,
    notes: order.notes || '',
  });
}

/**
 * Fetches all orders from Supabase, syncs them to localStorage, and returns the list.
 * Components call this in a useEffect on mount.
 * @returns {Promise<StoreOrder[]>}
 */
export async function loadOrdersFromCloud() {
  const { data, error } = await db.getSOOrders();
  if (error || !data) return getOrders();
  // Map DB snake_case columns → app camelCase shape
  const orders = data.map(row => ({
    id:           row.id,
    productName:  row.product_name,
    quantity:     row.quantity,
    price:        Number(row.price) || 0,
    deliveryDate: row.delivery_date,
    driverId:     row.driver_id   || null,
    driverName:   row.driver_name || 'Unassigned',
    status:       row.status,
    notes:        row.notes       || '',
    createdAt:    row.created_at,
  }));
  lsSet('inv_so_orders', orders);
  return orders;
}

// ─── Drivers ──────────────────────────────────────────────────────────────────
//
// SODriver shape:
// {
//   id: string,
//   name: string,
//   phone: string,
//   inventory: string[],   // list of product names they carry
// }

export function getDrivers() {
  return lsGet('inv_so_drivers', []);
}

export function saveDriver(driver) {
  const drivers = getDrivers();
  const idx = drivers.findIndex(d => d.id === driver.id);
  if (idx >= 0) drivers[idx] = driver;
  else drivers.unshift(driver);
  lsSet('inv_so_drivers', drivers);
  db.saveSODriver(driver)
    .then(({ error }) => { if (error) console.error('saveSODriver cloud error', error); })
    .catch(e => console.error('saveSODriver cloud error', e));
}

export function deleteDriver(id) {
  lsSet('inv_so_drivers', getDrivers().filter(d => d.id !== id));
  db.deleteSODriver(id)
    .then(({ error }) => { if (error) console.error('deleteSODriver cloud error', error); })
    .catch(e => console.error('deleteSODriver cloud error', e));
}

/**
 * Fetches all drivers from Supabase, syncs to localStorage, returns the list.
 * @returns {Promise<SODriver[]>}
 */
export async function loadDriversFromCloud() {
  const { data, error } = await db.getSODrivers();
  if (error || !data) return getDrivers();
  const drivers = data.map(row => ({
    id:        row.id,
    name:      row.name,
    phone:     row.phone     || '',
    inventory: Array.isArray(row.inventory) ? row.inventory : [],
  }));
  lsSet('inv_so_drivers', drivers);
  return drivers;
}

// ─── Driver Bridge (SO → Driver invoice pre-fill) ─────────────────────────────
//
// When a Store Owner accepts an order, they can push a "bridge request" into a
// queue that the Driver sees as a banner in Invoice History.  The driver taps it
// to open a pre-filled New Invoice form, reviews it, and generates the invoice.
//
// BridgeRequest shape:
// {
//   id: string,
//   productName: string,
//   quantity: number,
//   notes: string,
//   orderId: string,      // source SO order id
//   bridgedAt: string,    // ISO timestamp
// }

export function bridgeOrderToDriver(order) {
  const req = {
    id: `br_${Date.now()}`,
    productName: order.productName,
    quantity: order.quantity,
    notes: order.notes || '',
    orderId: order.id,
    bridgedAt: new Date().toISOString(),
  };
  // Local-first so the request survives offline / same-device immediately…
  const requests = lsGet('inv_bridge_requests', []);
  requests.unshift(req);
  lsSet('inv_bridge_requests', requests);
  // …then push to the cloud so the Driver role sees it on any device.
  db.saveBridgeRequest(req)
    .then(({ error }) => { if (error) console.error('saveBridgeRequest cloud error', error); })
    .catch(e => console.error('saveBridgeRequest cloud error', e));
}

export function getBridgeRequests() {
  return lsGet('inv_bridge_requests', []);
}

/**
 * Fetches bridge requests from Supabase (the source of truth), syncs them into
 * the localStorage cache, and returns the list. The Driver side calls this in a
 * useEffect on mount so requests created on another device appear here.
 * @returns {Promise<BridgeRequest[]>}
 */
export async function loadBridgeRequestsFromCloud() {
  const { data, error } = await db.getBridgeRequests();
  if (error || !data) return getBridgeRequests();
  const requests = data.map(row => ({
    id:          row.id,
    productName: row.product_name,
    quantity:    row.quantity,
    notes:       row.notes    || '',
    orderId:     row.order_id  || '',
    bridgedAt:   row.created_at,
  }));
  lsSet('inv_bridge_requests', requests);
  return requests;
}

export function dismissBridgeRequest(id) {
  // Local-first remove so the dismissal survives offline…
  lsSet('inv_bridge_requests', getBridgeRequests().filter(r => r.id !== id));
  // …then best-effort cloud delete so it doesn't reappear on next sync.
  db.deleteBridgeRequest(id)
    .then(({ error }) => { if (error) console.error('deleteBridgeRequest cloud error', error); })
    .catch(e => console.error('deleteBridgeRequest cloud error', e));
}
