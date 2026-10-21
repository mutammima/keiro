/**
 * invoiceFlow.test.jsx
 *
 * Covers the invoice create → generate flow end to end at the hook level
 * (src/hooks/useInvoiceForm.js), which is where all the business logic for
 * "New Invoice" lives — NewInvoice.jsx itself is pure UI over this hook (see
 * CLAUDE.md "The two big stateful hooks"). This is the flow flagged as most
 * likely to regress silently: validation gates (empty store, no items, $0
 * total), the generate → save → reset → onGenerated sequence, and edit mode.
 *
 * The cloud/localStorage boundary (utils/storage.js) is mocked so this test
 * exercises only the hook's own logic, not Supabase or real persistence.
 *
 * Environment: jsdom (renderHook needs a DOM even though nothing is painted).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useInvoiceForm } from '../hooks/useInvoiceForm.js';

// ─── Mock the storage boundary ────────────────────────────────────────────────
vi.mock('../utils/storage', () => ({
  getNextInvoiceNumber: vi.fn(async () => 1001),
  getInvoices: vi.fn(async () => []),
  saveInvoice: vi.fn(async () => {}),
  getProductByBarcode: vi.fn(async () => null),
  getProductByName: vi.fn(async () => null),
  saveProductBarcode: vi.fn(async () => {}),
  saveStoreName: vi.fn(async () => {}),
  saveProductName: vi.fn(() => {}),
  getStoreNames: vi.fn(async () => []),
  getProductNames: vi.fn(() => []),
  getSharedProductName: vi.fn(async () => null),
  getSharedProductSuggestions: vi.fn(async () => []),
  getBusinessName: vi.fn(() => ''),
  saveBusinessName: vi.fn(() => {}),
  getBusinessPhone: vi.fn(() => ''),
  saveBusinessPhone: vi.fn(() => {}),
  getStoreDetails: vi.fn(async () => ({ phone: '', address: '' })),
  saveStoreDetails: vi.fn(async () => {}),
  getPinnedStores: vi.fn(() => []),
}));
vi.mock('../utils/barcodeApi', () => ({ lookupBarcode: vi.fn(async () => ({ name: null, status: 'not-found' })) }));
vi.mock('../utils/orderSuggestions', () => ({
  buildOrderSuggestions: vi.fn(() => []),
  checkInvoiceAnomaly: vi.fn(() => null),
}));
vi.mock('../utils/connectionOrderStorage', () => ({
  completeActiveConnectionOrder: vi.fn(() => {}),
  resolveConnectedStoreUserId: vi.fn(() => null),
}));
vi.mock('../utils/guestMode', () => ({ canSaveGuestEntry: vi.fn(() => true) }));

import { saveInvoice, saveStoreName, getNextInvoiceNumber, saveProductBarcode, getProductByBarcode, getInvoices, getStoreDetails, saveStoreDetails, getSharedProductName, getSharedProductSuggestions, getProductNames } from '../utils/storage';
import { lookupBarcode } from '../utils/barcodeApi';
import { completeActiveConnectionOrder } from '../utils/connectionOrderStorage';
import { canSaveGuestEntry } from '../utils/guestMode';
import { STORAGE_FULL_MESSAGE, UNKNOWN_BARCODE_MESSAGE, LOOKUP_UNAVAILABLE_MESSAGE, STORE_MADE_BARCODE_MESSAGE, LOOKING_UP_TEXT, STORAGE_KEYS, EVENTS } from '../utils/constants';
import { seedFreePlan, monthNow } from './helpers/freePlan';

/** Fills store name + adds one line item, leaving the hook ready to generate. */
function addOneItem(result, { name = 'Widget', qty = '3', price = '5' } = {}) {
  act(() => { result.current.handleStoreNameChange('Corner Store'); });
  act(() => { result.current.setProductName(name); });
  act(() => { result.current.setQty(qty); });
  act(() => { result.current.setPrice(price); });
  act(() => { result.current.addItem(); });
}

// ─── The free plan's monthly limit ────────────────────────────────────────────
// plan.js reads localStorage directly, so these seed the same keys it reads.

/** This phone's own count of the new invoices it made this month. */
function seedPhoneCount(count) {
  localStorage.setItem(STORAGE_KEYS.USAGE, JSON.stringify({ month: monthNow(), count }));
}
const phoneCount = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.USAGE)).count;
/** Runs `run` and returns how many times it asked for the limit sheet (UpgradeHost opens it on this event). */
async function limitSheetOpens(run) {
  const opened = vi.fn();
  window.addEventListener(EVENTS.OPEN_FREE_LIMIT, opened);
  try { await run(); } finally { window.removeEventListener(EVENTS.OPEN_FREE_LIMIT, opened); }
  return opened.mock.calls.length;
}
/** Puts invoice #1042 up for editing, the way Edit in the history does. */
function prefillEdit() {
  localStorage.setItem(STORAGE_KEYS.PREFILL, JSON.stringify({
    storeName: 'Corner Store', editNumber: 1042, paymentStatus: 'paid',
    createdAt: '2026-10-01T00:00:00.000Z', items: [{ id: 'a', name: 'Widget', qty: 3, price: 5 }],
  }));
}

