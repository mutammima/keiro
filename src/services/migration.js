/**
 * migration.js — incremental data migration from localStorage to Supabase.
 *
 * Call `runMigrationIfNeeded()` after every sign-in / account creation.
 *
 * Instead of a one-time boolean flag, migration tracks a *timestamp* of the
 * last successful sync (`inv_migrated_at`). On each sign-in it re-checks for
 * local entries created AFTER that timestamp — this catches the case where a
 * user migrates, signs out, creates more data as a guest, then signs back in.
 * Those newer entries would otherwise be stranded forever under the old
 * boolean-flag scheme.
 *
 * All cloud writes are upserts keyed on stable ids (invoice number, order id,
 * driver id, barcode, store name), so re-running is idempotent — already-synced
 * rows are never duplicated.
 */

import * as db from './db';
import { STORAGE_KEYS, INVOICE_NUMBER_START } from '../utils/constants';
import { withoutUploadStamp } from '../utils/storageRoom';

// Legacy boolean flag (pre-timestamp scheme). Still read for backward-compat:
// a device that only has the old flag is treated as "never migrated under the
// new scheme", triggering one idempotent full re-sync that also captures any
// guest data created after the original migration.
const LEGACY_FLAG = STORAGE_KEYS.MIGRATED;
// New scheme: ISO timestamp of the last fully-successful migration.
const MIGRATED_AT = STORAGE_KEYS.MIGRATED_AT;

// ── Helpers ───────────────────────────────────────────────────────────────────

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Epoch-ms of the last successful migration, or null if we have never migrated
 * under the timestamp scheme. A device carrying only the legacy boolean flag
 * also returns null here, so it gets one idempotent full re-sync (which safely
 * picks up any post-migration guest data) before switching to incremental mode.
 */
function getLastMigratedAt() {
  try {
    const raw = localStorage.getItem(MIGRATED_AT);
    if (!raw) return null;
    const t = Date.parse(raw);
    return isNaN(t) ? null : t;
  } catch {
    return null;
  }
}

/** Record a successful migration at the current time. */
function stampMigrated() {
  try {
    localStorage.setItem(MIGRATED_AT, new Date().toISOString());
    // Keep the legacy flag set too, so any external reader still sees "migrated".
    localStorage.setItem(LEGACY_FLAG, 'true');
  } catch (e) {
    console.error('[Migration] failed to write timestamp', e);
  }
}

/** Epoch-ms of an entry's createdAt, or NaN if absent/unparseable. */
function entryTime(entry) {
  return Date.parse(entry?.createdAt || '');
}

/**
 * Saving upserts on the invoice number, so a guest invoice uploaded under a
 * number the account already uses would OVERWRITE that invoice. Gives each
 * such invoice the next free number, and moves its local payments and
 * signature with it, before anything is uploaded.
 *
 * "Already uses" means a DIFFERENT invoice: one whose creation time differs.
 * The same invoice coming back from an earlier, partial migration keeps its
 * number (its upsert is then the harmless re-save it always was).
 *
 * @param {object[]} invoiceList - the local invoices this run will upload
 * @returns {Promise<{ error: Error|null }>} error when the account's numbers
 *   could not be read; nothing is renumbered then, and the caller must not
 *   upload the invoices.
 */
async function renumberCollidingInvoices(invoiceList) {
  const { data, error } = await db.getInvoiceNumberIndex();
  if (error || !data) return { error: error || new Error('no invoice index') };

  const cloud = new Map(data.map(r => [Number(r.invoice_number), r]));
  const sameInvoice = (inv, row) => {
    const t = entryTime(inv);
    if (!isNaN(t)) return t === Date.parse(row.created_at || '');
    // Legacy invoices without a createdAt: fall back to what the invoice says.
    return (inv.storeName || '') === (row.store_name || '') && (inv.date || '') === (row.date || '');
  };

  const local = lsGet(STORAGE_KEYS.LIST, []);
  const numberOf = i => Number(i.number ?? i.invoice_number) || 0;
  let next = Math.max(
    INVOICE_NUMBER_START,
    ...cloud.keys(),
    ...local.map(numberOf),
    Number(lsGet(STORAGE_KEYS.NUMBER, 0)) || 0,
  ) + 1;

  const moves = new Map(); // old number → new number
  for (const inv of invoiceList) {
    const row = cloud.get(numberOf(inv));
    if (row && !sameInvoice(inv, row)) moves.set(numberOf(inv), next++);
  }
  if (moves.size === 0) return { error: null };

  try {
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify(local.map(inv => {
      const to = moves.get(numberOf(inv));
      if (to === undefined) return inv;
      return { ...inv, number: to, ...('invoice_number' in inv ? { invoice_number: to } : {}) };
    })));

    const payments = lsGet(STORAGE_KEYS.PAYMENTS, {});
    for (const [from, to] of moves) {
      if (payments[from]) { payments[to] = payments[from]; delete payments[from]; }
    }
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(payments));

    const index = lsGet(STORAGE_KEYS.SIG_INDEX, []);
    for (const [from, to] of moves) {
      const sig = localStorage.getItem(STORAGE_KEYS.SIG_PREFIX + from);
      if (sig === null) continue;
      // Not uploaded under its new number yet, whatever the old entry said.
      localStorage.setItem(STORAGE_KEYS.SIG_PREFIX + to, withoutUploadStamp(STORAGE_KEYS.SIG_PREFIX + to, sig));
      localStorage.removeItem(STORAGE_KEYS.SIG_PREFIX + from);
      if (Array.isArray(index)) index.splice(0, index.length, ...index.map(n => (Number(n) === from ? to : n)));
    }
    localStorage.setItem(STORAGE_KEYS.SIG_INDEX, JSON.stringify(index));

    // The next invoice made on this device must start above the moved ones.
    localStorage.setItem(STORAGE_KEYS.NUMBER, JSON.stringify(next - 1));
  } catch (e) {
    return { error: e };
  }
  return { error: null };
}

