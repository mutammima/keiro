/**
 * Uploads the server refuses for the free plan's limit (KEIRO_FREE_LIMIT) are
 * held on the phone — never retried into the set-aside list, never deleted —
 * and go back to the front of the queue once Pro or next month. Deleting an
 * invoice on the phone cancels every pending upload of it (queued, set aside or
 * held); one that is merely missing from the phone's list is still re-sent,
 * because the held copy may be the only one. An invoice is held once, however
 * often it is edited.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../services/db', () => ({ saveInvoice: vi.fn(), deleteInvoice: vi.fn(async () => ({ error: null })) }));

import * as db from '../services/db';
import { enqueueSync, processSyncQueue, getHeldSyncs, getFailedSyncs, getQueueLength, getUnsyncedCount, releaseHeldSyncs, SYNC_ATTENTION_EVENT } from '../utils/syncQueue';
import { deleteInvoice, saveInvoice } from '../utils/storage';
import SyncAttentionBanner from '../components/ui/SyncAttentionBanner';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { STORAGE_KEYS, EVENTS } from '../utils/constants';
import { localMonth } from '../utils/invoiceUtils';

const LIMIT = { code: 'P0001', message: 'KEIRO_FREE_LIMIT' };
const OFFLINE = new TypeError('Failed to fetch'); // no code: the request never got an answer
const held = (number, month = localMonth()) => ({ id: `h${number}`, type: 'save_invoice', payload: { invoice: { number } }, ts: 1, retries: 0, heldMonth: month });

/** storage.js logs every failed cloud write; the tests below fail them on purpose. */
function quietConsole() {
  let spies;
  beforeEach(() => { spies = [vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {})]; });
  afterEach(() => spies.forEach(s => s.mockRestore()));
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(db.saveInvoice).mockReset();
  vi.mocked(db.deleteInvoice).mockReset();
  db.deleteInvoice.mockImplementation(async () => ({ error: null }));
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('held uploads', () => {
  it('a free-limit refusal is held without spending a try, and the rest of the queue goes on', async () => {
    db.saveInvoice.mockResolvedValueOnce({ error: LIMIT }).mockResolvedValueOnce({ error: null });
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1022 } } });
    await processSyncQueue();
    expect(getHeldSyncs().map(a => a.payload.invoice.number)).toEqual([1021]);
    expect(getHeldSyncs()[0].retries).toBe(0);
    expect(getHeldSyncs()[0].heldMonth).toBe(localMonth());
    expect(getFailedSyncs()).toEqual([]);
    expect(getQueueLength()).toBe(0);
    expect(db.saveInvoice).toHaveBeenCalledTimes(2);
  });

  it('held uploads count as not yet in the cloud (sign-out warns about them)', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    expect(getUnsyncedCount()).toBe(1);
  });

  it('releasing puts them back at the front, with the invoice as the phone has it now', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([{ ...held(1021), payload: { invoice: { number: 1021, paymentStatus: 'unpaid' } } }]));
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([{ id: 'q1', type: 'save_invoice', payload: { invoice: { number: 1030 } }, ts: 2, retries: 0 }]));
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify([{ number: 1021, paymentStatus: 'paid' }]));
    releaseHeldSyncs();
    const q = JSON.parse(localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE));
    expect(q.map(a => a.payload.invoice.number)).toEqual([1021, 1030]);
    expect(q[0].payload.invoice.paymentStatus).toBe('paid');
    expect(getHeldSyncs()).toEqual([]);
  });

  it('a new month releases them before the next round', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021, '2000-01')]));
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify([{ number: 1021 }]));
    db.saveInvoice.mockResolvedValueOnce({ error: null });
    await processSyncQueue();
    expect(getHeldSyncs()).toEqual([]);
    expect(db.saveInvoice).toHaveBeenCalledTimes(1);
  });

  it('a held invoice missing from this phone\'s list is still re-sent (it may be the only copy)', async () => {
    // Held in a past month, and there is no invoice list on the phone at all.
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021, '2000-01')]));
    db.saveInvoice.mockResolvedValueOnce({ error: null });
    await processSyncQueue();
    expect(getHeldSyncs()).toEqual([]);
    expect(db.saveInvoice).toHaveBeenCalledTimes(1);
    expect(db.saveInvoice).toHaveBeenCalledWith({ number: 1021 });
  });

  it('deleting an invoice forgets its held upload', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021, '2000-01'), held(1022, '2000-01')]));
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify([{ number: 1021 }, { number: 1022 }]));
    const heard = vi.fn();
    window.addEventListener(SYNC_ATTENTION_EVENT, heard);
    await deleteInvoice(1021);
    window.removeEventListener(SYNC_ATTENTION_EVENT, heard);
    expect(getHeldSyncs().map(a => a.payload.invoice.number)).toEqual([1022]);
    expect(heard).toHaveBeenCalled(); // the banner counts again
    await processSyncQueue(); // the month changed since: what is still held goes up now
    expect(db.saveInvoice.mock.calls.map(([inv]) => inv.number)).toEqual([1022]); // never 1021
  });

  it('forgets the held upload right away, without waiting for the cloud delete', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    let cloudAnswers;
    db.deleteInvoice.mockReturnValueOnce(new Promise(resolve => { cloudAnswers = resolve; }));
    const deleting = deleteInvoice(1021);
    expect(getHeldSyncs()).toEqual([]); // offline, the cloud can take a long time to answer
    cloudAnswers({ error: null });
    await deleting;
  });

  it('this month\'s held uploads stay held', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    await processSyncQueue();
    expect(getHeldSyncs()).toHaveLength(1);
    expect(db.saveInvoice).not.toHaveBeenCalled();
  });

  it('a month rollover in the middle of a release cannot lose a held upload', () => {
    // 1021 was held in September and 1022 in October. The release runs on the
    // last evening of October, and midnight passes while the queue is written.
    vi.useFakeTimers();
    const realSetItem = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === STORAGE_KEYS.SYNC_QUEUE) vi.setSystemTime(new Date(2026, 10, 1, 0, 0, 1));
      return realSetItem.call(this, key, value);
    });
    try {
      vi.setSystemTime(new Date(2026, 9, 31, 23, 59, 59));
      localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021, '2026-09'), held(1022, '2026-10')]));
      releaseHeldSyncs(item => item.heldMonth !== localMonth()); // exactly what processSyncQueue passes
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE)).map(a => a.payload.invoice.number)).toEqual([1021]);
      expect(getHeldSyncs().map(a => a.payload.invoice.number)).toEqual([1022]); // still held, not lost
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('a deleted invoice stays deleted', () => {
  quietConsole();
  let cloud;
  const queued = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE) || '[]');
  const queueItem = (type, payload) => ({ id: `q-${type}-${JSON.stringify(payload)}`, type, payload, ts: 1, retries: 0 });
  const cloudTakesDeletes = () => db.deleteInvoice.mockImplementation(async (n) => { cloud.delete(n); return { error: null }; });
  const cloudTakesSaves = () => db.saveInvoice.mockImplementation(async (inv) => { cloud.set(inv.number, inv); return { error: null }; });
  beforeEach(() => { cloud = new Map(); });

  it('created offline, deleted offline: the delete cancels the queued save', async () => {
    db.saveInvoice.mockResolvedValue({ error: OFFLINE });
    db.deleteInvoice.mockResolvedValue({ error: OFFLINE });
    await saveInvoice({ number: 1021, items: [] });
    await deleteInvoice(1021);
    expect(queued().map(a => a.type)).toEqual(['delete_invoice']); // only the delete waits for a signal
    // Back online, where the server now refuses new invoices (free limit) but takes the delete.
    db.saveInvoice.mockResolvedValue({ error: LIMIT });
    cloudTakesDeletes();
    await processSyncQueue();
    expect(getHeldSyncs()).toEqual([]);
    // Pro, or next month: whatever is held goes up now.
    cloudTakesSaves();
    releaseHeldSyncs();
    await processSyncQueue();
    expect(cloud.has(1021)).toBe(false);
  });

  it('a save still waiting in the queue when the invoice is deleted online is cancelled', async () => {
    db.saveInvoice.mockResolvedValue({ error: OFFLINE });
    await saveInvoice({ number: 1021, items: [] }); // queued
    cloudTakesDeletes();
    await deleteInvoice(1021); // online: the cloud delete is a no-op, so nothing is queued for it
    expect(getQueueLength()).toBe(0); // and the queued save is gone
    db.saveInvoice.mockResolvedValue({ error: LIMIT });
    await processSyncQueue(); // the next round has nothing to hold
    expect(getHeldSyncs()).toEqual([]);
    cloudTakesSaves();
    releaseHeldSyncs();
    await processSyncQueue();
    expect(cloud.has(1021)).toBe(false);
  });

  it('a queued save of a deleted invoice is dropped; other invoices\' saves stay', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([
      queueItem('save_invoice', { invoice: { number: 1021 } }),
      queueItem('save_invoice', { invoice: { number: 1022 } }),
      queueItem('update_payment_status', { number: 1021, status: 'paid' }), // not a save: left alone
    ]));
    const heard = vi.fn();
    window.addEventListener(SYNC_ATTENTION_EVENT, heard);
    await deleteInvoice(1021);
    window.removeEventListener(SYNC_ATTENTION_EVENT, heard);
    expect(queued().map(a => [a.type, a.payload.invoice?.number ?? a.payload.number])).toEqual([['save_invoice', 1022], ['update_payment_status', 1021]]);
    expect(heard).not.toHaveBeenCalled(); // the banner shows set-aside and held uploads, not the queue
  });

  it('a set-aside save of a deleted invoice is dropped too, and the banner is told', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_FAILED, JSON.stringify([
      queueItem('save_invoice', { invoice: { number: 1021 } }),
      queueItem('save_invoice', { invoice: { number: 1022 } }),
    ]));
    const heard = vi.fn();
    window.addEventListener(SYNC_ATTENTION_EVENT, heard);
    await deleteInvoice(1021);
    window.removeEventListener(SYNC_ATTENTION_EVENT, heard);
    expect(getFailedSyncs().map(a => a.payload.invoice.number)).toEqual([1022]);
    expect(heard).toHaveBeenCalled();
  });

  it('an invoice with no pending upload leaves every list alone and tells nobody', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([queueItem('save_invoice', { invoice: { number: 1022 } })]));
    localStorage.setItem(STORAGE_KEYS.SYNC_FAILED, JSON.stringify([queueItem('save_invoice', { invoice: { number: 1023 } })]));
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1024)]));
    const heard = vi.fn();
    window.addEventListener(SYNC_ATTENTION_EVENT, heard);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    try {
      await deleteInvoice(1021);
      const syncKeys = [STORAGE_KEYS.SYNC_QUEUE, STORAGE_KEYS.SYNC_FAILED, STORAGE_KEYS.SYNC_HELD];
      expect(writes.mock.calls.map(([key]) => key).filter(key => syncKeys.includes(key))).toEqual([]);
    } finally {
      writes.mockRestore();
      window.removeEventListener(SYNC_ATTENTION_EVENT, heard);
    }
    expect(heard).not.toHaveBeenCalled();
    expect(getUnsyncedCount()).toBe(3);
  });
});

