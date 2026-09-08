/**
 * syncQueue.test.js
 *
 * Cover for the offline outbox (src/utils/syncQueue.js) — the module that
 * decides whether a mutation the cloud rejected is eventually saved, retried,
 * or silently thrown away.
 *
 * WHY THIS FILE EXISTS: syncQueue is the one module in the app where a bug
 * destroys user data rather than misrendering it. It replays parked mutations
 * against Supabase, and its correctness rests on an invariant stated only in a
 * comment at the top of the module:
 *
 *   "every db.* op here is an upsert or a delete, so running the whole queue in
 *    order always converges to the correct final state (no de-duplication)"
 *
 * That invariant is load-bearing and was enforced by nothing. If someone adds a
 * non-idempotent handler — a bulk wipe, an increment, an append — replaying the
 * queue after a transient outage deletes or duplicates real records. The module
 * already documents one near-miss: `clearAllProducts` is deliberately NOT
 * queued, because replaying it after the user re-adds products would delete
 * them. Nothing stopped the next person from adding it.
 *
 * So the tests below are in two groups:
 *   1. Behaviour — FIFO, retry accounting, the MAX_RETRIES drop, offline and
 *      guest no-ops, re-entrancy.
 *   2. The invariant itself — convergence under replay, every action type the
 *      app actually enqueues is handled, and bulk-wipe types stay rejected.
 *
 * The cloud boundary (services/db.js) is mocked throughout; this exercises
 * queue logic, not a real Supabase round-trip.
 *
 * Environment: jsdom (localStorage + navigator.onLine + window events).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Every db.* function reachable from a HANDLERS entry. Defaults to success;
// individual tests override the one they care about.
vi.mock('../services/db', () => {
  const ok = () => vi.fn(async () => ({ error: null }));
  return {
    saveInvoice: ok(),
    deleteInvoice: ok(),
    updateInvoicePaymentStatus: ok(),
    saveInvoicePayment: ok(),
    deleteInvoicePayment: ok(),
    saveSOOrder: ok(),
    updateSOOrderStatus: ok(),
    deleteSOOrder: ok(),
    saveConnectionOrder: ok(),
    updateConnectionOrder: ok(),
    saveProductBarcode: ok(),
    updateProduct: ok(),
    deleteProduct: ok(),
    saveStoreName: ok(),
    saveStorePhone: ok(),
    saveStoreAddress: ok(),
    saveStoreDetails: ok(),
    clearInvoicePayments: ok(),
    saveSODriver: ok(),
    deleteSODriver: ok(),
    saveBridgeRequest: ok(),
    deleteBridgeRequest: ok(),
  };
});

vi.mock('../utils/syncNotify', () => ({
  notifySyncError: vi.fn(),
  notifySyncSuccess: vi.fn(),
}));

import * as db from '../services/db';
import { notifySyncError, notifySyncSuccess } from '../utils/syncNotify';
import { enqueueSync, getQueueLength, processSyncQueue } from '../utils/syncQueue.js';

const QUEUE_KEY = 'inv_sync_queue';
const GUEST_KEY = 'inv_guest_mode';

/** The raw queue as persisted, for asserting on retry counters. */
function rawQueue() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
}

/** Force navigator.onLine, which jsdom leaves as `true` by default. */
function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setOnline(true);
  // Restore success behaviour — mockImplementation from a prior test survives
  // clearAllMocks (which only clears calls, not implementations).
  for (const fn of Object.values(db)) {
    if (typeof fn?.mockImplementation === 'function') fn.mockImplementation(async () => ({ error: null }));
  }
});

afterEach(() => setOnline(true));

// ── 1. Behaviour ─────────────────────────────────────────────────────────────