describe('useInvoiceForm — create → generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    canSaveGuestEntry.mockReturnValue(true);
    getNextInvoiceNumber.mockResolvedValue(1001);
  });

  it('rejects generation with no store name', async () => {
    const onGenerated = vi.fn();
    const { result } = renderHook(() => useInvoiceForm(onGenerated));

    act(() => { result.current.setProductName('Widget'); });
    // No store name set — handleGenerate should bail before touching storage.
    await act(async () => { await result.current.handleGenerate(); });

    expect(result.current.error).toBe('Enter a store name.');
    expect(saveInvoice).not.toHaveBeenCalled();
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('rejects generation with a store name but no items', async () => {
    const onGenerated = vi.fn();
    const { result } = renderHook(() => useInvoiceForm(onGenerated));

    act(() => { result.current.handleStoreNameChange('Corner Store'); });
    await act(async () => { await result.current.handleGenerate(); });

    expect(result.current.error).toBe('Add at least one item.');
    expect(saveInvoice).not.toHaveBeenCalled();
  });

  it('adds a line item via addItem() with the entered name/qty/price', () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    addOneItem(result);

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ name: 'Widget', qty: 3, price: 5 });
    // Fields reset after adding.
    expect(result.current.productName).toBe('');
    expect(result.current.price).toBe('');
  });

  it('generates the invoice: saves it, resets the form, and calls onGenerated', async () => {
    const onGenerated = vi.fn();
    const { result } = renderHook(() => useInvoiceForm(onGenerated));

    addOneItem(result);
    expect(result.current.items).toHaveLength(1);

    await act(async () => { await result.current.handleGenerate(); });

    expect(saveInvoice).toHaveBeenCalledTimes(1);
    const saved = saveInvoice.mock.calls[0][0];
    expect(saved).toMatchObject({
      number: 1001,
      storeName: 'Corner Store',
      paymentStatus: 'unpaid',
      items: [{ name: 'Widget', qty: 3, price: 5 }],
    });
    expect(saveStoreName).toHaveBeenCalledWith('Corner Store');
    expect(completeActiveConnectionOrder).toHaveBeenCalledWith(1001);

    expect(onGenerated).toHaveBeenCalledTimes(1);
    expect(onGenerated.mock.calls[0][0]).toMatchObject({ number: 1001, storeName: 'Corner Store' });

    // Form resets for the next invoice.
    expect(result.current.items).toHaveLength(0);
    expect(result.current.storeName).toBe('');
  });

  it('keeps the form when the invoice reached neither the cloud nor this phone', async () => {
    saveInvoice.mockResolvedValueOnce({ error: new Error('offline'), savedLocally: false });
    const onGenerated = vi.fn();
    const { result } = renderHook(() => useInvoiceForm(onGenerated));

    addOneItem(result);
    await act(async () => { await result.current.handleGenerate(); });

    expect(result.current.error).toBe(STORAGE_FULL_MESSAGE);
    expect(onGenerated).not.toHaveBeenCalled();
    expect(saveStoreName).not.toHaveBeenCalled();
    expect(result.current.items).toHaveLength(1);           // nothing typed is lost
    expect(result.current.storeName).toBe('Corner Store');
  });

  it('carries on when the cloud saved it even though this phone is full', async () => {
    saveInvoice.mockResolvedValueOnce({ error: null, savedLocally: false });
    const onGenerated = vi.fn();
    const { result } = renderHook(() => useInvoiceForm(onGenerated));

    addOneItem(result);
    await act(async () => { await result.current.handleGenerate(); });

    expect(result.current.error).toBe('');
    expect(onGenerated).toHaveBeenCalledTimes(1);
  });

  it('holds for confirmation on a $0.00 total instead of silently saving', async () => {
    const onGenerated = vi.fn();
    const { result } = renderHook(() => useInvoiceForm(onGenerated));

    addOneItem(result, { price: '0' });
    await act(async () => { await result.current.handleGenerate(); });

    // Blocked — needs explicit confirmation, not saved yet.
    expect(result.current.zeroConfirm).toBe(true);
    expect(saveInvoice).not.toHaveBeenCalled();

    // Confirming re-runs generation and this time it goes through.
    await act(async () => { await result.current.confirmZeroTotal(); });
    await waitFor(() => expect(saveInvoice).toHaveBeenCalledTimes(1));
    expect(saveInvoice.mock.calls[0][0].items[0].price).toBe(0);
  });

  it('blocks a new invoice at the guest entry cap and does not save', async () => {
    canSaveGuestEntry.mockReturnValue(false);
    const onGenerated = vi.fn();
    const { result } = renderHook(() => useInvoiceForm(onGenerated));

    addOneItem(result);
    await act(async () => { await result.current.handleGenerate(); });

    expect(result.current.guestWall).toBe(true);
    expect(saveInvoice).not.toHaveBeenCalled();
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('updates the SAME invoice number in place when editing, without consuming a guest entry', async () => {
    canSaveGuestEntry.mockReturnValue(false); // edits must bypass the guest cap entirely
    const onGenerated = vi.fn();

    // There's no public setter for editNumber — it's populated from the
    // PREFILL localStorage key by an effect that runs once on mount (this is
    // how NewInvoice.jsx enters edit mode from the "Edit" menu action).
    localStorage.setItem('inv_prefill', JSON.stringify({
      storeName: 'Corner Store', editNumber: 1042, paymentStatus: 'paid',
      createdAt: '2025-01-01T00:00:00.000Z', items: [{ id: 'a', name: 'Widget', qty: 3, price: 5 }],
    }));
    const { result } = renderHook(() => useInvoiceForm(onGenerated));
    await waitFor(() => expect(result.current.editNumber).toBe(1042));
    expect(result.current.items).toHaveLength(1); // prefilled from the edited invoice

    await act(async () => { await result.current.handleGenerate(); });

    const saved = saveInvoice.mock.calls.at(-1)[0];
    expect(saved.number).toBe(1042);
    expect(saved.paymentStatus).toBe('paid'); // preserved from the edited invoice, not reset to 'unpaid'
    expect(completeActiveConnectionOrder).not.toHaveBeenCalled(); // edits never complete a connection order
  });

  it('free plan: at 20 new invoices this month Make invoice opens the limit sheet and saves nothing', async () => {
    seedFreePlan(20);
    const limit = vi.fn();
    window.addEventListener(EVENTS.OPEN_FREE_LIMIT, limit);
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    addOneItem(result);
    await act(async () => { await result.current.handleGenerate(); });
    window.removeEventListener(EVENTS.OPEN_FREE_LIMIT, limit);
    expect(limit).toHaveBeenCalledTimes(1);
    expect(saveInvoice).not.toHaveBeenCalled();
  });

  it('each new invoice is counted on this phone; an edit is not', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    addOneItem(result);
    await act(async () => { await result.current.handleGenerate(); });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.USAGE)).count).toBe(1);
  });

  it('an edit is not counted', async () => {
    seedPhoneCount(7);
    prefillEdit();
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await waitFor(() => expect(result.current.editNumber).toBe(1042));

    await act(async () => { await result.current.handleGenerate(); });

    expect(saveInvoice).toHaveBeenCalledTimes(1);
    expect(phoneCount()).toBe(7);
  });

  it('an edit still saves when the month’s 20 are used up', async () => {
    seedFreePlan(20);
    seedPhoneCount(20);
    prefillEdit();
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await waitFor(() => expect(result.current.editNumber).toBe(1042));

    const opens = await limitSheetOpens(() => act(async () => { await result.current.handleGenerate(); }));

    expect(opens).toBe(0);
    expect(saveInvoice).toHaveBeenCalledTimes(1);
    expect(saveInvoice.mock.calls[0][0].number).toBe(1042);
    expect(phoneCount()).toBe(20);
  });

  it('a duplicate counts like any other new invoice', async () => {
    // Duplicate hands the form the old invoice's lines with no editNumber, so it is a fresh create.
    localStorage.setItem(STORAGE_KEYS.PREFILL, JSON.stringify({
      storeName: 'Corner Store', items: [{ id: 'dup_1', name: 'Widget', qty: 3, price: 5 }],
    }));
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => { await result.current.handleGenerate(); });

    expect(saveInvoice).toHaveBeenCalledTimes(1);
    expect(phoneCount()).toBe(1);
  });

  it('the 20th new invoice goes through and the 21st opens the limit sheet', async () => {
    seedPhoneCount(19);
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));

    addOneItem(result);
    const first = await limitSheetOpens(() => act(async () => { await result.current.handleGenerate(); }));
    expect(first).toBe(0);
    expect(saveInvoice).toHaveBeenCalledTimes(1);
    expect(phoneCount()).toBe(20);

    addOneItem(result);
    const second = await limitSheetOpens(() => act(async () => { await result.current.handleGenerate(); }));
    expect(second).toBe(1);
    expect(saveInvoice).toHaveBeenCalledTimes(1); // still only the 20th
    expect(phoneCount()).toBe(20);
    expect(result.current.items).toHaveLength(1); // nothing the driver typed is lost
  });

  it('an invoice that reached neither the cloud nor this phone is not counted', async () => {
    saveInvoice.mockResolvedValueOnce({ error: new Error('offline'), savedLocally: false });
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    addOneItem(result);

    await act(async () => { await result.current.handleGenerate(); });

    expect(result.current.error).toBe(STORAGE_FULL_MESSAGE);
    expect(localStorage.getItem(STORAGE_KEYS.USAGE)).toBeNull();
  });

  it('one only the cloud saved (this phone is full) is counted', async () => {
    saveInvoice.mockResolvedValueOnce({ error: null, savedLocally: false });
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    addOneItem(result);

    await act(async () => { await result.current.handleGenerate(); });

    expect(phoneCount()).toBe(1);
  });

  it('one the cloud refused but this phone kept (offline, queued to sync) is counted', async () => {
    // Every offline save looks like this (storage.js saveInvoice: the cache write succeeds, then the upload is queued),
    // and this phone's own count is the only one that sees these invoices before they sync.
    saveInvoice.mockResolvedValueOnce({ error: new Error('offline'), savedLocally: true });
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    addOneItem(result);

    await act(async () => { await result.current.handleGenerate(); });

    expect(result.current.error).toBe('');
    expect(phoneCount()).toBe(1);
  });

  it.each([
    ['a Pro driver', () => localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: true, source: 'manual', proUntil: null, usedThisMonth: 40, month: monthNow() }))],
    ['a guest', () => localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true')],
    ['a store owner', () => localStorage.setItem(STORAGE_KEYS.USER_ROLE, JSON.stringify('store_owner'))],
  ])('%s is never stopped by the plan, however many are counted', async (_who, setUp) => {
    setUp();
    seedPhoneCount(40);
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    addOneItem(result);

    const opens = await limitSheetOpens(() => act(async () => { await result.current.handleGenerate(); }));

    expect(opens).toBe(0);
    expect(saveInvoice).toHaveBeenCalledTimes(1);
  });
});

