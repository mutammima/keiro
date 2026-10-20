/**
 * migrationHeld.test.js
 *
 * A guest's invoices upload when they make an account (migration.js). If the
 * account is already at its monthly cap the server refuses them with
 * KEIRO_FREE_LIMIT. That refusal used to end in nowhere: no queue entry, so
 * getUnsyncedCount didn't count it and sign-out deleted the invoice without a
 * warning. Such an invoice must be held exactly like a refused queued sync, so
 * it counts as unsynced and goes up with Pro or next month.
 *
 * The cloud boundary (services/db.js) is mocked; localStorage is jsdom's.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/db', () => {
  const ok = () => vi.fn(async () => ({ error: null }));
  return {
    getInvoiceNumberIndex: vi.fn(async () => ({ data: [], error: null })),
    saveInvoice: vi.fn(),
    saveInvoicePayment: ok(),
    saveSignatureRow: ok(),
    saveProductBarcode: ok(),
    saveStoreName: ok(),
    saveStorePhone: ok(),
    saveStoreAddress: ok(),
    saveSODriver: ok(),
    saveSOOrder: ok(),
  };
});

import * as db from '../services/db';
import { runMigrationIfNeeded } from '../services/migration';
import {
  enqueueSync, processSyncQueue, getHeldSyncs, getFailedSyncs, getQueueLength, getUnsyncedCount,
  pendingInvoiceNumbers, releaseHeldSyncs, SYNC_ATTENTION_EVENT,
} from '../utils/syncQueue';
import { STORAGE_KEYS } from '../utils/constants';
import { utcMonth } from '../utils/invoiceUtils';

const LIMIT = { code: 'P0001', message: 'KEIRO_FREE_LIMIT' };
const guest = (number) => ({ number, storeName: `Store ${number}`, createdAt: '2026-10-01T09:00:00.000Z', items: [] });
const set = (key, value) => localStorage.setItem(key, JSON.stringify(value));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(db.saveInvoice).mockReset();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('a guest invoice the server refuses for the free limit', () => {
  it('is held, not lost: it counts as unsynced and the migration is not an error', async () => {
    set(STORAGE_KEYS.LIST, [guest(1030), guest(1031)]);
    db.saveInvoice.mockResolvedValueOnce({ error: LIMIT }).mockResolvedValueOnce({ error: null });
    const heard = vi.fn();
    window.addEventListener(SYNC_ATTENTION_EVENT, heard);
    const result = await runMigrationIfNeeded();
    window.removeEventListener(SYNC_ATTENTION_EVENT, heard);

    expect(result.errors).toEqual([]);
    expect(result.invoicesMigrated).toBe(1); // only the one that really is in the cloud
    expect(getHeldSyncs()).toHaveLength(1);
    expect(getHeldSyncs()[0]).toMatchObject({
      type: 'save_invoice', payload: { invoice: { number: 1030 } }, retries: 0, lastError: 'KEIRO_FREE_LIMIT', heldUtcMonth: utcMonth(),
    });
    expect(getQueueLength()).toBe(0);
    expect(getFailedSyncs()).toEqual([]);
    expect(getUnsyncedCount()).toBe(1); // sign-out warns about it
    expect([...pendingInvoiceNumbers()]).toEqual([1030]); // and every screen still lists it
    expect(heard).toHaveBeenCalled(); // the banner says so
    expect(localStorage.getItem(STORAGE_KEYS.MIGRATED_AT)).not.toBeNull(); // nothing to retry: the held list owns it now
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.LIST)).map(i => i.number)).toEqual([1030, 1031]);
  });

  it('is exactly the entry a refused queued sync becomes', async () => {
    set(STORAGE_KEYS.LIST, [guest(1030)]);
    db.saveInvoice.mockResolvedValue({ error: LIMIT });
    await runMigrationIfNeeded();
    const fromMigration = getHeldSyncs()[0];

    localStorage.removeItem(STORAGE_KEYS.SYNC_HELD);
    enqueueSync({ type: 'save_invoice', payload: { invoice: guest(1030) } });
    await processSyncQueue();
    const fromQueue = getHeldSyncs()[0];

    expect(Object.keys(fromMigration).sort()).toEqual(Object.keys(fromQueue).sort());
    expect(fromMigration.payload).toEqual(fromQueue.payload);
    expect({ ...fromMigration, id: 0, ts: 0 }).toEqual({ ...fromQueue, id: 0, ts: 0 });
  });

  it('goes up once the account is Pro (or the month turns)', async () => {
    set(STORAGE_KEYS.LIST, [guest(1030)]);
    db.saveInvoice.mockResolvedValueOnce({ error: LIMIT });
    await runMigrationIfNeeded();
    expect(db.saveInvoice).toHaveBeenCalledTimes(1);

    db.saveInvoice.mockResolvedValue({ error: null });
    releaseHeldSyncs(); // what a fresh Pro answer does
    await processSyncQueue();
    expect(db.saveInvoice).toHaveBeenCalledTimes(2);
    expect(db.saveInvoice.mock.calls[1][0]).toMatchObject({ number: 1030 });
    expect(getUnsyncedCount()).toBe(0);
  });

  it('a retried migration holds it once, not once per sign-in', async () => {
    set(STORAGE_KEYS.LIST, [guest(1030), guest(1031)]);
    db.saveInvoice.mockImplementation(async (inv) => (inv.number === 1030 ? { error: LIMIT } : { error: new Error('fetch failed') }));
    await runMigrationIfNeeded(); // 1031 failed for another reason: the migration will run again
    expect(localStorage.getItem(STORAGE_KEYS.MIGRATED_AT)).toBeNull();
    await runMigrationIfNeeded();
    expect(getHeldSyncs().map(h => h.payload.invoice.number)).toEqual([1030]);
    expect(getUnsyncedCount()).toBe(1);
  });
});

describe('what is still an error', () => {
  let quiet;
  beforeEach(() => { quiet = [vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})]; });
  afterEach(() => quiet.forEach(s => s.mockRestore()));

  it('any other refusal is reported and held back for the next sign-in, not held', async () => {
    set(STORAGE_KEYS.LIST, [guest(1030)]);
    db.saveInvoice.mockResolvedValue({ error: { code: '42501', message: 'permission denied for table invoices' } });
    const result = await runMigrationIfNeeded();
    expect(result.errors).toHaveLength(1);
    expect(getHeldSyncs()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.MIGRATED_AT)).toBeNull();
  });

  it('a phone too full to hold it keeps the error, so the next sign-in tries again', async () => {
    set(STORAGE_KEYS.LIST, [guest(1030)]);
    db.saveInvoice.mockResolvedValue({ error: LIMIT });
    const realSetItem = Storage.prototype.setItem;
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === STORAGE_KEYS.SYNC_HELD) throw new DOMException('full', 'QuotaExceededError');
      return realSetItem.call(this, key, value);
    });
    try {
      const result = await runMigrationIfNeeded();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('1030');
      expect(localStorage.getItem(STORAGE_KEYS.MIGRATED_AT)).toBeNull();
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.LIST)).map(i => i.number)).toEqual([1030]); // still on the phone
    } finally {
      full.mockRestore();
    }
  });
});