describe('syncQueue — enqueue', () => {
  it('parks a known action and reports the queue length', () => {
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1001 } } });
    expect(getQueueLength()).toBe(1);
    expect(rawQueue()[0]).toMatchObject({ type: 'save_invoice', retries: 0 });
  });

  it('is a no-op for guests — they have no cloud target to retry against', () => {
    localStorage.setItem(GUEST_KEY, 'true'); // written raw, not JSON — see guestMode.js
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1001 } } });
    expect(getQueueLength()).toBe(0);
  });

  it('refuses an unknown action type rather than parking something unreplayable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    enqueueSync({ type: 'not_a_real_action', payload: {} });
    expect(getQueueLength()).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('syncQueue — replay', () => {
  it('replays in FIFO order and drains the queue on success', async () => {
    const order = [];
    db.saveInvoice.mockImplementation(async (inv) => { order.push(`save:${inv.number}`); return { error: null }; });
    db.deleteInvoice.mockImplementation(async (n) => { order.push(`delete:${n}`); return { error: null }; });

    enqueueSync({ type: 'save_invoice',   payload: { invoice: { number: 1 } } });
    enqueueSync({ type: 'save_invoice',   payload: { invoice: { number: 2 } } });
    enqueueSync({ type: 'delete_invoice', payload: { number: 1 } });

    await processSyncQueue();

    expect(order).toEqual(['save:1', 'save:2', 'delete:1']);
    expect(getQueueLength()).toBe(0);
    expect(notifySyncSuccess).toHaveBeenCalledWith(3);
  });

  it('treats a returned {error} as a failure, not just a thrown exception', async () => {
    // db.* helpers resolve with { error } rather than rejecting — the module
    // converts that into a throw. If it stopped doing so, failed writes would
    // be silently dropped from the queue as if they had succeeded.
    db.saveInvoice.mockResolvedValue({ error: new Error('RLS denied') });
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1 } } });

    await processSyncQueue();

    expect(getQueueLength()).toBe(1);          // still parked, not lost
    expect(rawQueue()[0].retries).toBe(1);
    expect(notifySyncSuccess).not.toHaveBeenCalled();
  });

  it('stops the round at the first failure so one outage does not burn every item\'s retries', async () => {
    db.saveInvoice.mockResolvedValue({ error: new Error('offline') });

    enqueueSync({ type: 'save_invoice',   payload: { invoice: { number: 1 } } });
    enqueueSync({ type: 'delete_invoice', payload: { number: 2 } });

    await processSyncQueue();

    expect(rawQueue()[0].retries).toBe(1);
    expect(rawQueue()[1].retries).toBe(0);     // never attempted this round
    expect(db.deleteInvoice).not.toHaveBeenCalled();
    expect(getQueueLength()).toBe(2);
  });

  it('drops an action after MAX_RETRIES and tells the user it may need redoing', async () => {
    db.saveInvoice.mockResolvedValue({ error: new Error('permanent') });
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1 } } });

    // MAX_RETRIES is 5; each round burns exactly one retry on the head item.
    for (let i = 0; i < 4; i++) {
      await processSyncQueue();
      expect(getQueueLength()).toBe(1);
    }
    expect(rawQueue()[0].retries).toBe(4);
    expect(notifySyncError).not.toHaveBeenCalled();

    await processSyncQueue();                  // 5th failure — give up

    expect(getQueueLength()).toBe(0);
    expect(notifySyncError).toHaveBeenCalledTimes(1);
    expect(notifySyncError).toHaveBeenCalledWith(expect.stringContaining('could not be saved'));
  });

  it('records the last error while retrying, for diagnosis', async () => {
    db.saveInvoice.mockResolvedValue({ error: new Error('token expired') });
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1 } } });

    await processSyncQueue();

    expect(rawQueue()[0].lastError).toContain('token expired');
  });

  it('drops an unknown type left by an older build instead of wedging the queue', async () => {
    // Written directly: enqueueSync would refuse this type today, but a build
    // that once knew it could have persisted it before an upgrade removed it.
    localStorage.setItem(QUEUE_KEY, JSON.stringify([
      { id: 'sq_old', type: 'retired_action', payload: {}, ts: Date.now(), retries: 0 },
      { id: 'sq_new', type: 'save_invoice', payload: { invoice: { number: 1 } }, ts: Date.now(), retries: 0 },
    ]));

    await processSyncQueue();

    expect(getQueueLength()).toBe(0);          // stale head discarded, real work still ran
    expect(db.saveInvoice).toHaveBeenCalledTimes(1);
  });

  it('does nothing while offline — the queue is preserved for the next trigger', async () => {
    setOnline(false);
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1 } } });

    await processSyncQueue();

    expect(db.saveInvoice).not.toHaveBeenCalled();
    expect(getQueueLength()).toBe(1);
  });

  it('does nothing for guests', async () => {
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1 } } });
    localStorage.setItem(GUEST_KEY, 'true');

    await processSyncQueue();

    expect(db.saveInvoice).not.toHaveBeenCalled();
    expect(getQueueLength()).toBe(1);
  });

  it('guards against re-entrancy so overlapping triggers cannot double-send', async () => {
    // SyncQueueRunner fires on online + foreground + a 60s interval + startup,
    // so two calls genuinely can overlap. Without the guard the same head item
    // is sent twice.
    let release;
    const gate = new Promise(r => { release = r; });
    db.saveInvoice.mockImplementation(async () => { await gate; return { error: null }; });

    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1 } } });

    const first = processSyncQueue();
    await processSyncQueue();                  // returns immediately — already processing
    release();
    await first;

    expect(db.saveInvoice).toHaveBeenCalledTimes(1);
    expect(getQueueLength()).toBe(0);
  });
});