describe('useInvoiceForm — scanning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('on an unknown barcode, says to type the name once and that Keiro will remember it', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));

    await act(async () => { await result.current.handleScan('0071181000240'); });

    expect(result.current.productName).toBe('');
    expect(result.current.error).toBe(UNKNOWN_BARCODE_MESSAGE);
    expect(UNKNOWN_BARCODE_MESSAGE).toMatch(/remember/i);
  });

  it('saves the typed name under the scanned barcode, so the next scan finds it', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await act(async () => { await result.current.handleScan('0071181000240'); });

    addOneItem(result, { name: 'Motor Oil 5W-30 5qt', qty: '2', price: '24.99' });

    expect(saveProductBarcode).toHaveBeenCalledWith('0071181000240', 'Motor Oil 5W-30 5qt', 24.99);
  });

  it('when the lookup could not run, says so and offers Try again instead of "not in the database"', async () => {
    lookupBarcode.mockResolvedValueOnce({ name: null, status: 'unavailable' });
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));

    await act(async () => { await result.current.handleScan('049000006346'); });

    expect(result.current.error).toBe(LOOKUP_UNAVAILABLE_MESSAGE);
    expect(result.current.lookupUnavailable).toBe(true);
    expect(result.current.lastBarcode).toBe('049000006346');
  });

  it('Try again re-runs the lookup for the same barcode and offers the name', async () => {
    lookupBarcode
      .mockResolvedValueOnce({ name: null, status: 'unavailable' })
      .mockResolvedValueOnce({ name: 'Coca-Cola Can, 12 fl oz', status: 'found' });
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await act(async () => { await result.current.handleScan('049000006346'); });

    await act(async () => { await result.current.retryLookup(); });

    expect(lookupBarcode).toHaveBeenLastCalledWith('049000006346');
    expect(result.current.productName).toBe('');
    expect(result.current.pendingName).toEqual({ name: 'Coca-Cola Can, 12 fl oz', source: 'database' });
    expect(result.current.error).toBe('');
    expect(result.current.lookupUnavailable).toBe(false);
  });

  it('a store-made barcode skips the lookups and says no database will have it', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));

    await act(async () => { await result.current.handleScan('212345678900'); });

    expect(lookupBarcode).not.toHaveBeenCalled();
    expect(result.current.error).toBe(STORE_MADE_BARCODE_MESSAGE);
    expect(result.current.lookupUnavailable).toBe(false);
  });

  it('a store-made barcode the driver already named still fills from his catalog', async () => {
    getProductByBarcode.mockResolvedValueOnce({ name: 'Deli turkey 1lb', lastPrice: 8 });
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));

    await act(async () => { await result.current.handleScan('212345678900'); });

    expect(result.current.productName).toBe('Deli turkey 1lb');
    expect(result.current.price).toBe('8');
    expect(result.current.error).toBe('');
  });

  it('expands a short UPC-E scan and looks up, shows and saves the full code', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));

    await act(async () => { await result.current.handleScan('04963406', 'UPC_E'); });

    expect(result.current.lastBarcode).toBe('049000006346');
    expect(getProductByBarcode).toHaveBeenCalledWith('049000006346');
    expect(lookupBarcode).toHaveBeenCalledWith('049000006346');

    addOneItem(result, { name: 'Coke can 12oz', qty: '24', price: '1.25' });
    expect(saveProductBarcode).toHaveBeenCalledWith('049000006346', 'Coke can 12oz', 1.25);
  });

  it('still finds a product saved under its short code before codes were expanded', async () => {
    getProductByBarcode
      .mockResolvedValueOnce(null)                                     // '049000006346'
      .mockResolvedValueOnce({ name: 'Coke can 12oz', lastPrice: 1.25 }); // '04963406'
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));

    await act(async () => { await result.current.handleScan('04963406', 'UPC_E'); });

    expect(getProductByBarcode.mock.calls.map(([code]) => code)).toEqual(['049000006346', '04963406']);
    expect(result.current.productName).toBe('Coke can 12oz');
    expect(result.current.price).toBe('1.25');
    expect(lookupBarcode).not.toHaveBeenCalled();
  });
});