// ── Main migration function ───────────────────────────────────────────────────

/**
 * Syncs any local entries that have not yet reached Supabase.
 *
 * - First migration (no timestamp / legacy flag only): uploads everything.
 * - Subsequent sign-ins: uploads only entries created after the last successful
 *   migration — i.e. data made during a guest session after a previous sync.
 *
 * Safe to call on every sign-in. All writes are idempotent upserts.
 *
 * @returns {Promise<{
 *   ran: boolean,
 *   partial: boolean,          // true when this run synced *new* post-migration data
 *   invoicesMigrated: number,
 *   productsMigrated: number,
 *   storesMigrated: number,
 *   ordersMigrated: number,
 *   errors: string[]
 * }>}
 */
export async function runMigrationIfNeeded() {
  const lastMs   = getLastMigratedAt();     // epoch-ms or null
  const isPartial = lastMs !== null;        // false on first/legacy migration

  const allOrders   = lsGet(STORAGE_KEYS.SO_ORDERS, []);
  const allDrivers  = lsGet(STORAGE_KEYS.SO_DRIVERS, []);

  // On a partial run, only take entries created after the last migration.
  // On a first run, take everything. Entries missing a parseable createdAt are
  // only included on the first run (on later runs they were already synced).
  const isNew = (entry) => {
    if (!isPartial) return true;
    const t = entryTime(entry);
    return !isNaN(t) && t > lastMs;
  };
  // Payments timestamp under `ts`, not `createdAt`, so they need their own check.
  const isNewTs = (ts) => {
    if (!isPartial) return true;
    const t = Date.parse(ts || '');
    return !isNaN(t) && t > lastMs;
  };

  const errors = [];

  // Invoices, and the payments and signatures keyed by their numbers, upload
  // only once every number is known to be free in the account — otherwise the
  // upsert overwrites one of the account's own invoices. If the account's
  // numbers can't be read, hold all three back; the error leaves the
  // migration timestamp alone, so they retry on the next sign-in.
  let invoiceList = lsGet(STORAGE_KEYS.LIST, []).filter(isNew);
  let holdInvoiceData = false;
  if (invoiceList.length > 0) {
    const { error } = await renumberCollidingInvoices(invoiceList);
    if (error) {
      holdInvoiceData = true;
      errors.push(`Invoice numbers: could not check them against the account (${error.message || error})`);
      invoiceList = [];
    } else {
      invoiceList = lsGet(STORAGE_KEYS.LIST, []).filter(isNew); // re-read: numbers may have moved
    }
  }
  const allPayments = holdInvoiceData ? {} : lsGet(STORAGE_KEYS.PAYMENTS, {}); // { [invoiceNumber]: Payment[] }

  const soOrders    = allOrders.filter(isNew);
  const soDrivers   = allDrivers.filter(isNew);

  // Flatten the payment ledger into a list of new payments, each carrying its
  // invoice number so the cloud row can be attached to the right invoice.
  const paymentList = [];
  for (const [invoiceNumber, list] of Object.entries(allPayments)) {
    for (const p of (Array.isArray(list) ? list : [])) {
      if (isNewTs(p?.ts)) paymentList.push({ ...p, invoiceNumber: Number(invoiceNumber) });
    }
  }

  // Collect new/changed signatures (proof of delivery). Stored one per key
  // `inv_sig_<n>`; `updatedAt` (added by signatureStorage) drives incremental
  // sync — entries without it are pre-existing and only migrate on a first run.
  const signatureList = [];
  try {
    for (let i = 0; !holdInvoiceData && i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_KEYS.SIG_PREFIX)) continue;
      const sig = lsGet(key, null);
      if (!sig || (!sig.seller && !sig.buyer)) continue;
      if (!isNewTs(sig.updatedAt)) continue;
      signatureList.push({
        invoiceNumber: Number(key.slice(STORAGE_KEYS.SIG_PREFIX.length)),
        seller: sig.seller || null,
        buyer:  sig.buyer  || null,
      });
    }
  } catch { /* localStorage unavailable — skip signature migration */ }

  // Catalog/stores have no per-row timestamp. Migrate them on the first run, or
  // on a partial run whenever there are new invoices to attach them to. Upserts
  // keep this duplicate-free.
  const migrateCatalog = !isPartial || invoiceList.length > 0;

  const hasNew = invoiceList.length > 0 || soOrders.length > 0 || soDrivers.length > 0 || paymentList.length > 0 || signatureList.length > 0;

  // Nothing new to sync — record a baseline timestamp and exit. This both
  // upgrades a legacy device to the timestamp scheme and gives brand-new
  // accounts a clean starting point for future incremental checks.
  // A held-back invoice upload is not "nothing new": skip the stamp so it retries.
  if (!hasNew) {
    if (errors.length === 0) stampMigrated();
    return { ran: false, partial: false, invoicesMigrated: 0, productsMigrated: 0, storesMigrated: 0, ordersMigrated: 0, paymentsMigrated: 0, signaturesMigrated: 0, errors };
  }

  let invoicesMigrated = 0;
  let productsMigrated = 0;
  let storesMigrated = 0;
  let ordersMigrated = 0;
  let paymentsMigrated = 0;
  let signaturesMigrated = 0;

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

  // ── Migrate invoice payments ───────────────────────────────────────────────
  // The payment ledger is money data created locally — for a guest it never
  // reached the cloud (no session at log time), so without this it would be lost
  // on the first cloud load after sign-up. Upsert on the stable payment id.
  for (const p of paymentList) {
    try {
      const { error } = await db.saveInvoicePayment(p);
      if (error) {
        errors.push(`Payment ${p.id} (inv #${p.invoiceNumber}): ${error.message || JSON.stringify(error)}`);
      } else {
        paymentsMigrated++;
      }
    } catch (e) {
      errors.push(`Payment ${p.id} (inv #${p.invoiceNumber}): ${e.message}`);
    }
  }

  // ── Migrate invoice signatures ─────────────────────────────────────────────
  // Proof-of-delivery PNGs created locally (often as a guest) — sync so they
  // survive a device change. Upsert on (user, invoice) makes this idempotent.
  for (const sig of signatureList) {
    try {
      const { error } = await db.saveSignatureRow(sig);
      if (error) {
        errors.push(`Signature (inv #${sig.invoiceNumber}): ${error.message || JSON.stringify(error)}`);
      } else {
        signaturesMigrated++;
      }
    } catch (e) {
      errors.push(`Signature (inv #${sig.invoiceNumber}): ${e.message}`);
    }
  }

  // ── Migrate product catalog + stores ───────────────────────────────────────
  // These have no per-row timestamp; only sync them on a first run or alongside
  // new invoices (see `migrateCatalog`). Upserts make this duplicate-free.
  if (migrateCatalog) {
    const catalog = lsGet(STORAGE_KEYS.CATALOG, {});
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

    // ── Migrate stores (names + phones + addresses) ─────────────────────────
    const storeNames  = lsGet(STORAGE_KEYS.STORES, []);
    const storePhones = lsGet(STORAGE_KEYS.STORE_PHONES, {});
    const storeAddrs  = lsGet(STORAGE_KEYS.STORE_ADDRS, {});

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
  }

  // ── Migrate Store Owner drivers ───────────────────────────────────────────
  // Drivers first so orders that reference a driver_id resolve cleanly.
  for (const driver of soDrivers) {
    try {
      const { error } = await db.saveSODriver(driver);
      if (error) errors.push(`Driver "${driver.name}": ${error.message || JSON.stringify(error)}`);
    } catch (e) {
      errors.push(`Driver "${driver.name}": ${e.message}`);
    }
  }

  // ── Migrate Store Owner orders ────────────────────────────────────────────
  for (const order of soOrders) {
    try {
      const { error } = await db.saveSOOrder(order);
      if (error) {
        errors.push(`Order ${order.id}: ${error.message || JSON.stringify(error)}`);
      } else {
        ordersMigrated++;
      }
    } catch (e) {
      errors.push(`Order ${order.id}: ${e.message}`);
    }
  }

  // ── Stamp migration complete ──────────────────────────────────────────────
  // Only advance the timestamp when EVERYTHING succeeded. If any item failed,
  // leave the timestamp untouched so the same (and any newer) entries retry on
  // the next sign-in — otherwise failed rows would be stranded in localStorage.
  if (errors.length === 0) {
    stampMigrated();
  } else {
    console.error(
      `[Migration] ${errors.length} item(s) failed — leaving migration timestamp unchanged so it retries on next sign-in. Failed items:`,
      errors
    );
  }

  return { ran: true, partial: isPartial, invoicesMigrated, productsMigrated, storesMigrated, ordersMigrated, paymentsMigrated, signaturesMigrated, errors };
}
