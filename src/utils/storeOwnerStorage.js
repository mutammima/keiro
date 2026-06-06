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

// ─── Role ─────────────────────────────────────────────────────────────────────

export function getRole() {
  return lsGet('inv_user_role', 'driver');
}

export function setRole(role) {
  lsSet('inv_user_role', role);
}

export function isStoreOwner() {
  return getRole() === 'store_owner';
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
}

export function updateOrderStatus(id, status) {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx < 0) return;
  orders[idx] = { ...orders[idx], status };
  lsSet('inv_so_orders', orders);
}

export function deleteOrder(id) {
  lsSet('inv_so_orders', getOrders().filter(o => o.id !== id));
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
}

export function deleteDriver(id) {
  lsSet('inv_so_drivers', getDrivers().filter(d => d.id !== id));
}
