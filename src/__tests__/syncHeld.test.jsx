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

vi.mock('../services/db', () => ({
  saveInvoice: vi.fn(), deleteInvoice: vi.fn(async () => ({ error: null })), getInvoices: vi.fn(),
  saveInvoicePayment: vi.fn(), updateInvoicePaymentStatus: vi.fn(), deleteInvoicePayment: vi.fn(), clearInvoicePayments: vi.fn(),
  saveSignatureRow: vi.fn(), deleteSignatureRow: vi.fn(),
}));

import * as db from '../services/db';
import { enqueueSync, processSyncQueue, getHeldSyncs, getFailedSyncs, getQueueLength, getUnsyncedCount, releaseHeldSyncs, retryFailedSyncs, SYNC_ATTENTION_EVENT } from '../utils/syncQueue';
import { deleteInvoice, saveInvoice, getInvoices } from '../utils/storage';
import SyncAttentionBanner from '../components/ui/SyncAttentionBanner';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { STORAGE_KEYS, EVENTS, PLAN_COPY } from '../utils/constants';
import { utcMonth } from '../utils/invoiceUtils';

const LIMIT = { code: 'P0001', message: 'KEIRO_FREE_LIMIT' };
const OFFLINE = new TypeError('Failed to fetch'); // no code: the request never got an answer
const held = (number, month = utcMonth()) => ({ id: `h${number}`, type: 'save_invoice', payload: { invoice: { number } }, ts: 1, retries: 0, heldUtcMonth: month });

/**
 * storage.js logs every failed cloud write, and a few tests below fail them on purpose. loggedCalls(fn) silences
 * console.warn and console.error only while fn runs, restores them right after, and returns the arguments of every
 * call: the test says which logs it expects, and anything logged anywhere else still shows. muted(fn) is the
 * same, reduced to the first argument (the message).
 */
async function loggedCalls(fn) {
  const spies = [vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {})];
  try {
    await fn();
    return spies.flatMap(spy => spy.mock.calls.map(args => [...args]));
  } finally {
    spies.forEach(spy => spy.mockRestore());
  }
}
const muted = async (fn) => (await loggedCalls(fn)).map(([first]) => String(first));
const SAVE_FAILED = 'saveInvoice: cloud save failed, queued for retry';
const DELETE_FAILED = 'deleteInvoice cloud error, queued for retry';
const READ_FELL_BACK = 'getInvoices falling back to localStorage';

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