describe('useInvoiceForm — Easy invoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    canSaveGuestEntry.mockReturnValue(true);
    getNextInvoiceNumber.mockResolvedValue(1001);
  });

  /** Adds one typed line (no store), leaving the hook ready to generate. */
  function addLine(result, { name = 'Mobil 1 5W-30 5qt', qty = '1', price = '24.99' } = {}) {
    act(() => { result.current.setProductName(name); });
    act(() => { result.current.setQty(qty); });
    act(() => { result.current.setPrice(price); });
    let added;
    act(() => { added = result.current.addItem(); });
    return added;
  }

  it('makes an invoice with no store, and saves no store name', async () => {
    const onGenerated = vi.fn();
    const { result } = renderHook(() => useInvoiceForm(onGenerated, { easy: true }));
    expect(addLine(result)).toBe(true);

    await act(async () => { await result.current.handleGenerate(); });

    expect(saveInvoice).toHaveBeenCalledTimes(1);
    expect(saveInvoice.mock.calls[0][0].storeName).toBe('');
    expect(saveStoreName).not.toHaveBeenCalled();
    expect(onGenerated).toHaveBeenCalledTimes(1);
  });

  it('a barcode already on the list reopens that line with +1, and Add updates it', async () => {
    getProductByBarcode.mockResolvedValueOnce({ name: 'Mobil 1 5W-30 5qt', lastPrice: 24.99 });
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));

    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(result.current.productName).toBe('Mobil 1 5W-30 5qt');
    expect(result.current.price).toBe('24.99');
    act(() => { result.current.addItem(); });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ qty: 1, barcode: '071924145009' });

    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(getProductByBarcode).toHaveBeenCalledTimes(1); // the rescan didn't look it up again
    expect(result.current.qty).toBe('2');
    expect(result.current.replaceLineId).toBe(result.current.items[0].id);

    act(() => { result.current.addItem(); });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].qty).toBe(2);
    expect(result.current.replaceLineId).toBeNull();
  });

  it('a new scan after tapping a line adds a new line instead of replacing it', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    addLine(result);
    act(() => { result.current.loadItemIntoForm(result.current.items[0]); });
    expect(result.current.replaceLineId).not.toBeNull();

    getProductByBarcode.mockResolvedValueOnce({ name: 'Coke can 12oz', lastPrice: 1.25 });
    await act(async () => { await result.current.handleScan('049000006346', 'UPC_A'); });
    expect(result.current.replaceLineId).toBeNull();
    act(() => { result.current.addItem(); });
    expect(result.current.items.map(i => i.name)).toEqual(['Mobil 1 5W-30 5qt', 'Coke can 12oz']);
  });

  it('tapping a line and changing its price updates that line', () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    addLine(result);
    act(() => { result.current.loadItemIntoForm(result.current.items[0]); });
    expect(result.current.qty).toBe('1');
    act(() => { result.current.setPrice('20'); });
    act(() => { result.current.addItem(); });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].price).toBe(20);
  });

  it('clearAddForm empties the fields and forgets the line being edited', () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    addLine(result);
    act(() => { result.current.loadItemIntoForm(result.current.items[0]); });
    act(() => { result.current.clearAddForm(); });
    expect(result.current.productName).toBe('');
    expect(result.current.qty).toBe('1');
    expect(result.current.price).toBe('');
    expect(result.current.replaceLineId).toBeNull();
  });

  it('Add while the name is still being looked up does nothing', async () => {
    let finishLookup;
    lookupBarcode.mockReturnValueOnce(new Promise(resolve => { finishLookup = resolve; }));
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));

    let pending;
    act(() => { pending = result.current.handleScan('0071181000240'); });
    await waitFor(() => expect(result.current.productName).toBe(LOOKING_UP_TEXT));
    act(() => { result.current.setPrice('5'); });

    let added;
    act(() => { added = result.current.addItem(); });
    expect(added).toBe(false);
    expect(result.current.items).toHaveLength(0);
    expect(saveProductBarcode).not.toHaveBeenCalled();

    await act(async () => { finishLookup({ name: null, status: 'not-found' }); await pending; });
  });

  it('recentStores lists the 3 most recently invoiced stores, newest first, no repeats or blanks', async () => {
    getInvoices.mockResolvedValueOnce([
      { storeName: 'Old Mart',     createdAt: '2026-10-01T10:00:00Z' },
      { storeName: 'Sunrise Deli', createdAt: '2026-10-13T10:00:00Z' },
      { storeName: '',             createdAt: '2026-10-14T09:00:00Z' },
      { storeName: 'Corner Mart',  createdAt: '2026-10-12T10:00:00Z' },
      { storeName: 'sunrise deli', createdAt: '2026-10-11T10:00:00Z' },
      { storeName: 'Bodega 1',     createdAt: '2026-10-10T10:00:00Z' },
    ]);
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await waitFor(() => expect(result.current.recentStores).toEqual(['Sunrise Deli', 'Corner Mart', 'Bodega 1']));
  });

  it('editing a normal-mode invoice in Easy Mode keeps the fields Easy Mode doesn’t show', async () => {
    localStorage.setItem('inv_prefill', JSON.stringify({
      storeName: 'Corner Store', storePhone: '718-555-0123', storeAddress: '1 Main St',
      customerName: 'Sam', notes: 'Back door', paymentMethod: 'card',
      editNumber: 1042, paymentStatus: 'paid', createdAt: '2026-10-01T00:00:00.000Z',
      items: [{ id: 'a', name: 'Widget', qty: 3, price: 5 }],
    }));
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await waitFor(() => expect(result.current.editNumber).toBe(1042));

    await act(async () => { await result.current.handleGenerate(); });

    expect(saveInvoice.mock.calls.at(-1)[0]).toMatchObject({
      number: 1042, storeName: 'Corner Store', storePhone: '718-555-0123', storeAddress: '1 Main St',
      customerName: 'Sam', notes: 'Back door', paymentMethod: 'card', paymentStatus: 'paid',
    });
  });

  it('a cancelled scan’s late lookup does not land on the next item', async () => {
    let finishA;
    lookupBarcode.mockReturnValueOnce(new Promise(resolve => { finishA = resolve; }));
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));

    let pendingA;
    act(() => { pendingA = result.current.handleScan('0071181000240'); });          // A: not in his catalog
    await waitFor(() => expect(result.current.productName).toBe(LOOKING_UP_TEXT));
    act(() => { result.current.clearAddForm(); });                                   // Cancel

    getProductByBarcode.mockResolvedValueOnce({ name: 'Mobil 1 5W-30 5qt', lastPrice: 24.99 });
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); }); // B
    await act(async () => { finishA({ name: 'Some Other Thing', status: 'found' }); await pendingA; });

    expect(result.current.productName).toBe('Mobil 1 5W-30 5qt');
    expect(result.current.price).toBe('24.99');
    act(() => { result.current.addItem(); });
    expect(saveProductBarcode).toHaveBeenCalledWith('071924145009', 'Mobil 1 5W-30 5qt', 24.99);
  });

  it('changing the store clears the previous store’s phone, address and contact', async () => {
    getStoreDetails
      .mockResolvedValueOnce({ phone: '718-555-0001', address: '1 Sunrise Ave' })  // Sunrise Deli
      .mockResolvedValueOnce({ phone: '', address: '' });                          // Corner Mart
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    act(() => { result.current.handleStoreNameChange('Sunrise Deli'); });
    await waitFor(() => expect(result.current.storePhone).toBe('718-555-0001'), { timeout: 3000 });
    act(() => { result.current.setCustomerName('Sam'); });

    act(() => { result.current.handleStoreNameChange('Corner Mart'); });
    addLine(result);
    await act(async () => { await result.current.handleGenerate(); });

    expect(saveInvoice.mock.calls.at(-1)[0]).toMatchObject({ storeName: 'Corner Mart', storePhone: '', storeAddress: '', customerName: '' });
    expect(saveStoreDetails).not.toHaveBeenCalled();
  });

  it('the scanned barcode helps the draft but is not saved with the invoice', async () => {
    getProductByBarcode.mockResolvedValueOnce({ name: 'Mobil 1 5W-30 5qt', lastPrice: 24.99 });
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    act(() => { result.current.addItem(); });
    expect(result.current.items[0].barcode).toBe('071924145009');

    await act(async () => { await result.current.handleGenerate(); });

    expect(saveInvoice.mock.calls.at(-1)[0].items[0]).not.toHaveProperty('barcode');
  });

  it('recentStores also orders cloud invoices, which carry created_at', async () => {
    getInvoices.mockResolvedValueOnce([
      { storeName: 'Old Mart',     created_at: '2026-10-01T10:00:00Z' },
      { storeName: 'Sunrise Deli', created_at: '2026-10-13T10:00:00Z' },
      { storeName: 'Corner Mart',  created_at: '2026-10-12T10:00:00Z' },
      { storeName: 'Bodega 1',     created_at: '2026-10-10T10:00:00Z' },
    ]);
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await waitFor(() => expect(result.current.recentStores).toEqual(['Sunrise Deli', 'Corner Mart', 'Bodega 1']));
  });

  it('normal mode still requires a store name', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    addLine(result);
    await act(async () => { await result.current.handleGenerate(); });
    expect(result.current.error).toBe('Enter a store name.');
    expect(saveInvoice).not.toHaveBeenCalled();
  });
});