describe('one entry per invoice', () => {
  quietConsole();

  it('an invoice refused and then edited is held once, not once per edit', async () => {
    db.saveInvoice.mockResolvedValue({ error: LIMIT });
    await saveInvoice({ number: 1021, items: [], total: 10 }); // refused, so queued
    await processSyncQueue(); // held
    await saveInvoice({ number: 1021, items: [], total: 12 }); // an edit: refused, queued
    await processSyncQueue(); // held again
    await saveInvoice({ number: 1021, items: [], total: 14 }); // and again
    await processSyncQueue();
    expect(getHeldSyncs().map(a => a.payload.invoice.total)).toEqual([14]); // one entry: the newest copy
    expect(getUnsyncedCount()).toBe(1);
    render(<ThemeProvider><SyncAttentionBanner /></ThemeProvider>);
    expect(screen.getByText('1 invoice waits for Pro to upload')).toBeInTheDocument();
  });

  it('holding another invoice keeps the ones already held', async () => {
    db.saveInvoice.mockResolvedValue({ error: LIMIT });
    await saveInvoice({ number: 1021, items: [] });
    await processSyncQueue();
    await saveInvoice({ number: 1022, items: [] });
    await processSyncQueue();
    expect(getHeldSyncs().map(a => a.payload.invoice.number)).toEqual([1021, 1022]);
  });
});

describe('the banner', () => {
  it('says how many invoices wait for Pro, and Upgrade opens the Upgrade sheet', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021), held(1022)]));
    const opened = vi.fn();
    window.addEventListener(EVENTS.OPEN_UPGRADE, opened);
    render(<ThemeProvider><SyncAttentionBanner /></ThemeProvider>);
    expect(screen.getByText('2 invoices wait for Pro to upload')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTS.OPEN_UPGRADE, opened);
  });

  it('only held uploads: no Try again button, only Later and Upgrade', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    render(<ThemeProvider><SyncAttentionBanner /></ThemeProvider>);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Later', 'Upgrade']);
  });
});
