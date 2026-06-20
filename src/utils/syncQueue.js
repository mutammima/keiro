/**
 * syncQueue.js — offline outbox (retry queue) for authenticated users.
 *
 * The app is local-first: every mutation writes localStorage immediately, then
 * best-effort to Supabase. When the cloud write fails (offline, transient
 * network, expired token), the storage layer calls enqueueSync() to park a
 * retryable description of the operation in localStorage under `inv_sync_queue`.
 *
 * processSyncQueue() replays parked actions in FIFO order against Supabase,
 * removing each on success and incrementing a retry counter on failure. After
 * MAX_RETRIES failed attempts an action is dropped and the user is told it could
 * not be saved. It runs on the `online` event, on app foreground, on a 60s
 * interval while online, and once on startup (see SyncQueueRunner).
 *
 * Guests have no cloud target (their data migrates on sign-up), so enqueueSync
 * is a no-op for them — nothing to retry.
 *
 * Replays are safe to repeat: every db.* op here is an upsert or a delete, so
 * running the whole queue in order always converges to the correct final state
 * (no de-duplication needed).
 */

import * as db from '../services/db';
import { isGuest } from './guestMode';
import { notifySyncError, notifySyncSuccess } from './syncNotify';

const KEY = 'inv_sync_queue';
const MAX_RETRIES = 5;

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
  // NOTE: clearAllProducts (an unscoped bulk wipe) is intentionally NOT queued —
  // replaying it after the user re-adds products would delete them, breaking the
  // upsert/delete-only convergence guarantee this queue relies on.
};

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function write(q) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch (e) { console.error('syncQueue write failed', e); }
}
function uid() {
  return 'sq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Parks a failed cloud write for automatic retry. No-op for guests.
 * @param {{ type: string, payload?: object }} action
 */
export function enqueueSync(action) {
  if (isGuest()) return;                       // no cloud target — nothing to retry
  if (!action || !HANDLERS[action.type]) {
    console.error('enqueueSync: unknown action type', action?.type);
    return;
  }
  const q = read();
  q.push({ id: uid(), type: action.type, payload: action.payload || {}, ts: Date.now(), retries: 0 });
  write(q);
}

/** Current number of pending (un-synced) actions. */
export function getQueueLength() {
  return read().length;
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
    // Process in FIFO order. On the first failure we stop the round so a single
    // outage doesn't burn a retry on every queued item — the next trigger
    // (online / foreground / interval) picks up where we left off.
    // Known edge: a permanently-failing head item blocks the rest until it
    // gives up after MAX_RETRIES (then the queue continues next round).
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
        failed = true;
        const cur = read();
        const idx = cur.findIndex(x => x.id === item.id);
        if (idx >= 0) {
          const retries = (cur[idx].retries || 0) + 1;
          if (retries >= MAX_RETRIES) {
            cur.splice(idx, 1);
            write(cur);
            notifySyncError('A change could not be saved to the cloud after several tries and may need to be redone.');
          } else {
            cur[idx] = { ...cur[idx], retries, lastError: String(err?.message || err) };
            write(cur);
          }
        }
      }

      if (failed) break;                       // stop this round (likely offline / transient)
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
