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

import { saveInvoice, saveStoreName, getNextInvoiceNumber, saveProductBarcode, getProductByBarcode, getInvoices, getStoreDetails, saveStoreDetails } from '../utils/storage';
import { lookupBarcode } from '../utils/barcodeApi';
import { completeActiveConnectionOrder } from '../utils/connectionOrderStorage';
import { canSaveGuestEntry } from '../utils/guestMode';
import { STORAGE_FULL_MESSAGE, UNKNOWN_BARCODE_MESSAGE, LOOKUP_UNAVAILABLE_MESSAGE, STORE_MADE_BARCODE_MESSAGE, LOOKING_UP_TEXT } from '../utils/constants';

/** Fills store name + adds one line item, leaving the hook ready to generate. */
function addOneItem(result, { name = 'Widget', qty = '3', price = '5' } = {}) {
  act(() => { result.current.handleStoreNameChange('Corner Store'); });
  act(() => { result.current.setProductName(name); });
  act(() => { result.current.setQty(qty); });
  act(() => { result.current.setPrice(price); });
  act(() => { result.current.addItem(); });
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

  it('Try again re-runs the lookup for the same barcode and fills the name', async () => {
    lookupBarcode
      .mockResolvedValueOnce({ name: null, status: 'unavailable' })
      .mockResolvedValueOnce({ name: 'Coca-Cola Can, 12 fl oz', status: 'found' });
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    await act(async () => { await result.current.handleScan('049000006346'); });

    await act(async () => { await result.current.retryLookup(); });

    expect(lookupBarcode).toHaveBeenLastCalledWith('049000006346');
    expect(result.current.productName).toBe('Coca-Cola Can, 12 fl oz');
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

  it('normal mode still requires a store name', async () => {
    const { result } = renderHook(() => useInvoiceForm(vi.fn()));
    addLine(result);
    await act(async () => { await result.current.handleGenerate(); });
    expect(result.current.error).toBe('Enter a store name.');
    expect(saveInvoice).not.toHaveBeenCalled();
  });
});
