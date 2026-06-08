/**
 * migration.js — one-time data migration from localStorage to Supabase.
 *
 * Call `runMigrationIfNeeded()` after a user first signs in.
 * The function checks for the `inv_migrated` flag in localStorage before
 * doing any work — it is safe to call on every app start.
 */

import * as db from './db';

const MIGRATION_FLAG = 'inv_migrated';

// ── Helpers ───────────────────────────────────────────────────────────────────

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// ── Main migration function ───────────────────────────────────────────────────

/**
 * Checks localStorage for existing data and, if found and not yet migrated,
 * uploads everything to Supabase.
 *
 * Only runs once per device (guarded by `inv_migrated` localStorage flag).
 *
 * @returns {Promise<{
 *   ran: boolean,
 *   invoicesMigrated: number,
 *   productsMigrated: number,
 *   storesMigrated: number,
 *   errors: string[]
 * }>}
 */
export async function runMigrationIfNeeded() {
  // Already migrated — skip
  if (localStorage.getItem(MIGRATION_FLAG) === 'true') {
    return { ran: false, invoicesMigrated: 0, productsMigrated: 0, storesMigrated: 0, errors: [] };
  }

  const invoiceList = lsGet('inv_list', []);

  // No local data to migrate
  if (!invoiceList || invoiceList.length === 0) {
    localStorage.setItem(MIGRATION_FLAG, 'true');
    return { ran: false, invoicesMigrated: 0, productsMigrated: 0, storesMigrated: 0, errors: [] };
  }

  const errors = [];
  let invoicesMigrated = 0;
  let productsMigrated = 0;
  let storesMigrated = 0;

  // ── Migrate invoices ───────────────────────────────────────────────────────
  for (const inv of invoiceList) {
    try {
      const { error } = await db.saveInvoice(inv);
      if (error) {
        errors.push(`Invoice #${inv.number}: ${error.message || JSON.stringify(error)}`);
      } else {
        invoicesMigrated++;
      }
    } catch (e) {
      errors.push(`Invoice #${inv.number}: ${e.message}`);
    }
  }

  // ── Migrate product catalog ────────────────────────────────────────────────
  const catalog = lsGet('inv_catalog', {});
  for (const [barcode, product] of Object.entries(catalog)) {
    try {
      const { error } = await db.saveProductBarcode(barcode, product.name, product.lastPrice || 0);
      if (error) {
        errors.push(`Product ${barcode}: ${error.message || JSON.stringify(error)}`);
      } else {
        productsMigrated++;
      }
    } catch (e) {
      errors.push(`Product ${barcode}: ${e.message}`);
    }
  }

  // ── Migrate stores (names + phones + addresses) ───────────────────────────
  const storeNames  = lsGet('inv_stores', []);
  const storePhones = lsGet('inv_store_phones', {});
  const storeAddrs  = lsGet('inv_store_addrs', {});

  for (const name of storeNames) {
    try {
      const { error } = await db.saveStoreName(name);
      if (error) {
        errors.push(`Store "${name}": ${error.message || JSON.stringify(error)}`);
        continue;
      }

      // Phone
      const phone = storePhones[name];
      if (phone) await db.saveStorePhone(name, phone);

      // Address
      const addr = storeAddrs[name];
      if (addr) await db.saveStoreAddress(name, addr);

      storesMigrated++;
    } catch (e) {
      errors.push(`Store "${name}": ${e.message}`);
    }
  }

  // ── Mark migration complete ───────────────────────────────────────────────
  // Only flag the migration done when EVERYTHING succeeded. If any item failed,
  // leave the flag unset so the migration retries on next load — otherwise the
  // failed rows would be stranded in localStorage and never reach the cloud.
  if (errors.length === 0) {
    localStorage.setItem(MIGRATION_FLAG, 'true');
  } else {
    console.error(
      `[Migration] ${errors.length} item(s) failed — leaving migration flag unset so it retries on next load. Failed items:`,
      errors
    );
  }

  return { ran: true, invoicesMigrated, productsMigrated, storesMigrated, errors };
}
