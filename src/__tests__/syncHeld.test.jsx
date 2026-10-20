/**
 * Uploads the server refuses for the free plan's limit (KEIRO_FREE_LIMIT) are
 * held on the phone — never retried into the set-aside list, never deleted —
 * and go back to the front of the queue once Pro or next month. Deleting an
 * invoice on the phone cancels every pending upload of it (queued, set aside or
 * held); one that is merely missing from the phone's list is still re-sent,
 * because the held copy may be the only one. An invoice is held once, however
 * often it is edited. Invoices still waiting to upload stay on every screen
 * (storage.getInvoices lays them over the cloud's list), and the banner says
 * when they will go up.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../services/db', () => ({ saveInvoice: vi.fn(), deleteInvoice: vi.fn(async () => ({ error: null })), getInvoices: vi.fn() }));

import * as db from '../services/db';
import { enqueueSync, processSyncQueue, getHeldSyncs, getFailedSyncs, getQueueLength, getUnsyncedCount, releaseHeldSyncs, SYNC_ATTENTION_EVENT } from '../utils/syncQueue';
import { deleteInvoice, saveInvoice, getInvoices } from '../utils/storage';
import SyncAttentionBanner from '../components/ui/SyncAttentionBanner';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { STORAGE_KEYS, EVENTS, PLAN_COPY } from '../utils/constants';
import { utcMonth } from '../utils/invoiceUtils';

const LIMIT = { code: 'P0001', message: 'KEIRO_FREE_LIMIT' };
const OFFLINE = new TypeError('Failed to fetch'); // no code: the request never got an answer
const held = (number, month = utcMonth()) => ({ id: `h${number}`, type: 'save_invoice', payload: { invoice: { number } }, ts: 1, retries: 0, heldUtcMonth: month });

/** storage.js logs every failed cloud write; the tests below fail them on purpose. */
function quietConsole() {
  let spies;
  beforeEach(() => { spies = [vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {})]; });
  afterEach(() => spies.forEach(s => s.mockRestore()));
}

/** The calendar is fixed (Oct 16 2026), so "Nov 1" reads the same on every run. Only Date is faked: timers and promises run. */
function fixedCalendar() {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 16, 12)); });
  afterEach(() => { vi.useRealTimers(); });
}