/** Writes to `key` fail like a full phone (QuotaExceededError, also on the retry after freeing room). */
function fullPhone(key) {
  const realSetItem = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
    if (k === key) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    return realSetItem.call(this, k, v);
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(db.saveInvoice).mockReset();
  vi.mocked(db.deleteInvoice).mockReset();
  vi.mocked(db.getInvoices).mockReset();
  db.deleteInvoice.mockImplementation(async () => ({ error: null }));
  for (const name of ['saveInvoicePayment', 'updateInvoicePaymentStatus', 'deleteInvoicePayment', 'clearInvoicePayments', 'saveSignatureRow', 'deleteSignatureRow']) {
    vi.mocked(db[name]).mockReset();
    db[name].mockImplementation(async () => ({ error: null }));
  }
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

  it('a refusal decided before the UTC month turned is held for THAT month, even if the answer arrives after midnight', async () => {
    vi.setSystemTime(new Date('2026-10-31T23:59:59Z'));
    // The server decided at 23:59:59 on Oct 31; the phone gets the answer at 00:00:03 on Nov 1.
    db.saveInvoice.mockImplementation(async () => { vi.setSystemTime(new Date('2026-11-01T00:00:03Z')); return { error: LIMIT }; });
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
    await processSyncQueue();
    expect(getHeldSyncs()).toHaveLength(1);
    expect(getHeldSyncs()[0].heldUtcMonth).toBe('2026-10'); // stamped with the month the request went out in
    db.saveInvoice.mockResolvedValue({ error: null });
    await processSyncQueue(); // it is November: the next round releases it and it goes up now, not a month later
    expect(db.saveInvoice).toHaveBeenCalledTimes(2);
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

describe('holding and releasing on a full phone, and telling the banner', () => {
  // Each move between lists writes the destination first and shrinks the source after, so a phone that runs
  // out of room in between leaves the invoice on BOTH lists (a repeat upload at worst), never on neither.
  const numbersIn = (list) => list.map(a => a.payload.invoice.number);
  const queued = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE) || '[]');
  const FULL = 'localStorage is full; not saved';
  // Each failed write logs once, with the key it could not write: exactly these logs are expected, and only around the calls that write.
  const fullFor = (...keys) => keys.map(key => [FULL, key]);
  const fullLogs = (calls) => calls.map(([message, key]) => [message, key]);
  let phone;
  afterEach(() => { phone?.mockRestore(); phone = undefined; });
  // A loop that keeps sending the same upload is a bug; cap the calls so a regression ends instead of hanging the run.
  const refuseCapped = () => db.saveInvoice.mockImplementation(async () => (db.saveInvoice.mock.calls.length > 3 ? { error: OFFLINE } : { error: LIMIT }));

  it('hold: the held list is written first, so when the queue cannot shrink the invoice is on both lists', async () => {
    refuseCapped();
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
    phone = fullPhone(STORAGE_KEYS.SYNC_QUEUE);
    const logs = await loggedCalls(() => processSyncQueue());
    expect(numbersIn(getHeldSyncs())).toEqual([1021]);
    expect(numbersIn(queued())).toEqual([1021]); // a duplicate, not a loss
    expect(getUnsyncedCount()).toBe(2);
    expect(db.saveInvoice).toHaveBeenCalledTimes(1); // the round stopped: it is not sent again and again
    expect(fullLogs(logs)).toEqual(fullFor(STORAGE_KEYS.SYNC_QUEUE)); // the phone said so, once
  });

  it('hold: when the held list cannot be written, the invoice stays in the queue (nothing is lost)', async () => {
    refuseCapped();
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
    phone = fullPhone(STORAGE_KEYS.SYNC_HELD);
    const heard = vi.fn();
    window.addEventListener(SYNC_ATTENTION_EVENT, heard);
    const logs = await loggedCalls(() => processSyncQueue());
    window.removeEventListener(SYNC_ATTENTION_EVENT, heard);
    expect(numbersIn(queued())).toEqual([1021]);
    expect(getHeldSyncs()).toEqual([]);
    expect(db.saveInvoice).toHaveBeenCalledTimes(1);
    expect(heard).not.toHaveBeenCalled(); // nothing moved, so there is nothing to tell the banner
    expect(fullLogs(logs)).toEqual(fullFor(STORAGE_KEYS.SYNC_HELD));
  });

  it('release: the queue is written first, so when the held list cannot shrink the invoice is on both lists', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    phone = fullPhone(STORAGE_KEYS.SYNC_HELD);
    const logs = await loggedCalls(() => releaseHeldSyncs());
    expect(numbersIn(queued())).toEqual([1021]);
    expect(numbersIn(getHeldSyncs())).toEqual([1021]); // a duplicate, not a loss
    expect(fullLogs(logs)).toEqual(fullFor(STORAGE_KEYS.SYNC_HELD));
    phone.mockRestore(); phone = undefined; // room again: the next release finishes the move
    releaseHeldSyncs();
    expect(getHeldSyncs()).toEqual([]);
    expect(new Set(queued().map(a => a.id))).toEqual(new Set(['h1021'])); // still the one upload (same id), at most twice in the queue
  });

  it('release: when the queue cannot be written, the invoice stays held (nothing is lost)', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    phone = fullPhone(STORAGE_KEYS.SYNC_QUEUE);
    const heard = vi.fn();
    window.addEventListener(SYNC_ATTENTION_EVENT, heard);
    const logs = await loggedCalls(() => releaseHeldSyncs());
    window.removeEventListener(SYNC_ATTENTION_EVENT, heard);
    expect(numbersIn(getHeldSyncs())).toEqual([1021]);
    expect(queued()).toEqual([]);
    expect(heard).not.toHaveBeenCalled();
    expect(fullLogs(logs)).toEqual(fullFor(STORAGE_KEYS.SYNC_QUEUE));
  });

  it('set-aside: the same order, and a queue that cannot shrink stops the round instead of repeating the upload', async () => {
    db.saveInvoice.mockImplementation(async () => (db.saveInvoice.mock.calls.length > 8 ? { error: OFFLINE } : { error: { code: '42501', message: 'permission denied' } }));
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([{ id: 'q1', type: 'save_invoice', payload: { invoice: { number: 1021 } }, ts: 1, retries: 4 }]));
    phone = fullPhone(STORAGE_KEYS.SYNC_QUEUE);
    const logs = await loggedCalls(() => processSyncQueue()); // the fifth rejection sets it aside; the queue cannot be written
    expect(numbersIn(getFailedSyncs())).toEqual([1021]);
    expect(numbersIn(queued())).toEqual([1021]); // a duplicate, not a loss
    expect(db.saveInvoice).toHaveBeenCalledTimes(1);
    expect(fullLogs(logs)).toEqual(fullFor(STORAGE_KEYS.SYNC_QUEUE));
  });

  it('set-aside: round after round with a queue that cannot shrink, the set-aside list keeps ONE copy (the count does not inflate)', async () => {
    db.saveInvoice.mockImplementation(async () => (db.saveInvoice.mock.calls.length > 8 ? { error: OFFLINE } : { error: { code: '42501', message: 'permission denied' } }));
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([{ id: 'q1', type: 'save_invoice', payload: { invoice: { number: 1021 } }, ts: 1, retries: 4 }]));
    phone = fullPhone(STORAGE_KEYS.SYNC_QUEUE);
    const logs = await loggedCalls(async () => {
      await processSyncQueue(); // set aside; the queued copy keeps retries 4
      await processSyncQueue(); // rejected and set aside again
      await processSyncQueue();
    });
    expect(db.saveInvoice).toHaveBeenCalledTimes(3);
    expect(getFailedSyncs().map(a => a.id)).toEqual(['q1']); // replaced by id, never appended again
    expect(fullLogs(logs)).toEqual(fullFor(STORAGE_KEYS.SYNC_QUEUE, STORAGE_KEYS.SYNC_QUEUE, STORAGE_KEYS.SYNC_QUEUE));
    phone.mockRestore(); phone = undefined; // room again
    retryFailedSyncs();
    expect(new Set(queued().map(a => a.id))).toEqual(new Set(['q1'])); // Try again queues the one change (it is the same id as the stale queued copy)
    expect(getFailedSyncs()).toEqual([]);
  });

  it('success: when the queue cannot shrink after an upload, the round stops instead of sending the same upload again', async () => {
    db.saveInvoice.mockImplementation(async () => (db.saveInvoice.mock.calls.length > 3 ? { error: OFFLINE } : { error: null }));
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
    phone = fullPhone(STORAGE_KEYS.SYNC_QUEUE);
    const logs = await loggedCalls(() => processSyncQueue());
    expect(db.saveInvoice).toHaveBeenCalledTimes(1);
    expect(numbersIn(queued())).toEqual([1021]); // still queued: it goes up again next round (an upsert), never lost
    expect(fullLogs(logs)).toEqual(fullFor(STORAGE_KEYS.SYNC_QUEUE));
  });

  it('a change from an older build is dropped, and a queue that cannot shrink stops the round instead of spinning', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([{ id: 'x1', type: 'save_hologram', payload: {}, ts: 1, retries: 0 }]));
    // The queue stays full for 40 write attempts, then there is room: a loop would burn through them all.
    const realSetItem = Storage.prototype.setItem;
    let refused = 0;
    phone = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      if (k === STORAGE_KEYS.SYNC_QUEUE && refused < 40) { refused += 1; throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }
      return realSetItem.call(this, k, v);
    });
    await loggedCalls(() => processSyncQueue());
    expect(refused).toBeLessThanOrEqual(2); // one write and its retry, then the round stopped
    expect(queued().map(a => a.id)).toEqual(['x1']); // dropped once the phone has room
  });

  it('holding tells the banner; so does releasing; releasing nothing does not', async () => {
    const heard = vi.fn();
    window.addEventListener(SYNC_ATTENTION_EVENT, heard);
    try {
      db.saveInvoice.mockResolvedValue({ error: LIMIT });
      enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
      expect(heard).not.toHaveBeenCalled(); // queueing alone is not shown by the banner
      const logs = await muted(async () => {
        await processSyncQueue(); // held
        expect(heard).toHaveBeenCalledTimes(1);
        releaseHeldSyncs(); // released
        expect(heard).toHaveBeenCalledTimes(2);
        releaseHeldSyncs(); // nothing held any more
        releaseHeldSyncs(() => false);
        expect(heard).toHaveBeenCalledTimes(2);
      });
      expect(logs).toEqual([]); // moving between lists logs nothing
    } finally {
      window.removeEventListener(SYNC_ATTENTION_EVENT, heard);
    }
  });
});

