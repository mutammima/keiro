/**
 * eventBadges.js — unread counts for cross-account events, shown as small
 * bubbles on the role tab strip.
 *
 * Read-tracking model: each badge key stores a "last seen" timestamp in
 * localStorage; the badge counts cross-account items newer than that marker.
 * Markers are seeded to "now" the first time the app runs with this feature so
 * a backlog of pre-existing orders/invoices doesn't light everything up at once.
 *
 * Counts come from the localStorage caches the tab pages already keep fresh
 * (inv_conn_orders, inv_shared_invoices), so no extra fetch is needed beyond the
 * background refresh App kicks off on mount.
 */

import { lsGet, lsSet } from './storage';
import { getConnectionOrders, getSharedInvoices } from './connectionOrderStorage';

const SEEN_PREFIX = 'inv_seen_';

// Badge keys ARE tab page ids, so App can map counts straight onto TopNav.
export const BADGE_KEYS = ['route', 'so-invoices', 'so-orders'];

function seenStorageKey(key) { return `${SEEN_PREFIX}${key}`; }
function lastSeen(key) { return Number(lsGet(seenStorageKey(key), 0)) || 0; }
function ts(v) { return Date.parse(v || '') || 0; }

/** Seed any missing marker to now so the first run starts from a clean slate. */
export function ensureBadgesInitialized() {
  const now = Date.now();
  BADGE_KEYS.forEach(key => {
    if (lsGet(seenStorageKey(key), null) === null) lsSet(seenStorageKey(key), now);
  });
}

/** Mark a tab's events as seen — clears its badge. */
export function markSeen(key) {
  if (BADGE_KEYS.includes(key)) lsSet(seenStorageKey(key), Date.now());
}

// ── Per-tab counts ─────────────────────────────────────────────────────────────

/** Driver Route: incoming connection orders that arrived after last seen. */
function routeCount() {
  const seen = lastSeen('route');
  return getConnectionOrders().filter(o =>
    (o.status === 'pending' || o.status === 'accepted') && ts(o.createdAt) > seen
  ).length;
}

/** Store Invoices: shared invoices from drivers received after last seen. */
function soInvoicesCount() {
  const seen = lastSeen('so-invoices');
  return getSharedInvoices().filter(inv => ts(inv.createdAt) > seen).length;
}

/** Store Orders: connection orders delivered (status updated) after last seen. */
function soOrdersCount() {
  const seen = lastSeen('so-orders');
  return getConnectionOrders().filter(o =>
    o.status === 'delivered' && ts(o.updatedAt) > seen
  ).length;
}

/**
 * Badge counts keyed by tab id for the given role. Irrelevant tabs are absent.
 * @param {'driver'|'store_owner'} role
 * @returns {Record<string, number>}
 */
export function computeBadges(role) {
  if (role === 'store_owner') {
    return { 'so-invoices': soInvoicesCount(), 'so-orders': soOrdersCount() };
  }
  return { route: routeCount() };
}
