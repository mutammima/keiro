/**
 * marketplaceStorage.js — data layer for the two-sided marketplace.
 *
 * Two record types, both living in SHARED Supabase tables (any signed-in user
 * can read them; see supabase-marketplace.sql):
 *
 *   • Listing — a driver's supply: a product they carry + price + unit.
 *   • Demand  — a store's open order any driver can browse and accept.
 *
 * Mirrors the rest of the app's pattern: write localStorage first (so the UI is
 * instant and offline-tolerant), then best-effort sync to the cloud. Cross-user
 * snapshots (every driver's listings / every store's demand) are cached under
 * inv_mkt_* keys purely for offline display and are NEVER backed up.
 */

import { lsGet, lsSet } from './storage';
import * as db from '../services/db';

function uid() { return `mkt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// Cache keys (all inv_-prefixed to stay in namespace)
const K_MY_LISTINGS = 'inv_mkt_my_listings'; // this user's own published listings
const K_ALL_LISTINGS = 'inv_mkt_listings';   // cross-user snapshot for the store feed
const K_ALL_DEMAND   = 'inv_mkt_demand';     // cross-user snapshot for the driver feed

// ── Matching ────────────────────────────────────────────────────────────────

/** Normalise a product name for forgiving comparison. */
export function normProduct(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * True when two product names should be treated as the same product.
 * Forgiving: exact match after normalisation, or one contains the other
 * (so "Whole Milk" matches "Whole Milk 1 Gal").
 */
export function productMatches(a, b) {
  const x = normProduct(a);
  const y = normProduct(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

// ── My listings (driver's own supply) ────────────────────────────────────────

export function getMyListings() {
  return lsGet(K_MY_LISTINGS, []);
}

export function saveMyListing(listing) {
  const withId = listing.id ? listing : { ...listing, id: uid() };
  const list = getMyListings();
  const idx = list.findIndex(l => l.id === withId.id);
  if (idx >= 0) list[idx] = withId; else list.unshift(withId);
  lsSet(K_MY_LISTINGS, list);
  db.saveMarketplaceListing(withId).catch(e => console.error('saveMarketplaceListing cloud error', e));
  return withId;
}

export function deleteMyListing(id) {
  lsSet(K_MY_LISTINGS, getMyListings().filter(l => l.id !== id));
  db.deleteMarketplaceListing(id).catch(e => console.error('deleteMarketplaceListing cloud error', e));
}

export async function loadMyListingsFromCloud() {
  const { data, error } = await db.getMyMarketplaceListings();
  if (error || !data) return getMyListings();
  const list = data.map(mapListingRow);
  lsSet(K_MY_LISTINGS, list);
  return list;
}

// ── All listings (store-owner feed: who carries what) ────────────────────────

export function getAllListings() {
  return lsGet(K_ALL_LISTINGS, []);
}

export async function loadAllListingsFromCloud() {
  const { data, error } = await db.getMarketplaceListings();
  if (error || !data) return getAllListings();
  const list = data.map(mapListingRow);
  lsSet(K_ALL_LISTINGS, list);
  return list;
}

function mapListingRow(row) {
  return {
    id:          row.id,
    userId:      row.user_id,
    driverName:  row.driver_name  || '',
    driverPhone: row.driver_phone || '',
    productName: row.product_name || '',
    price:       Number(row.price) || 0,
    unit:        row.unit || 'each',
    active:      row.active !== false,
    lat:         row.lat != null ? Number(row.lat) : null,
    lng:         row.lng != null ? Number(row.lng) : null,
    updatedAt:   row.updated_at,
  };
}

// ── My demand (store owner publishes an open order) ──────────────────────────

export function saveMyDemand(demand) {
  const withId = demand.id ? demand : { ...demand, id: uid() };
  db.saveMarketplaceDemand(withId).catch(e => console.error('saveMarketplaceDemand cloud error', e));
  return withId;
}

// ── All demand (driver feed: stores that need things) ────────────────────────

export function getAllDemand() {
  return lsGet(K_ALL_DEMAND, []);
}

export async function loadAllDemandFromCloud() {
  const { data, error } = await db.getMarketplaceDemand();
  if (error || !data) return getAllDemand();
  const list = data.map(mapDemandRow);
  lsSet(K_ALL_DEMAND, list);
  return list;
}

/** A driver accepts an open demand. Returns true on success. */
export async function claimDemand(id, claimedName) {
  const { data, error } = await db.claimMarketplaceDemand(id, claimedName);
  if (error) { console.error('claimMarketplaceDemand error', error); return false; }
  return !!data; // null when the row was no longer open (someone else got it)
}

function mapDemandRow(row) {
  return {
    id:          row.id,
    userId:      row.user_id,
    storeName:   row.store_name  || '',
    storePhone:  row.store_phone || '',
    productName: row.product_name || '',
    quantity:    Number(row.quantity) || 1,
    targetPrice: Number(row.target_price) || 0,
    neededBy:    row.needed_by || '',
    notes:       row.notes || '',
    status:      row.status || 'open',
    claimedBy:   row.claimed_by || null,
    claimedName: row.claimed_name || '',
    lat:         row.lat != null ? Number(row.lat) : null,
    lng:         row.lng != null ? Number(row.lng) : null,
    createdAt:   row.created_at,
  };
}