describe('useInvoiceForm — names from other drivers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    canSaveGuestEntry.mockReturnValue(true);
    getNextInvoiceNumber.mockResolvedValue(1001);
  });

  it('Easy Mode: a shared name fills the card, price empty, labeled, and no database lookup', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(result.current.productName).toBe('Mobil 1 5W-30 5qt');
    expect(result.current.price).toBe('');
    expect(result.current.nameSource).toBe('drivers');
    expect(lookupBarcode).not.toHaveBeenCalled();
  });

  it('his own catalog wins: no question, no shared lookup', async () => {
    getProductByBarcode.mockResolvedValueOnce({ name: 'Mobil oil', lastPrice: 24.99 });
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(getSharedProductName).not.toHaveBeenCalled();
    expect(result.current.productName).toBe('Mobil oil');
    expect(result.current.pendingName).toBeNull();
  });

  it('his own catalog still fills straight in (no question) in normal mode', async () => {
    getProductByBarcode.mockResolvedValueOnce({ name: 'Mobil oil', lastPrice: 24.99 });
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(result.current.price).toBe('24.99');
    expect(result.current.pendingName).toBeNull();
  });

  it('store-made codes never ask other drivers', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await act(async () => { await result.current.handleScan('212345678900'); });
    expect(getSharedProductName).not.toHaveBeenCalled();
  });

  it('no shared name → the database lookup, labeled as a database name in Easy Mode', async () => {
    lookupBarcode.mockResolvedValueOnce({ name: 'Coca-Cola Can, 12 fl oz', status: 'found' });
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await act(async () => { await result.current.handleScan('049000006346'); });
    expect(getSharedProductName).toHaveBeenCalledWith('049000006346');
    expect(result.current.productName).toBe('Coca-Cola Can, 12 fl oz');
    expect(result.current.nameSource).toBe('database');
  });

  it('normal mode: a looked-up name is a question; Yes fills it, No leaves it empty', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(result.current.productName).toBe('');
    expect(result.current.pendingName).toEqual({ name: 'Mobil 1 5W-30 5qt', source: 'drivers' });

    act(() => { result.current.acceptPendingName(); });
    expect(result.current.productName).toBe('Mobil 1 5W-30 5qt');
    expect(result.current.pendingName).toBeNull();

    lookupBarcode.mockResolvedValueOnce({ name: 'Coca-Cola Can, 12 fl oz', status: 'found' });
    await act(async () => { await result.current.handleScan('049000006346'); });
    expect(result.current.pendingName).toEqual({ name: 'Coca-Cola Can, 12 fl oz', source: 'database' });
    act(() => { result.current.rejectPendingName(); });
    expect(result.current.pendingName).toBeNull();
    expect(result.current.productName).toBe('');
  });

  it('typing over a looked-up name drops its label', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    act(() => { result.current.setProductName('Mobil 1 High Mileage'); });
    expect(result.current.nameSource).toBeNull();
  });

  it('a late shared answer after Cancel is ignored', async () => {
    let answer;
    getSharedProductName.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    let pending;
    act(() => { pending = result.current.handleScan('071924145009', 'UPC_A'); });
    await waitFor(() => expect(getSharedProductName).toHaveBeenCalled());
    act(() => { result.current.clearAddForm(); });
    await act(async () => { answer('Mobil 1 5W-30 5qt'); await pending; });
    expect(result.current.productName).toBe('');
    expect(result.current.nameSource).toBeNull();
    expect(lookupBarcode).not.toHaveBeenCalled();
  });

  it('Try again asks other drivers first and offers their name without calling the database', async () => {
    lookupBarcode.mockResolvedValueOnce({ name: '', status: 'unavailable' });
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(result.current.lookupUnavailable).toBe(true);
    expect(lookupBarcode).toHaveBeenCalledTimes(1);
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    await act(async () => { await result.current.retryLookup(); });
    expect(lookupBarcode).toHaveBeenCalledTimes(1);
    expect(result.current.productName).toBe('Mobil 1 5W-30 5qt');
    expect(result.current.nameSource).toBe('drivers');
  });

  it('a price typed while the shared lookup is pending survives', async () => {
    let answer;
    getSharedProductName.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    let pending;
    act(() => { pending = result.current.handleScan('071924145009', 'UPC_A'); });
    await waitFor(() => expect(getSharedProductName).toHaveBeenCalled());
    act(() => { result.current.setPrice('12.50'); });
    lookupBarcode.mockResolvedValueOnce({ name: '', status: 'unknown' });
    await act(async () => { answer(null); await pending; });
    expect(result.current.price).toBe('12.50');
  });

  it('Try again does not wipe a typed price', async () => {
    lookupBarcode.mockResolvedValueOnce({ name: '', status: 'unavailable' });
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    act(() => { result.current.setPrice('9.99'); });
    lookupBarcode.mockResolvedValueOnce({ name: '', status: 'unavailable' });
    await act(async () => { await result.current.retryLookup(); });
    expect(result.current.price).toBe('9.99');
  });

  it('a name typed while a lookup is pending is not replaced by the late answer', async () => {
    let answer;
    getSharedProductName.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
    const { result } = renderHook(() => useInvoiceForm(vi.fn(), { easy: true }));
    let pending;
    act(() => { pending = result.current.handleScan('071924145009', 'UPC_A'); });
    await waitFor(() => expect(getSharedProductName).toHaveBeenCalled());
    act(() => { result.current.setProductName('My own name'); });
    await act(async () => { answer('Mobil 1 5W-30 5qt'); await pending; });
    expect(result.current.productName).toBe('My own name');
    expect(result.current.nameSource).toBeNull();
    expect(lookupBarcode).not.toHaveBeenCalled();
  });

  it('a name typed while the database lookup is pending is not blanked by the late answer', async () => {
    let answer;
    lookupBarcode.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    let pending;
    act(() => { pending = result.current.handleScan('049000006346'); });
    await waitFor(() => expect(lookupBarcode).toHaveBeenCalled());
    act(() => { result.current.setProductName('Coke'); });
    await act(async () => { answer({ name: '', status: 'unknown' }); await pending; });
    expect(result.current.productName).toBe('Coke');
  });

  it('typing dismisses a visible "Is this it?" question', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await act(async () => { await result.current.handleScan('071924145009', 'UPC_A'); });
    expect(result.current.pendingName).not.toBeNull();
    act(() => { result.current.setProductName('M'); });
    expect(result.current.pendingName).toBeNull();
    expect(result.current.productName).toBe('M');
  });

  it('suggestions: his own names first, then other drivers’, without repeats', async () => {
    getProductNames.mockReturnValueOnce(['Mobil oil', 'Coke can']); // read once, at mount
    getSharedProductSuggestions.mockResolvedValueOnce(['mobil oil', 'Mobil 1 5W-30 5qt']);
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    act(() => { result.current.setProductName('mobil'); });
    await waitFor(() => expect(result.current.productSuggestions).toEqual(['Mobil oil', 'Coke can', 'Mobil 1 5W-30 5qt']), { timeout: 2000 });
    expect(getSharedProductSuggestions).toHaveBeenCalledWith('mobil');
  });

  it('under 2 characters, other drivers aren’t asked', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    act(() => { result.current.setProductName('m'); });
    await new Promise(r => setTimeout(r, 400));
    expect(getSharedProductSuggestions).not.toHaveBeenCalled();
  });

  it('a stale suggestion answer is ignored', async () => {
    let slow;
    getSharedProductSuggestions
      .mockReturnValueOnce(new Promise(resolve => { slow = resolve; }))  // for "mo"
      .mockResolvedValueOnce(['Mobil 1 5W-30 5qt']);                     // for "mobil 1"
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    act(() => { result.current.setProductName('mo'); });
    await waitFor(() => expect(getSharedProductSuggestions).toHaveBeenCalledTimes(1), { timeout: 2000 });
    act(() => { result.current.setProductName('mobil 1'); });
    await waitFor(() => expect(result.current.productSuggestions).toContain('Mobil 1 5W-30 5qt'), { timeout: 2000 });
    await act(async () => { slow(['Motor oil generic']); });
    expect(result.current.productSuggestions).not.toContain('Motor oil generic');
  });
});