describe('a deleted invoice stays deleted', () => {
  let cloud;
  const queued = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE) || '[]');
  const queueItem = (type, payload) => ({ id: `q-${type}-${JSON.stringify(payload)}`, type, payload, ts: 1, retries: 0 });
  const cloudTakesDeletes = () => db.deleteInvoice.mockImplementation(async (n) => { cloud.delete(n); return { error: null }; });
  const cloudTakesSaves = () => db.saveInvoice.mockImplementation(async (inv) => { cloud.set(inv.number, inv); return { error: null }; });
  beforeEach(() => { cloud = new Map(); });

  it('created offline, deleted offline: the delete cancels the queued save', async () => {
    db.saveInvoice.mockResolvedValue({ error: OFFLINE });
    db.deleteInvoice.mockResolvedValue({ error: OFFLINE });
    expect(await muted(() => saveInvoice({ number: 1021, items: [] }))).toEqual([SAVE_FAILED]);
    expect(await muted(() => deleteInvoice(1021))).toEqual([DELETE_FAILED]);
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
    expect(await muted(() => saveInvoice({ number: 1021, items: [] }))).toEqual([SAVE_FAILED]); // queued
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
      queueItem('update_payment_status', { number: 1022, status: 'paid' }), // another invoice's: left alone
    ]));
    const heard = vi.fn();
    window.addEventListener(SYNC_ATTENTION_EVENT, heard);
    await deleteInvoice(1021);
    window.removeEventListener(SYNC_ATTENTION_EVENT, heard);
    expect(queued().map(a => [a.type, a.payload.invoice?.number ?? a.payload.number])).toEqual([['save_invoice', 1022], ['update_payment_status', 1022]]);
    expect(heard).not.toHaveBeenCalled(); // the banner shows set-aside and held uploads, not the queue
  });

  describe('a delete that races an upload already on the wire', () => {
    // The queue sent save_invoice N and is waiting for the answer when N is deleted. Forgetting the queued copy
    // cannot recall the request: if the cloud delete lands first, the save then puts N back on the server.
    let landSave;
    // The first upload hangs until landSave(); any later one just lands.
    const saveInFlight = () => {
      cloudTakesSaves();
      db.saveInvoice.mockImplementationOnce((inv) => new Promise((resolve) => {
        landSave = (result = { error: null }) => { if (!result.error) cloud.set(inv.number, inv); resolve(result); };
      }));
    };

    it('the delete is sent again once the upload has finished, so the server ends without the invoice', async () => {
      cloudTakesDeletes();
      saveInFlight();
      enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
      const round = processSyncQueue();
      expect(db.saveInvoice).toHaveBeenCalledTimes(1); // on the wire
      await deleteInvoice(1021); // this delete reaches the server first
      expect(db.deleteInvoice).toHaveBeenCalledTimes(1);
      landSave(); // ...then the upload does, and creates the invoice again
      await round;
      expect(db.deleteInvoice).toHaveBeenCalledTimes(2);
      expect(db.deleteInvoice.mock.invocationCallOrder[1]).toBeGreaterThan(db.saveInvoice.mock.invocationCallOrder[0]);
      expect(cloud.has(1021)).toBe(false);
      expect(getUnsyncedCount()).toBe(0);
    });

    it('an upload that did not get an answer may still have landed: the delete waits in the queue', async () => {
      cloudTakesDeletes();
      saveInFlight();
      enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
      const round = processSyncQueue();
      await deleteInvoice(1021);
      landSave({ error: OFFLINE });
      await round;
      expect(queued().map(a => `${a.type}:${a.payload.number ?? a.payload.invoice?.number}`)).toEqual(['delete_invoice:1021']);
    });

    it('a delete already waiting in the queue (an offline delete) is not queued a second time', async () => {
      db.deleteInvoice.mockResolvedValue({ error: OFFLINE });
      saveInFlight();
      enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
      const round = processSyncQueue();
      expect(await muted(() => deleteInvoice(1021))).toEqual([DELETE_FAILED]); // the cloud delete did not get through: queued
      expect(queued().map(a => a.type)).toEqual(['delete_invoice']);
      landSave({ error: OFFLINE }); // the upload did not get an answer either
      await round;
      expect(queued().map(a => `${a.type}:${a.payload.number}`)).toEqual(['delete_invoice:1021']); // one delete, not two
    });

    it('...and when the upload lands, that one queued delete is the only one sent after it', async () => {
      db.deleteInvoice.mockResolvedValueOnce({ error: OFFLINE });
      cloudTakesDeletes(); // from the second call on
      saveInFlight();
      enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
      const round = processSyncQueue();
      await muted(() => deleteInvoice(1021)); // fails, queued
      landSave();
      await round;
      expect(db.deleteInvoice).toHaveBeenCalledTimes(2); // the user's attempt, and the queued delete after the save
      expect(db.deleteInvoice.mock.invocationCallOrder[1]).toBeGreaterThan(db.saveInvoice.mock.invocationCallOrder[0]);
      expect(cloud.has(1021)).toBe(false);
      expect(getUnsyncedCount()).toBe(0);
    });

    describe('an invoice made again under that number is not deleted by the re-sent delete', () => {
      // The re-sent delete would run after the new invoice's save and wipe it from the cloud.
      const raceThenMakeItAgain = async (makeItAgain) => {
        cloudTakesDeletes();
        saveInFlight();
        enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
        const round = processSyncQueue();
        await deleteInvoice(1021);
        makeItAgain();
        landSave();
        await round;
      };
      const asItem = (n) => ({ id: `again-${n}`, type: 'save_invoice', payload: { invoice: { number: n } }, ts: 2, retries: 0 });

      it('it is back in the phone\'s list', async () => {
        await raceThenMakeItAgain(() => localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify([{ number: 1021, storeName: 'Made again' }])));
        expect(db.deleteInvoice).toHaveBeenCalledTimes(1); // only the user's delete
        expect(cloud.has(1021)).toBe(true);
      });

      for (const [where, key] of [['queued', STORAGE_KEYS.SYNC_QUEUE], ['set aside', STORAGE_KEYS.SYNC_FAILED], ['held', STORAGE_KEYS.SYNC_HELD]]) {
        it(`a save of it is ${where}`, async () => {
          await raceThenMakeItAgain(() => localStorage.setItem(key, JSON.stringify([asItem(1021)])));
          expect(db.deleteInvoice).toHaveBeenCalledTimes(1);
          if (key === STORAGE_KEYS.SYNC_QUEUE) expect(cloud.has(1021)).toBe(true); // the queued save went up after the first
        });
      }
    });

    it('an upload of another invoice, or of this one when nothing was deleted, sends no extra delete', async () => {
      cloudTakesDeletes();
      saveInFlight();
      enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
      const round = processSyncQueue();
      await deleteInvoice(1099); // some other invoice
      landSave();
      await round;
      expect(db.deleteInvoice.mock.calls).toEqual([[1099]]);
      expect(cloud.has(1021)).toBe(true);
    });

    it('only the round that was on the wire counts: a later upload of the same number is left alone', async () => {
      cloudTakesDeletes();
      saveInFlight();
      enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
      const round = processSyncQueue();
      landSave();
      await round;
      await deleteInvoice(1021); // after the upload finished: nothing in flight, the ordinary delete is enough
      expect(db.deleteInvoice).toHaveBeenCalledTimes(1);
    });
  });

  describe('everything else queued for the invoice', () => {
    // What the invoice's own uploads are: its save, its status change and its payments. A payment replayed after
    // the invoice is gone leaves an invoice_payments row with no invoice. Deletes (the invoice's, a payment's, the
    // clearing of its payments) are the clean-up and must still go up; a signature replays from what the phone
    // holds, and the delete clears that, so it only ever deletes.
    const payment = (id, invoiceNumber) => ({ id, amount: 5, note: '', ts: '2026-10-16T12:00:00.000Z', invoiceNumber });
    const typesFor = (list) => list.map(a => `${a.type}:${a.payload.invoice?.number ?? a.payload.number ?? a.payload.payment?.invoiceNumber ?? a.payload.invoiceNumber ?? a.payload.paymentId}`);
    const mixed = () => [
      queueItem('save_payment', { payment: payment('p1', 1021) }),
      queueItem('save_payment', { payment: payment('p2', 1022) }),
      queueItem('update_payment_status', { number: 1021, status: 'paid' }),
      queueItem('update_payment_status', { number: 1022, status: 'paid' }),
      queueItem('delete_payment', { paymentId: 'p0' }),
      queueItem('clear_payments', { number: 1021 }),
      queueItem('sync_signature', { invoiceNumber: 1021 }),
      queueItem('delete_invoice', { number: 1021 }),
    ];

    it('a queued payment and status change of a deleted invoice are dropped, so no orphan payment row goes up', async () => {
      localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(mixed()));
      await deleteInvoice(1021);
      expect(typesFor(queued())).toEqual([
        'save_payment:1022', 'update_payment_status:1022', 'delete_payment:p0', 'clear_payments:1021', 'sync_signature:1021', 'delete_invoice:1021',
      ]);
    });

    it('...in the set-aside list too, and the banner is told', async () => {
      localStorage.setItem(STORAGE_KEYS.SYNC_FAILED, JSON.stringify(mixed()));
      const heard = vi.fn();
      window.addEventListener(SYNC_ATTENTION_EVENT, heard);
      await deleteInvoice(1021);
      window.removeEventListener(SYNC_ATTENTION_EVENT, heard);
      expect(typesFor(getFailedSyncs())).toEqual([
        'save_payment:1022', 'update_payment_status:1022', 'delete_payment:p0', 'clear_payments:1021', 'sync_signature:1021', 'delete_invoice:1021',
      ]);
      expect(heard).toHaveBeenCalled();
    });

    it('...and in the held list', async () => {
      localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([...mixed(), held(1021)]));
      await deleteInvoice(1021);
      expect(typesFor(getHeldSyncs())).toEqual([
        'save_payment:1022', 'update_payment_status:1022', 'delete_payment:p0', 'clear_payments:1021', 'sync_signature:1021', 'delete_invoice:1021',
      ]);
    });

    it('the payment cannot reach the cloud after the invoice is deleted; the clean-up still does', async () => {
      localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(mixed()));
      await deleteInvoice(1021);
      await processSyncQueue();
      expect(db.saveInvoicePayment.mock.calls.map(([p]) => p.invoiceNumber)).toEqual([1022]); // never 1021
      expect(db.updateInvoicePaymentStatus.mock.calls).toEqual([[1022, 'paid']]);
      expect(db.clearInvoicePayments).toHaveBeenCalledWith(1021);
      expect(db.deleteInvoicePayment).toHaveBeenCalledWith('p0');
      expect(db.deleteSignatureRow).toHaveBeenCalledWith(1021); // nothing on the phone to upload: it replays as a delete
      expect(db.saveSignatureRow).not.toHaveBeenCalled();
      expect(db.deleteInvoice).toHaveBeenCalledWith(1021);
    });
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
  fixedCalendar();

  it('an invoice refused and then edited is held once, not once per edit', async () => {
    db.saveInvoice.mockResolvedValue({ error: LIMIT });
    const logged = await muted(async () => {
      await saveInvoice({ number: 1021, items: [], total: 10 }); // refused, so queued
      await processSyncQueue(); // held
      await saveInvoice({ number: 1021, items: [], total: 12 }); // an edit: refused, queued
      await processSyncQueue(); // held again
      await saveInvoice({ number: 1021, items: [], total: 14 }); // and again
      await processSyncQueue();
    });
    expect(logged).toEqual([SAVE_FAILED, SAVE_FAILED, SAVE_FAILED]); // the three refusals, and nothing else
    expect(getHeldSyncs().map(a => a.payload.invoice.total)).toEqual([14]); // one entry: the newest copy
    expect(getUnsyncedCount()).toBe(1);
    render(<ThemeProvider><SyncAttentionBanner /></ThemeProvider>);
    expect(screen.getByText('1 invoice will upload Nov 1, or with Pro')).toBeInTheDocument();
  });

  it('holding another invoice keeps the ones already held', async () => {
    db.saveInvoice.mockResolvedValue({ error: LIMIT });
    const logged = await muted(async () => {
      await saveInvoice({ number: 1021, items: [] });
      await processSyncQueue();
      await saveInvoice({ number: 1022, items: [] });
      await processSyncQueue();
    });
    expect(logged).toEqual([SAVE_FAILED, SAVE_FAILED]);
    expect(getHeldSyncs().map(a => a.payload.invoice.number)).toEqual([1021, 1022]);
  });
});

describe('invoices not in the cloud yet stay on every screen (storage.getInvoices)', () => {
  // The Route list, Stores, Reports, End of Day, Home and Store Map all read getInvoices(), and while online it
  // returned the cloud's list alone: an invoice held for the free limit (or still queued) was nowhere until it
  // uploaded. Everything already made must stay usable (spec §1), so the phone's copy is laid over the cloud's.
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
    let list;
    expect(await muted(async () => { list = await getInvoices(); })).toEqual([READ_FELL_BACK]);
    expect(numbers(list)).toEqual([1021, 1020]);
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