// ── 2. The convergence invariant ─────────────────────────────────────────────

describe('syncQueue — replay-convergence invariant', () => {
  it('converges to the same final state when the whole queue is replayed twice', async () => {
    // The module skips de-duplication entirely, on the grounds that every op is
    // an upsert or a delete. This is that claim, exercised: the same sequence
    // applied twice against a stand-in cloud must leave identical state.
    const cloud = new Map();
    db.saveInvoice.mockImplementation(async (inv) => { cloud.set(inv.number, { ...inv }); return { error: null }; });
    db.deleteInvoice.mockImplementation(async (n) => { cloud.delete(n); return { error: null }; });
    db.updateInvoicePaymentStatus.mockImplementation(async (n, status) => {
      if (cloud.has(n)) cloud.set(n, { ...cloud.get(n), status });
      return { error: null };
    });

    const actions = [
      { type: 'save_invoice',          payload: { invoice: { number: 1, total: 10 } } },
      { type: 'save_invoice',          payload: { invoice: { number: 2, total: 20 } } },
      { type: 'update_payment_status', payload: { number: 2, status: 'paid' } },
      { type: 'delete_invoice',        payload: { number: 1 } },
    ];

    actions.forEach(enqueueSync);
    await processSyncQueue();
    const afterFirst = JSON.stringify([...cloud.entries()].sort());

    actions.forEach(enqueueSync);              // the whole round, replayed
    await processSyncQueue();
    const afterSecond = JSON.stringify([...cloud.entries()].sort());

    expect(afterSecond).toBe(afterFirst);
    expect(cloud.has(1)).toBe(false);          // delete stayed applied
    expect(cloud.get(2)).toMatchObject({ number: 2, status: 'paid' });
  });

  it('handles every action type the app actually enqueues', () => {
    // Derived from the enqueueSync({ type: ... }) call sites across src/utils.
    // A type the storage layer parks but HANDLERS does not know is dropped on
    // the floor at replay time — the mutation is simply lost, with no error.
    const ENQUEUED_BY_THE_APP = [
      'save_invoice', 'delete_invoice', 'update_payment_status',
      'save_payment', 'delete_payment', 'clear_payments',
      'save_order', 'update_order_status', 'delete_order',
      'save_connection_order', 'update_connection_order',
      'save_product', 'update_product', 'delete_product',
      'save_store_name', 'save_store_phone', 'save_store_address', 'save_store_details',
      'save_driver', 'delete_driver',
      'save_bridge', 'delete_bridge',
    ];

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const type of ENQUEUED_BY_THE_APP) {
      localStorage.removeItem(QUEUE_KEY);
      enqueueSync({ type, payload: {} });
      expect(getQueueLength(), `${type} is enqueued by the app but not handled by syncQueue`).toBe(1);
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('still refuses bulk-wipe actions, which replay cannot make safe', () => {
    // clearAllProducts is excluded on purpose: replaying an unscoped wipe after
    // the user re-adds products would delete them, breaking convergence. If a
    // future change registers a handler under any of these names, this fails.
    const UNSAFE = ['clear_all_products', 'clearAllProducts', 'delete_all_invoices', 'wipe_products'];
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (const type of UNSAFE) {
      localStorage.removeItem(QUEUE_KEY);
      enqueueSync({ type, payload: {} });
      expect(getQueueLength(), `${type} must not be queueable — replay would destroy data`).toBe(0);
    }
    spy.mockRestore();
  });
});
