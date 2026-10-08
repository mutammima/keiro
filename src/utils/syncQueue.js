/**
 * syncQueue.js — offline outbox (retry queue) for authenticated users.
 *
 * The app is local-first: every mutation writes localStorage immediately, then
 * best-effort to Supabase. When the cloud write fails (offline, transient
 * network, expired token), the storage layer calls enqueueSync() to park a
 * retryable description of the operation in localStorage under `inv_sync_queue`.
 *
 * processSyncQueue() replays parked actions in FIFO order against Supabase,
 * removing each on success. A failure stops the round, and how it counts
 * depends on what kind it was:
 *   • unreachable (offline, timeout, dropped connection, expired session):
 *     never counts — the change waits as long as it takes;
 *   • rejected by the server (a SQLSTATE code: permissions, bad data): counts,
 *     and after MAX_RETRIES the change moves to the set-aside list
 *     (`inv_sync_failed`) so the rest of the queue can go on. Set-aside changes
 *     are kept, surfaced by SyncAttentionBanner, and retryFailedSyncs() puts
 *     them back. Nothing is ever deleted unsaved.
 * It runs on the `online` event, on app foreground, on a 60s interval while
 * online, and once on startup (see SyncQueueRunner).
 *
 * Guests have no cloud target (their data migrates on sign-up), so enqueueSync
 * is a no-op for them — nothing to retry.
 *
 * Replays are safe to repeat: every db.* op here is an upsert or a delete, so
 * running the whole queue in order always converges to the correct final state
 * (no de-duplication needed).
 */

import * as db from '../services/db';
import { STORAGE_KEYS } from './constants';
import { isGuest } from './guestMode';
import { notifySyncSuccess } from './syncNotify';
import { writeLocal, markSignatureSynced } from './storageRoom';

const KEY = STORAGE_KEYS.SYNC_QUEUE;
const FAILED_KEY = STORAGE_KEYS.SYNC_FAILED;
const MAX_RETRIES = 5;

/** Fired whenever the set-aside list changes (SyncAttentionBanner listens). */
export const SYNC_ATTENTION_EVENT = 'inv-sync-attention';

/**
 * Did the server answer and refuse, or did the request never get an answer?
 * Only a refusal can be "permanent": it carries a Postgres SQLSTATE or a
 * PostgREST code. Codes that still mean "couldn't get through" — connection
 * (08), transaction rollback/deadlock (40), resources (53), operator
 * intervention incl. statement timeout (57), system (58), PostgREST's
 * "database not reachable" group (PGRST0xx, e.g. while the project resumes)
 * and its JWT errors (PGRST3xx) — count as unreachable, as does anything
 * without a code ("Failed to fetch", "Not authenticated").
 */
function isRejection(err) {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (!code) return false;
  if (/^PGRST[03]/.test(code)) return false;
  if (/^(08|40|53|57|58)/.test(code)) return false;
  return true;
}

// ── Each action type maps to the db.* call that performs it ───────────────────
const HANDLERS = {
  save_invoice:            (p) => db.saveInvoice(p.invoice),
  delete_invoice:          (p) => db.deleteInvoice(p.number),
  update_payment_status:   (p) => db.updateInvoicePaymentStatus(p.number, p.status),
  save_payment:            (p) => db.saveInvoicePayment(p.payment),
  delete_payment:          (p) => db.deleteInvoicePayment(p.paymentId),
  save_order:              (p) => db.saveSOOrder(p.order),
  update_order_status:     (p) => db.updateSOOrderStatus(p.id, p.status),
  delete_order:            (p) => db.deleteSOOrder(p.id),
  save_connection_order:   (p) => db.saveConnectionOrder(p.order),
  update_connection_order: (p) => db.updateConnectionOrder(p.id, { status: p.status, invoiceNumber: p.invoiceNumber, receivedConfirmed: p.receivedConfirmed, receivedQuantity: p.receivedQuantity, receivingNotes: p.receivingNotes }),
  // Catalog + store details
  save_product:            (p) => db.saveProductBarcode(p.barcode, p.name, p.price),
  update_product:          (p) => db.updateProduct(p.barcode, p.name, p.price),
  delete_product:          (p) => db.deleteProduct(p.barcode),
  save_store_name:         (p) => db.saveStoreName(p.name),
  save_store_phone:        (p) => db.saveStorePhone(p.storeName, p.phone),
  save_store_address:      (p) => db.saveStoreAddress(p.storeName, p.address),
  save_store_details:      (p) => db.saveStoreDetails(p.storeName, p.phone, p.address),
  clear_payments:          (p) => db.clearInvoicePayments(p.number),
  // SO drivers + bridge requests
  save_driver:             (p) => db.saveSODriver(p.driver),
  delete_driver:           (p) => db.deleteSODriver(p.id),
  save_bridge:             (p) => db.saveBridgeRequest(p.req),
  delete_bridge:           (p) => db.deleteBridgeRequest(p.id),
  // Signatures replay from what the phone holds at replay time, not from a
  // payload: the newest one wins, a cleared one is deleted, and 20-60 KB
  // images aren't copied into the queue. Upsert or delete, so convergent.
  sync_signature:          (p) => {
    let sig = null;
    try { sig = JSON.parse(localStorage.getItem(STORAGE_KEYS.SIG_PREFIX + p.invoiceNumber) || 'null'); } catch { /* unreadable → treat as cleared */ }
    if (!(sig && (sig.seller || sig.buyer))) return db.deleteSignatureRow(p.invoiceNumber);
    return db.saveSignatureRow({ invoiceNumber: p.invoiceNumber, seller: sig.seller || null, buyer: sig.buyer || null })
      .then((res) => {
        // The cloud now has this exact version: makeRoom may drop the local copy.
        if (!res?.error) markSignatureSynced(p.invoiceNumber, sig.updatedAt);
        return res;
      });
  },
  // NOTE: clearAllProducts (an unscoped bulk wipe) is intentionally NOT queued —
  // replaying it after the user re-adds products would delete them, breaking the
  // upsert/delete-only convergence guarantee this queue relies on.
};

