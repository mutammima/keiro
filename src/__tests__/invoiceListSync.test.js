/**
 * invoiceListSync.test.js
 *
 * storage.getInvoices() feeds nine screens (Home, Route, Stores, Reports, the
 * invoice form…). Each re-downloaded every invoice WITH its line items on
 * mount, several at the same moment at launch — the same read pattern as the
 * cross-account caches (see crossAccountSync.test.js), growing with every
 * invoice. Now it shares one download, fetches only changes after the first
 * load of a launch, and keeps the result in the local list (inv_list) so the
 * phone holds the whole account, not just invoices made on it.
 *
 * Invoices waiting in the sync queue are the phone's truth until they upload:
 * a queued save keeps the phone's version (or the invoice itself, if the cloud
 * has never seen it), and a queued delete keeps it gone.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/db', () => ({
  getInvoices: vi.fn(),
  getInvoiceNumberIndex: vi.fn(),
  getInvoicesChangedSince: vi.fn(),
}));

let db;
let storage;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  db = await import('../services/db');
  for (const fn of Object.values(db)) if (typeof fn?.mockReset === 'function') fn.mockReset();
  storage = await import('../utils/storage');
});

const inv = (number, updated, extra = {}) => ({
  number, invoice_number: number, storeName: `Store ${number}`, items: [{ id: `${number}-1`, name: 'Milk', qty: 1, price: 2 }],
  paymentStatus: 'unpaid', createdAt: `2026-10-0${number % 9 + 1}T10:00:00.000Z`, updated_at: updated, ...extra,
});
const ok = data => ({ data, error: null });
const index = (...numbers) => ok(numbers.map(n => ({ invoice_number: n })));
const queue = (...items) => localStorage.setItem('inv_sync_queue', JSON.stringify(items.map((it, i) => ({ id: `sq_${i}`, retries: 0, ts: 0, ...it }))));
const cachedList = () => JSON.parse(localStorage.getItem('inv_list') || '[]');

describe('getInvoices', () => {
  it('downloads everything on the first load of a launch, and keeps it on the phone', async () => {
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z'), inv(1002, '2026-10-05T11:00:00.000Z')]));

    const list = await storage.getInvoices();

    expect(list.map(i => i.number).sort()).toEqual([1001, 1002]);
    expect(cachedList().map(i => i.number).sort()).toEqual([1001, 1002]);
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

  it('shares one download between screens that ask at the same time', async () => {
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z')]));

    await Promise.all([storage.getInvoices(), storage.getInvoices(), storage.getInvoices()]);

    expect(db.getInvoices).toHaveBeenCalledTimes(1);
  });

  it('falls back to the phone\'s list when the cloud is unreachable (or the user is a guest)', async () => {
    localStorage.setItem('inv_list', JSON.stringify([inv(1001, '2026-10-05T10:00:00.000Z')]));
    db.getInvoices.mockResolvedValue({ data: null, error: new Error('no session') });

    const list = await storage.getInvoices();

    expect(list.map(i => i.number)).toEqual([1001]);
  });

  it('keeps an invoice made offline that is still queued, even though the cloud has never seen it', async () => {
    const offline = inv(1003, undefined, { storeName: 'Made offline' });
    localStorage.setItem('inv_list', JSON.stringify([offline]));
    queue({ type: 'save_invoice', payload: { invoice: offline } });
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z')]));

    const list = await storage.getInvoices();

    expect(list.map(i => i.number).sort()).toEqual([1001, 1003]);
  });

  it('shows the phone\'s version of an invoice edited offline until the edit uploads', async () => {
    queue({ type: 'save_invoice', payload: { invoice: inv(1001, undefined, { storeName: 'Edited offline' }) } });
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z')]));

    const list = await storage.getInvoices();

    expect(list.find(i => i.number === 1001).storeName).toBe('Edited offline');
  });

  it('keeps an invoice deleted offline gone, without re-downloading everything over it', async () => {
    db.getInvoices.mockResolvedValue(ok([inv(1001, '2026-10-05T10:00:00.000Z'), inv(1002, '2026-10-05T11:00:00.000Z')]));
    await storage.getInvoices();
    queue({ type: 'delete_invoice', payload: { number: 1002 } });
    localStorage.setItem('inv_list', JSON.stringify(cachedList().filter(i => i.number !== 1002)));
    db.getInvoiceNumberIndex.mockResolvedValue(index(1001, 1002)); // the cloud still has it
    db.getInvoicesChangedSince.mockResolvedValue(ok([]));

    const list = await storage.getInvoices();

    expect(list.map(i => i.number)).toEqual([1001]);
    expect(db.getInvoices).toHaveBeenCalledTimes(1);
  });
});
