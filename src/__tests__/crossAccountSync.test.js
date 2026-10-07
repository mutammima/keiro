/**
 * crossAccountSync.test.js
 *
 * The cross-account caches (connection orders; invoices shared with a store)
 * refresh on every Realtime event, on a 1-10 min fallback poll, on every
 * foreground, and from each tab page's mount — four tab pages are mounted at
 * once. Each refresh used to re-download the WHOLE set, the read pattern that
 * blew the Supabase free-plan egress cap in Jul 2026 (CLAUDE.md, "Egress").
 *
 * Now: the first load after the app opens downloads everything; later loads
 * fetch the id list (tiny) plus only rows changed since the last load, and
 * concurrent loads share one request. The cache must still end up exactly
 * what the server has — rows added, changed, removed.
 *
 * The cloud boundary (services/db.js) is mocked; each test gets a fresh copy
 * of the storage module so its once-per-launch state starts clean.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/db', () => ({
  getConnectionOrders: vi.fn(),
  getConnectionOrderIds: vi.fn(),
  getConnectionOrdersChangedSince: vi.fn(),
  getSharedInvoices: vi.fn(),
  getSharedInvoiceIds: vi.fn(),
  getSharedInvoicesChangedSince: vi.fn(),
}));

let db;
let store;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  db = await import('../services/db');
  for (const fn of Object.values(db)) if (typeof fn?.mockReset === 'function') fn.mockReset();
  store = await import('../utils/connectionOrderStorage');
});

const order = (id, updated, extra = {}) => ({
  id, connection_id: 'c1', store_user_id: 's1', driver_user_id: 'd1',
  product_name: `Item ${id}`, quantity: 1, price: 2, status: 'pending',
  created_at: '2026-10-01T10:00:00.000Z', updated_at: updated, ...extra,
});
const rows = (...list) => ({ data: list, error: null });
const ids = (...list) => ({ data: list.map(id => ({ id })), error: null });

describe('loadConnectionOrdersFromCloud', () => {
  it('downloads everything on the first load after the app opens', async () => {
    db.getConnectionOrders.mockResolvedValue(rows(order('a', '2026-10-05T10:00:00.000Z')));

    const list = await store.loadConnectionOrdersFromCloud();

    expect(db.getConnectionOrders).toHaveBeenCalledTimes(1);
    expect(list.map(o => o.id)).toEqual(['a']);
  });

  it('after that, fetches only rows changed since the last load (with a 10-minute overlap)', async () => {
    db.getConnectionOrders.mockResolvedValue(rows(order('a', '2026-10-05T10:00:00.000Z')));
    await store.loadConnectionOrdersFromCloud();
    db.getConnectionOrderIds.mockResolvedValue(ids('a'));
    db.getConnectionOrdersChangedSince.mockResolvedValue(rows());

    await store.loadConnectionOrdersFromCloud();

    expect(db.getConnectionOrders).toHaveBeenCalledTimes(1);
    expect(db.getConnectionOrdersChangedSince).toHaveBeenCalledWith('2026-10-05T09:50:00.000Z');
  });

  it('applies changed and new rows, and drops rows the server no longer has', async () => {
    db.getConnectionOrders.mockResolvedValue(rows(
      order('a', '2026-10-05T10:00:00.000Z'),
      order('b', '2026-10-05T10:01:00.000Z'),
    ));
    await store.loadConnectionOrdersFromCloud();
    db.getConnectionOrderIds.mockResolvedValue(ids('a', 'c'));
    db.getConnectionOrdersChangedSince.mockResolvedValue(rows(
      order('a', '2026-10-05T11:00:00.000Z', { status: 'delivered' }),
      order('c', '2026-10-05T11:05:00.000Z'),
    ));

    const list = await store.loadConnectionOrdersFromCloud();

    expect(list.map(o => [o.id, o.status])).toEqual([['a', 'delivered'], ['c', 'pending']]);
    expect(store.getConnectionOrders()).toEqual(list);
  });

  it('falls back to a full download when the server has a row the cache never saw', async () => {
    db.getConnectionOrders.mockResolvedValueOnce(rows(order('a', '2026-10-05T10:00:00.000Z')));
    await store.loadConnectionOrdersFromCloud();
    // 'old' is older than the watermark, so the changed-since query can't return it.
    db.getConnectionOrderIds.mockResolvedValue(ids('a', 'old'));
    db.getConnectionOrdersChangedSince.mockResolvedValue(rows());
    db.getConnectionOrders.mockResolvedValueOnce(rows(
      order('a', '2026-10-05T10:00:00.000Z'),
      order('old', '2026-09-01T10:00:00.000Z'),
    ));

    const list = await store.loadConnectionOrdersFromCloud();

    expect(db.getConnectionOrders).toHaveBeenCalledTimes(2);
    expect(list.map(o => o.id).sort()).toEqual(['a', 'old']);
  });

  it('shares one download between loads that start at the same time', async () => {
    db.getConnectionOrders.mockResolvedValue(rows(order('a', '2026-10-05T10:00:00.000Z')));

    await Promise.all([
      store.loadConnectionOrdersFromCloud(),
      store.loadConnectionOrdersFromCloud(),
      store.loadConnectionOrdersFromCloud(),
    ]);

    expect(db.getConnectionOrders).toHaveBeenCalledTimes(1);
  });

  it('keeps the cache as it was when the cloud is unreachable', async () => {
    db.getConnectionOrders.mockResolvedValue(rows(order('a', '2026-10-05T10:00:00.000Z')));
    await store.loadConnectionOrdersFromCloud();
    db.getConnectionOrderIds.mockResolvedValue({ data: null, error: new Error('offline') });
    db.getConnectionOrdersChangedSince.mockResolvedValue({ data: null, error: new Error('offline') });

    const list = await store.loadConnectionOrdersFromCloud();

    expect(list.map(o => o.id)).toEqual(['a']);
  });
});

describe('loadSharedInvoicesFromCloud', () => {
  const inv = (id, number, updated, extra = {}) => ({
    id, invoice_number: number, business_name: 'Driver', date: 'October 5, 2026',
    payment_status: 'unpaid', created_at: '2026-10-01T10:00:00.000Z', updated_at: updated,
    invoice_items: [{ id: `${id}-1`, name: 'Milk', qty: 2, price: 3 }], ...extra,
  });

  it('after the first load, fetches only changed invoices and drops ones no longer shared', async () => {
    db.getSharedInvoices.mockResolvedValue(rows(
      inv('i1', 1001, '2026-10-05T10:00:00.000Z'),
      inv('i2', 1002, '2026-10-05T10:01:00.000Z'),
    ));
    await store.loadSharedInvoicesFromCloud();
    db.getSharedInvoiceIds.mockResolvedValue(ids('i1'));
    db.getSharedInvoicesChangedSince.mockResolvedValue(rows(
      inv('i1', 1001, '2026-10-05T12:00:00.000Z', { payment_status: 'paid' }),
    ));

    const list = await store.loadSharedInvoicesFromCloud();

    expect(db.getSharedInvoices).toHaveBeenCalledTimes(1);
    expect(db.getSharedInvoicesChangedSince).toHaveBeenCalledWith('2026-10-05T09:51:00.000Z');
    expect(list.map(i => [i.number, i.paymentStatus, i.items.length])).toEqual([[1001, 'paid', 1]]);
  });
});
