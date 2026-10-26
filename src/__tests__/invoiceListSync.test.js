/**
 * invoiceListSync.test.js
 *
 * storage.getInvoices() feeds nine screens (Home, Route, Stores, Reports, the
 * invoice form…). Each re-downloaded every invoice WITH its line items on
 * mount, several at the same moment at launch — the same read pattern as the
 * cross-account caches (see crossAccountSync.test.js), growing with every
 * invoice. Now it shares one download, fetches only changes after the first
 * load of a launch, and keeps the account's cloud copy on the phone.
 *
 * That copy lives in its own key (inv_invoice_mirror), tagged with its account,
 * never in inv_list: inv_list is what migration uploads on sign-in, so cloud
 * copies there overwrote a guest's invoices and re-uploaded stale ones.
 *
 * Changes waiting in the sync queue are the phone's truth until they upload,
 * applied oldest first (set-aside changes are older than queued ones).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/db', () => ({
  getCurrentUserId: vi.fn(),
  getInvoices: vi.fn(),
  getInvoiceNumberIndex: vi.fn(),
  getInvoicesChangedSince: vi.fn(),
  saveInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
}));

let db;
let storage;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  db = await import('../services/db');
  for (const fn of Object.values(db)) if (typeof fn?.mockReset === 'function') fn.mockReset();
  db.getCurrentUserId.mockResolvedValue('user-a');
  storage = await import('../utils/storage');
});

const inv = (number, updated, extra = {}) => ({
  number, invoice_number: number, storeName: `Store ${number}`, items: [{ id: `${number}-1`, name: 'Milk', qty: 1, price: 2 }],
  paymentStatus: 'unpaid', createdAt: `2026-10-0${number % 9 + 1}T10:00:00.000Z`, updated_at: updated, ...extra,
});
const ok = data => ({ data, error: null });
const unreachable = { data: null, error: new Error('fetch failed') };
const index = (...numbers) => ok(numbers.map(n => ({ invoice_number: n })));
const queue = (...items) => localStorage.setItem('inv_sync_queue', JSON.stringify(items.map((it, i) => ({ id: `sq_${i}`, retries: 0, ts: 0, ...it }))));
const setAside = (...items) => localStorage.setItem('inv_sync_failed', JSON.stringify(items.map((it, i) => ({ id: `sf_${i}`, retries: 5, ts: 0, ...it }))));
const mirror = () => JSON.parse(localStorage.getItem('inv_invoice_mirror') || 'null');
const localList = () => JSON.parse(localStorage.getItem('inv_list') || '[]');
const numbers = list => list.map(i => i.number).sort();

describe('getInvoices', () => {
  it('downloads everything on the first load of a launch, and keeps it on the phone under its account', async () => {
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z'), inv(1002, '2026-10-05T11:00:00.000Z')]));

    const list = await storage.getInvoices();

    expect(numbers(list)).toEqual([1001, 1002]);
    expect(mirror().owner).toBe('user-a');
    expect(numbers(mirror().rows)).toEqual([1001, 1002]);
  });

  it('after that, fetches only invoices changed since the last load, and drops deleted ones', async () => {
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z'), inv(1002, '2026-10-05T11:00:00.000Z')]));
    await storage.getInvoices();
    db.getInvoiceNumberIndex.mockResolvedValue(index(1002));
    db.getInvoicesChangedSince.mockResolvedValue(ok([inv(1002, '2026-10-05T12:00:00.000Z', { paymentStatus: 'paid' })]));

    const list = await storage.getInvoices();

    expect(db.getInvoices).toHaveBeenCalledTimes(1);
    expect(db.getInvoicesChangedSince).toHaveBeenCalledWith('2026-10-05T10:50:00.000Z');
    expect(list.map(i => [i.number, i.paymentStatus])).toEqual([[1002, 'paid']]);
  });

  it('downloads everything again, rather than freezing the list, when the server has no updated_at column', async () => {
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z')]));
    await storage.getInvoices();
    db.getInvoiceNumberIndex.mockResolvedValue(index(1001, 1002));
    db.getInvoicesChangedSince.mockResolvedValue({ data: null, error: { code: '42703', message: 'column invoices.updated_at does not exist' } });
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z'), inv(1002, '2026-10-05T11:00:00.000Z')]));

    const list = await storage.getInvoices();

    expect(db.getInvoices).toHaveBeenCalledTimes(2);
    expect(numbers(list)).toEqual([1001, 1002]);
  });

  it('shares one download between screens that ask at the same time', async () => {
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z')]));

    await Promise.all([storage.getInvoices(), storage.getInvoices(), storage.getInvoices()]);

    expect(db.getInvoices).toHaveBeenCalledTimes(1);
  });

  it('shows the account\'s copy when a later refresh can\'t reach the cloud', async () => {
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z')]));
    await storage.getInvoices();
    db.getInvoiceNumberIndex.mockResolvedValue(unreachable);
    db.getInvoicesChangedSince.mockResolvedValue(unreachable);

    expect(numbers(await storage.getInvoices())).toEqual([1001]);
  });

  it('falls back to the invoices made on this phone for a guest', async () => {
    db.getCurrentUserId.mockResolvedValue(null);
    localStorage.setItem('inv_list', JSON.stringify([inv(1001, undefined)]));
    db.getInvoices.mockResolvedValue({ data: null, error: new Error('no session') });

    expect(numbers(await storage.getInvoices())).toEqual([1001]);
  });
});

describe('the phone\'s own invoices (inv_list) stay the phone\'s own', () => {
  it('a guest signing into an existing account keeps their invoices for migration, untouched by the download', async () => {
    const guestMade = inv(1001, undefined, { storeName: 'Made as a guest' });
    localStorage.setItem('inv_list', JSON.stringify([guestMade]));
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z', { storeName: 'The account\'s own 1001' })]));

    await storage.getInvoices();

    expect(localList()).toEqual([guestMade]);
  });

  it('migration after a download uploads only invoices made on this phone, never the cloud\'s copies', async () => {
    localStorage.setItem('inv_list', JSON.stringify([inv(1005, undefined, { createdAt: '2026-10-07T10:00:00.000Z' })]));
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z'), inv(1002, '2026-10-05T11:00:00.000Z')]));
    db.getInvoiceNumberIndex.mockResolvedValue(ok([
      { invoice_number: 1001, created_at: '2026-10-02T10:00:00.000Z' },
      { invoice_number: 1002, created_at: '2026-10-03T10:00:00.000Z' },
    ]));
    db.saveInvoice.mockResolvedValue({ error: null });
    await storage.getInvoices();

    const { runMigrationIfNeeded } = await import('../services/migration');
    await runMigrationIfNeeded();

    expect(db.saveInvoice.mock.calls.map(([i]) => i.number)).toEqual([1005]);
  });
});

describe('switching accounts', () => {
  it('starts the new account from a full download and never shows the previous account\'s rows', async () => {
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z', { storeName: 'A\'s 1001' })]));
    await storage.getInvoices();

    db.getCurrentUserId.mockResolvedValue('user-b');
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T09:00:00.000Z', { storeName: 'B\'s 1001' })]));
    const list = await storage.getInvoices();

    expect(db.getInvoicesChangedSince).not.toHaveBeenCalled();
    expect(list.map(i => i.storeName)).toEqual(['B\'s 1001']);
    expect(mirror().owner).toBe('user-b');
  });

  it('does not write an account\'s copy back after it signed out during the download', async () => {
    let finish;
    db.getInvoices.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = storage.getInvoices();
    await Promise.resolve();

    db.getCurrentUserId.mockResolvedValue(null); // signed out; sign-out wiped the inv_* keys
    finish(ok([inv(1001, '2026-10-05T10:00:00.000Z')]));
    await pending;

    expect(mirror()).toBeNull();
  });

  it('does not show the previous account\'s copy to a new account that can\'t reach the cloud', async () => {
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z', { storeName: 'A\'s 1001' })]));
    await storage.getInvoices();

    db.getCurrentUserId.mockResolvedValue('user-b');
    db.getInvoices.mockResolvedValue(unreachable);
    const list = await storage.getInvoices();

    expect(list.map(i => i.storeName)).not.toContain('A\'s 1001');
  });
});

describe('changes still waiting to upload', () => {
  const twoOnServer = () => db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z'), inv(1002, '2026-10-05T11:00:00.000Z')]));

  it('keeps an invoice made offline that is still queued, even though the cloud has never seen it', async () => {
    const offline = inv(1003, undefined, { storeName: 'Made offline' });
    queue({ type: 'save_invoice', payload: { invoice: offline } });
    twoOnServer();

    const list = await storage.getInvoices();

    expect(numbers(list)).toEqual([1001, 1002, 1003]);
    expect(numbers(mirror().rows)).toEqual([1001, 1002]); // the copy stays the cloud's
  });

  it('shows the phone\'s version of an invoice edited offline until the edit uploads', async () => {
    queue({ type: 'save_invoice', payload: { invoice: inv(1001, undefined, { storeName: 'Edited offline' }) } });
    twoOnServer();

    const list = await storage.getInvoices();

    expect(list.find(i => i.number === 1001).storeName).toBe('Edited offline');
  });

  it('keeps an invoice deleted offline gone, without re-downloading everything over it', async () => {
    twoOnServer();
    await storage.getInvoices();
    queue({ type: 'delete_invoice', payload: { number: 1002 } });
    db.getInvoiceNumberIndex.mockResolvedValue(index(1001, 1002)); // the cloud still has it
    db.getInvoicesChangedSince.mockResolvedValue(ok([]));

    const list = await storage.getInvoices();

    expect(numbers(list)).toEqual([1001]);
    expect(db.getInvoices).toHaveBeenCalledTimes(1);
  });

  it('keeps a payment status changed offline', async () => {
    queue({ type: 'update_payment_status', payload: { number: 1001, status: 'paid' } });
    twoOnServer();

    const list = await storage.getInvoices();

    expect(list.find(i => i.number === 1001).paymentStatus).toBe('paid');
  });

  it('a set-aside save does not bring back an invoice deleted after it', async () => {
    setAside({ type: 'save_invoice', payload: { invoice: inv(1002, undefined, { storeName: 'Older edit' }) } });
    queue({ type: 'delete_invoice', payload: { number: 1002 } });
    twoOnServer();

    expect(numbers(await storage.getInvoices())).toEqual([1001]);
  });

  it('a set-aside save does not hide a newer queued edit of the same invoice', async () => {
    setAside({ type: 'save_invoice', payload: { invoice: inv(1001, undefined, { storeName: 'Older edit' }) } });
    queue({ type: 'save_invoice', payload: { invoice: inv(1001, undefined, { storeName: 'Newer edit' }) } });
    twoOnServer();

    const list = await storage.getInvoices();

    expect(list.find(i => i.number === 1001).storeName).toBe('Newer edit');
  });
});

describe('this phone\'s writes reach the account\'s copy at once', () => {
  beforeEach(async () => {
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z'), inv(1002, '2026-10-05T11:00:00.000Z')]));
    await storage.getInvoices();
  });

  it('a saved invoice', async () => {
    db.saveInvoice.mockResolvedValue({ error: null });
    await storage.saveInvoice(inv(1003, undefined));
    expect(numbers(mirror().rows)).toEqual([1001, 1002, 1003]);
  });

  it('a deleted invoice', async () => {
    db.deleteInvoice.mockResolvedValue({ error: null });
    await storage.deleteInvoice(1002);
    expect(numbers(mirror().rows)).toEqual([1001]);
  });
});