function readList(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function writeList(key, list) {
  return writeLocal(key, JSON.stringify(list));
}
const read  = () => readList(KEY);
const write = (q) => writeList(KEY, q);

function announceAttention() {
  try { window.dispatchEvent(new CustomEvent(SYNC_ATTENTION_EVENT)); } catch { /* no DOM */ }
}
function uid() {
  return 'sq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Parks a failed cloud write for automatic retry. No-op for guests.
 * @param {{ type: string, payload?: object }} action
 * @returns {boolean} whether it was parked (false for a guest, an unknown type,
 *   or when this phone's storage is full; StorageBanner reports the last one)
 */
export function enqueueSync(action) {
  if (isGuest()) return false;                 // no cloud target — nothing to retry
  if (!action || !HANDLERS[action.type]) {
    console.error('enqueueSync: unknown action type', action?.type);
    return false;
  }
  const q = read();
  q.push({ id: uid(), type: action.type, payload: action.payload || {}, ts: Date.now(), retries: 0 });
  return write(q);
}

/** Current number of pending (un-synced) actions. */
export function getQueueLength() {
  return read().length;
}

/** Changes the server rejected MAX_RETRIES times, oldest first. */
export function getFailedSyncs() {
  return readList(FAILED_KEY);
}

/** Every change not yet in the cloud: still queued, or set aside. */
export function getUnsyncedCount() {
  return read().length + getFailedSyncs().length;
}

/**
 * "Try again": set-aside changes go back to the FRONT of the queue, retries
 * reset. A change is only ever set aside from the head, so it is older than
 * everything still queued; replaying it after them could let an old save undo
 * a newer delete of the same record.
 */
export function retryFailedSyncs() {
  const failed = getFailedSyncs();
  if (failed.length === 0) return;
  // Clear the set-aside list only once the queue holds those changes: on a
  // full phone the queue write can fail, and clearing anyway would lose them.
  if (!write([...failed.map(item => ({ ...item, retries: 0 })), ...read()])) return;
  writeList(FAILED_KEY, []);
  announceAttention();
}

let processing = false;

/**
 * Replays the queue against Supabase. Safe to call often; self-guards against
 * re-entrancy, guests, and being offline. Resolves when a round completes.
 */
export async function processSyncQueue() {
  if (processing) return;
  if (isGuest()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (read().length === 0) return;

  processing = true;
  let drained = 0;
  try {
    // Process in FIFO order. On a failure we stop the round, so later changes
    // never overtake an earlier one to the same record; the next trigger
    // (online / foreground / interval) picks up where we left off. A head item
    // the server keeps rejecting blocks the rest for at most MAX_RETRIES
    // rounds, then is set aside and the round continues past it.
    while (true) {
      const q = read();
      if (q.length === 0) break;
      const item = q[0];
      const handler = HANDLERS[item.type];

      if (!handler) {                          // unknown type from an older build — drop it
        write(q.slice(1));
        continue;
      }

      let failed = false;
      try {
        const res = await handler(item.payload);
        if (res && res.error) throw res.error;
      } catch (err) {
        const cur = read();
        const idx = cur.findIndex(x => x.id === item.id);
        const lastError = String(err?.message || err);
        if (idx < 0) {
          failed = true;
        } else if (!isRejection(err)) {
          // Unreachable: wait for the next trigger without spending a retry.
          cur[idx] = { ...cur[idx], lastError };
          write(cur);
          failed = true;
        } else {
          const retries = (cur[idx].retries || 0) + 1;
          if (retries >= MAX_RETRIES) {
            // Set aside — kept for "Try again" — and let the rest of the queue go on.
            // The set-aside list is written first, and the queue shrunk only
            // after: on a full phone the first write can fail, and the change
            // then stays queued rather than vanishing.
            if (writeList(FAILED_KEY, [...getFailedSyncs(), { ...cur[idx], retries, lastError }])) {
              cur.splice(idx, 1);
              write(cur);
              announceAttention();
              continue;
            }
          }
          cur[idx] = { ...cur[idx], retries, lastError };
          write(cur);
          failed = true;
        }
      }

      if (failed) break;                       // stop this round; keeps FIFO order
      // success — remove the head and continue
      const after = read().filter(x => x.id !== item.id);
      write(after);
      drained += 1;
    }
  } finally {
    processing = false;
  }

  if (drained > 0) notifySyncSuccess(drained);
}
