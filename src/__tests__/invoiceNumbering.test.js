/**
 * invoiceNumbering.test.js
 *
 * An invoice number is the key every save upserts on (user_id, invoice_number),
 * and the local cache replaces by number too. So handing out a number that an
 * existing invoice already holds does not create a second invoice — it
 * silently OVERWRITES the first one (header replaced, line items deleted).
 *
 * Two paths used to do exactly that:
 *   1. Offline: getNextInvoiceNumber fell back to a device counter that started
 *      at 1001 and never learned the cloud's numbers, so the first invoice made
 *      without signal reused #1002.
 *   2. Guest -> account: migration uploaded guest invoices under their device
 *      numbers, on top of the account's own invoices with the same numbers.
 *
 * The cloud boundary (services/db.js) is mocked; localStorage is jsdom's.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/db', () => {
  const ok = () => vi.fn(async () => ({ error: null }));
  return {
    getNextInvoiceNumber: vi.fn(),
    getInvoiceNumberIndex: vi.fn(),
    saveInvoice: ok(),
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
import { getNextInvoiceNumber } from '../utils/storage';
import { runMigrationIfNeeded } from '../services/migration';
import { STORAGE_KEYS } from '../utils/constants';

const offline = () => ({ data: 1001, error: new Error('fetch failed') });
const cloudNext = (n) => ({ data: n, error: null });
const set = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const get = (key) => JSON.parse(localStorage.getItem(key));
const cached = (...numbers) => numbers.map(n => ({ number: n, storeName: `Store ${n}`, createdAt: `2026-09-0${(n % 9) + 1}T10:00:00.000Z` }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // The offline cases log on purpose; keep the run's output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getNextInvoiceNumber', () => {
  it('offline, never reuses a number already on the device', async () => {
    db.getNextInvoiceNumber.mockResolvedValue(offline());
    set(STORAGE_KEYS.LIST, cached(1002, 1003, 1004, 1005));

    expect(await getNextInvoiceNumber()).toBe(1006);
  });

  it('online, skips a number held by an invoice still waiting to upload', async () => {
    // The cloud's max is 1050, but #1051 was made offline and is still queued.
    db.getNextInvoiceNumber.mockResolvedValue(cloudNext(1051));
    set(STORAGE_KEYS.LIST, cached(1050, 1051));

    expect(await getNextInvoiceNumber()).toBe(1052);
  });

  it('keeps counting from the cloud after the connection drops', async () => {
    db.getNextInvoiceNumber.mockResolvedValueOnce(cloudNext(1051));
    expect(await getNextInvoiceNumber()).toBe(1051);

    // The invoice list cache can be empty here (e.g. before the first load),
    // so the counter alone has to carry the cloud's position.
    db.getNextInvoiceNumber.mockResolvedValueOnce(offline());
    expect(await getNextInvoiceNumber()).toBe(1052);
  });

  it('a guest with nothing saved starts at 1001, as before', async () => {
    db.getNextInvoiceNumber.mockResolvedValue(offline());

    expect(await getNextInvoiceNumber()).toBe(1001);
  });
});

describe('runMigrationIfNeeded — guest invoices joining an account', () => {
  const guest1002 = { number: 1002, storeName: 'Corner Shop', createdAt: '2026-10-01T09:00:00.000Z', items: [] };

  it('renumbers a guest invoice whose number the account already uses for a different invoice', async () => {
    db.getInvoiceNumberIndex.mockResolvedValue({
      data: [
        { invoice_number: 1002, created_at: '2026-08-15T12:00:00.000Z' },
        { invoice_number: 1003, created_at: '2026-08-16T12:00:00.000Z' },
      ],
      error: null,
    });
    set(STORAGE_KEYS.LIST, [guest1002]);

    const result = await runMigrationIfNeeded();

    expect(result.errors).toEqual([]);
    expect(db.saveInvoice).toHaveBeenCalledTimes(1);
    expect(db.saveInvoice.mock.calls[0][0]).toMatchObject({ number: 1004, storeName: 'Corner Shop' });
    expect(get(STORAGE_KEYS.LIST)).toEqual([{ ...guest1002, number: 1004 }]);
  });

  it('moves the renumbered invoice\'s payments and signature with it', async () => {
    db.getInvoiceNumberIndex.mockResolvedValue({
      data: [{ invoice_number: 1002, created_at: '2026-08-15T12:00:00.000Z' }],
      error: null,
    });
    set(STORAGE_KEYS.LIST, [guest1002]);
    const payment = { id: 'p_1', amount: 20, note: '', ts: '2026-10-01T09:05:00.000Z' };
    set(STORAGE_KEYS.PAYMENTS, { 1002: [payment] });
    set(`${STORAGE_KEYS.SIG_PREFIX}1002`, { seller: 'data:seller', buyer: null, updatedAt: '2026-10-01T09:06:00.000Z' });

    await runMigrationIfNeeded();

    expect(get(STORAGE_KEYS.PAYMENTS)).toEqual({ 1003: [payment] });
    expect(db.saveInvoicePayment).toHaveBeenCalledWith({ ...payment, invoiceNumber: 1003 });
    expect(localStorage.getItem(`${STORAGE_KEYS.SIG_PREFIX}1002`)).toBeNull();
    expect(get(`${STORAGE_KEYS.SIG_PREFIX}1003`)).toMatchObject({ seller: 'data:seller' });
    expect(db.saveSignatureRow).toHaveBeenCalledWith({ invoiceNumber: 1003, seller: 'data:seller', buyer: null });
  });

  it('leaves an invoice alone when the cloud copy is the same invoice (a retried migration)', async () => {
    db.getInvoiceNumberIndex.mockResolvedValue({
      data: [{ invoice_number: 1002, created_at: '2026-10-01T09:00:00+00:00' }],
      error: null,
    });
    set(STORAGE_KEYS.LIST, [guest1002]);

    await runMigrationIfNeeded();

    expect(db.saveInvoice.mock.calls[0][0]).toMatchObject({ number: 1002 });
  });

  it('uploads no invoices, and retries next sign-in, when the account\'s numbers can\'t be read', async () => {
    db.getInvoiceNumberIndex.mockResolvedValue({ data: null, error: new Error('fetch failed') });
    set(STORAGE_KEYS.LIST, [guest1002]);

    const result = await runMigrationIfNeeded();

    expect(db.saveInvoice).not.toHaveBeenCalled();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(localStorage.getItem(STORAGE_KEYS.MIGRATED_AT)).toBeNull();
  });
});