/** Only Date is faked (timers and promises run); the test sets the instant itself, in UTC. */
function fixedUtc() {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
  afterEach(() => { vi.useRealTimers(); });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(db.saveInvoice).mockReset();
  vi.mocked(db.deleteInvoice).mockReset();
  vi.mocked(db.getInvoices).mockReset();
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
    expect(getHeldSyncs()[0].heldUtcMonth).toBe(utcMonth());
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
    // 1021 was held in September and 1022 in October. The release runs in the
    // last second of October (UTC), and midnight passes while the queue is written.
    vi.useFakeTimers();
    const realSetItem = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === STORAGE_KEYS.SYNC_QUEUE) vi.setSystemTime(new Date('2026-11-01T00:00:01Z'));
      return realSetItem.call(this, key, value);
    });
    try {
      vi.setSystemTime(new Date('2026-10-31T23:59:59Z'));
      localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021, '2026-09'), held(1022, '2026-10')]));
      releaseHeldSyncs(item => item.heldUtcMonth !== utcMonth()); // exactly what processSyncQueue passes
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE)).map(a => a.payload.invoice.number)).toEqual([1021]);
      expect(getHeldSyncs().map(a => a.payload.invoice.number)).toEqual([1022]); // still held, not lost
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('held uploads are released by the server\'s (UTC) month, whatever the phone\'s time zone', () => {
  // The server refuses by the UTC month (supabase-pricing.sql). Every instant here is UTC, so these mean the
  // same under TZ=Asia/Karachi (the local month turns 5 hours early), TZ=America/Los_Angeles (7 hours late) and UTC.
  fixedUtc();
  const hold = async (number, at) => {
    vi.setSystemTime(new Date(at));
    db.saveInvoice.mockResolvedValue({ error: LIMIT });
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number } } });
    await processSyncQueue();
  };

  it('east of UTC: the local month turns first, but the server is still in the old month, so nothing is sent', async () => {
    await hold(1021, '2026-10-31T17:00:00Z');
    expect(getHeldSyncs()).toHaveLength(1);
    expect(db.saveInvoice).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-31T19:30:00Z')); // 00:30 on Nov 1 in Karachi, still October on the server
    await processSyncQueue();
    expect(db.saveInvoice).toHaveBeenCalledTimes(1); // not sent just to be refused and re-held a month late
    expect(getHeldSyncs()).toHaveLength(1);
    expect(getHeldSyncs()[0].lastError).toBe('KEIRO_FREE_LIMIT');
  });

  it('...and goes up as soon as the UTC month turns', async () => {
    await hold(1021, '2026-10-31T17:00:00Z');
    vi.setSystemTime(new Date('2026-11-01T00:00:01Z'));
    db.saveInvoice.mockResolvedValue({ error: null });
    await processSyncQueue();
    expect(db.saveInvoice).toHaveBeenCalledTimes(2);
    expect(getHeldSyncs()).toEqual([]);
    expect(getUnsyncedCount()).toBe(0);
  });

  it('west of UTC: the server is in the new month while the phone\'s calendar still says the old one, so it goes up', async () => {
    await hold(1021, '2026-10-31T17:00:00Z');
    vi.setSystemTime(new Date('2026-11-01T00:30:00Z')); // 17:30 on Oct 31 in Los Angeles, already November on the server
    db.saveInvoice.mockResolvedValue({ error: null });
    await processSyncQueue();
    expect(db.saveInvoice).toHaveBeenCalledTimes(2);
    expect(getHeldSyncs()).toEqual([]);
  });

  it('refused again after the UTC month turned (still over): held for the NEW month, not stuck', async () => {
    await hold(1021, '2026-10-31T17:00:00Z');
    vi.setSystemTime(new Date('2026-11-01T00:00:01Z'));
    await processSyncQueue(); // sent, refused again
    expect(db.saveInvoice).toHaveBeenCalledTimes(2);
    expect(getHeldSyncs()).toHaveLength(1);
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    await processSyncQueue(); // the same month: left alone
    expect(db.saveInvoice).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date('2026-12-01T00:00:01Z'));
    db.saveInvoice.mockResolvedValue({ error: null });
    await processSyncQueue();
    expect(db.saveInvoice).toHaveBeenCalledTimes(3);
    expect(getHeldSyncs()).toEqual([]);
  });

  it('an item stored without the month field is released, never stranded', async () => {
    vi.setSystemTime(new Date('2026-10-31T17:00:00Z'));
    const { heldUtcMonth: _none, ...bare } = held(1021);
    const { heldUtcMonth: _older, ...fromOlderBuild } = held(1022);
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([bare, { ...fromOlderBuild, heldMonth: '2026-10' }])); // the older build's local month
    db.saveInvoice.mockResolvedValue({ error: null });
    await processSyncQueue();
    expect(db.saveInvoice.mock.calls.map(([inv]) => inv.number).sort()).toEqual([1021, 1022]);
    expect(getHeldSyncs()).toEqual([]);
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
  fixedCalendar();

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
    expect(screen.getByText('1 invoice will upload Nov 1, or with Pro')).toBeInTheDocument();
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

describe('invoices not in the cloud yet stay on every screen (storage.getInvoices)', () => {
  // The Route list, Stores, Reports, End of Day, Home and Store Map all read getInvoices(), and while online it
  // returned the cloud's list alone: an invoice held for the free limit (or still queued) was nowhere until it
  // uploaded. Everything already made must stay usable (spec §1), so the phone's copy is laid over the cloud's.
  quietConsole();
  const at = (day) => `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`;
  // A cloud row has both spellings of its fields (db.getInvoices shapes it so); the phone's copy has the app's own.
  const cloudRow = (number, extra = {}) => ({ number, invoice_number: number, storeName: 'Cloud Deli', created_at: at(number - 1000), items: [], ...extra });
  const phoneCopy = (number, extra = {}) => ({ number, storeName: 'Phone Deli', createdAt: at(number - 1000), items: [], ...extra });
  const cloudHas = (...rows) => db.getInvoices.mockResolvedValue({ data: rows, error: null });
  const phoneHas = (...list) => localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify(list));
  const waiting = (key, ...numbers) => localStorage.setItem(key, JSON.stringify(numbers.map(n => ({ id: `${key}-${n}`, type: 'save_invoice', payload: { invoice: { number: n } }, ts: 1, retries: 0 }))));
  const numbers = (list) => list.map(i => i.number);

  it('a held invoice the cloud does not have is listed from the phone', async () => {
    cloudHas(cloudRow(1020), cloudRow(1019)); // the cloud lists newest first
    phoneHas(phoneCopy(1021), phoneCopy(1020), phoneCopy(1019));
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    const list = await getInvoices();
    expect(numbers(list)).toEqual([1021, 1020, 1019]);
    expect(list[0].storeName).toBe('Phone Deli');
    expect(list.slice(1).every(i => i.storeName === 'Cloud Deli')).toBe(true); // only the held one comes from the phone
  });

  it('...and is put where its date puts it, so the list stays newest first', async () => {
    cloudHas(cloudRow(1022), cloudRow(1020));
    phoneHas(phoneCopy(1022), phoneCopy(1021), phoneCopy(1020));
    waiting(STORAGE_KEYS.SYNC_QUEUE, 1021); // made offline, not up yet, between two that are
    expect(numbers(await getInvoices())).toEqual([1022, 1021, 1020]);
  });

  it('a queued save puts its newer phone copy over the cloud row, in the same place', async () => {
    cloudHas(cloudRow(1022), cloudRow(1021, { paymentStatus: 'unpaid' }), cloudRow(1020));
    phoneHas(phoneCopy(1022), phoneCopy(1021, { paymentStatus: 'paid', storeName: 'Edited offline' }), phoneCopy(1020));
    waiting(STORAGE_KEYS.SYNC_QUEUE, 1021);
    const list = await getInvoices();
    expect(numbers(list)).toEqual([1022, 1021, 1020]); // no duplicate, same slot
    expect(list[1]).toMatchObject({ paymentStatus: 'paid', storeName: 'Edited offline' });
    expect(list[0].storeName).toBe('Cloud Deli'); // the others are the cloud's
  });

  it('a set-aside save counts too', async () => {
    cloudHas(cloudRow(1020));
    phoneHas(phoneCopy(1021), phoneCopy(1020));
    waiting(STORAGE_KEYS.SYNC_FAILED, 1021);
    expect(numbers(await getInvoices())).toEqual([1021, 1020]);
  });

  it('with nothing waiting, the cloud\'s list comes back untouched (the phone\'s copies are not mixed in)', async () => {
    const rows = [cloudRow(1020), cloudRow(1019)];
    cloudHas(...rows);
    phoneHas(phoneCopy(1021), phoneCopy(1020, { storeName: 'Stale copy' }), phoneCopy(1019));
    const list = await getInvoices();
    expect(list).toEqual(rows);
    expect(list[0].storeName).toBe('Cloud Deli');
  });

  it('only a waiting save counts: other queued changes leave the cloud row alone', async () => {
    cloudHas(cloudRow(1020));
    phoneHas(phoneCopy(1020, { storeName: 'Stale copy' }));
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([
      { id: 'q1', type: 'update_payment_status', payload: { number: 1020, status: 'paid' }, ts: 1, retries: 0 },
      { id: 'q2', type: 'delete_invoice', payload: { number: 1020 }, ts: 2, retries: 0 },
    ]));
    expect((await getInvoices())[0].storeName).toBe('Cloud Deli');
  });

  it('no duplicates: an invoice waiting in two lists, or already in the cloud, is listed once', async () => {
    cloudHas(cloudRow(1020), cloudRow(1019));
    phoneHas(phoneCopy(1021), phoneCopy(1020));
    waiting(STORAGE_KEYS.SYNC_QUEUE, 1021, 1020);
    waiting(STORAGE_KEYS.SYNC_HELD, 1021);
    waiting(STORAGE_KEYS.SYNC_FAILED, 1020);
    expect(numbers(await getInvoices())).toEqual([1021, 1020, 1019]);
  });

  it('a waiting save the phone has no copy of adds nothing', async () => {
    cloudHas(cloudRow(1020));
    phoneHas(phoneCopy(1020));
    waiting(STORAGE_KEYS.SYNC_HELD, 1099);
    expect(numbers(await getInvoices())).toEqual([1020]);
  });

  it('an invoice deleted while it was held stays gone', async () => {
    cloudHas(cloudRow(1020));
    phoneHas(phoneCopy(1021), phoneCopy(1020));
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    expect(numbers(await getInvoices())).toEqual([1021, 1020]);
    await deleteInvoice(1021);
    expect(numbers(await getInvoices())).toEqual([1020]);
  });

  it('once it has uploaded, the cloud\'s row is the one shown again', async () => {
    cloudHas(cloudRow(1020));
    phoneHas(phoneCopy(1021), phoneCopy(1020));
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021, '2000-01')]));
    db.saveInvoice.mockResolvedValue({ error: null });
    await processSyncQueue(); // a new month: released and sent
    cloudHas(cloudRow(1021, { storeName: 'Uploaded' }), cloudRow(1020));
    const list = await getInvoices();
    expect(list.map(i => i.storeName)).toEqual(['Uploaded', 'Cloud Deli']);
  });

  it('offline it is still the phone\'s list, as before', async () => {
    db.getInvoices.mockResolvedValue({ data: null, error: new Error('no session') });
    phoneHas(phoneCopy(1021), phoneCopy(1020));
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    expect(numbers(await getInvoices())).toEqual([1021, 1020]);
  });

  it('a copy with no date goes first rather than being lost', async () => {
    cloudHas(cloudRow(1020));
    phoneHas({ number: 1021, storeName: 'Phone Deli' }, phoneCopy(1020));
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    expect(numbers(await getInvoices())).toEqual([1021, 1020]);
  });
});

