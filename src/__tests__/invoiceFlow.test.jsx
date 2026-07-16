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
vi.mock('../utils/barcodeApi', () => ({ lookupBarcode: vi.fn(async () => null) }));
vi.mock('../utils/orderSuggestions', () => ({
  buildOrderSuggestions: vi.fn(() => []),
  checkInvoiceAnomaly: vi.fn(() => null),
}));
vi.mock('../utils/connectionOrderStorage', () => ({
  completeActiveConnectionOrder: vi.fn(() => {}),
  resolveConnectedStoreUserId: vi.fn(() => null),
}));
vi.mock('../utils/guestMode', () => ({ canSaveGuestEntry: vi.fn(() => true) }));

import { saveInvoice, saveStoreName, getNextInvoiceNumber } from '../utils/storage';
import { completeActiveConnectionOrder } from '../utils/connectionOrderStorage';
import { canSaveGuestEntry } from '../utils/guestMode';

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