describe('the banner', () => {
  fixedCalendar();

  it('says how many invoices will upload, and when, and Upgrade opens the Upgrade sheet', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021), held(1022)]));
    const opened = vi.fn();
    window.addEventListener(EVENTS.OPEN_UPGRADE, opened);
    render(<ThemeProvider><SyncAttentionBanner /></ThemeProvider>);
    expect(screen.getByText('2 invoices will upload Nov 1, or with Pro')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTS.OPEN_UPGRADE, opened);
  });

  it('the date is the 1st of next month, whatever today is', () => {
    vi.setSystemTime(new Date(2026, 11, 31, 12));
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    render(<ThemeProvider><SyncAttentionBanner /></ThemeProvider>);
    expect(screen.getByText('1 invoice will upload Jan 1, or with Pro')).toBeInTheDocument();
  });

  it('beside set-aside changes, the sentence carries on after the dot', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_FAILED, JSON.stringify([{ id: 'f1', type: 'save_invoice', payload: { invoice: { number: 1030 } }, ts: 1, retries: 5 }]));
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    render(<ThemeProvider><SyncAttentionBanner /></ThemeProvider>);
    expect(screen.getByRole('status')).toHaveTextContent("1 change couldn't be saved · 1 invoice will upload Nov 1, or with Pro");
  });

  it('the words are PLAN_COPY.heldLine: one invoice or many, and the date it is given', () => {
    expect(PLAN_COPY.heldLine(1, 'Nov 1')).toBe('1 invoice will upload Nov 1, or with Pro');
    expect(PLAN_COPY.heldLine(3, 'Dec 1')).toBe('3 invoices will upload Dec 1, or with Pro');
  });

  it('only held uploads: no Try again button, only Later and Upgrade', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    render(<ThemeProvider><SyncAttentionBanner /></ThemeProvider>);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Later', 'Upgrade']);
  });
});
