/**
 * invoiceHistoryLimit.test.jsx
 *
 * The free plan's 20 new invoices a month on the Route screen
 * (docs/specs/2026-10-16-pricing-design.md §1). + New, Duplicate and Fill Invoice
 * (from a connected store's order, or a request from the store-owner side of the
 * same account) each start a NEW invoice, so at the limit they open the limit
 * sheet instead of the form, and Fill Invoice leaves its order or request exactly
 * as it was: not accepted, not latched, not dismissed.
 * Edit starts no new invoice and stays open. A Pro driver is never stopped.
 *
 * The limit sheet itself belongs to UpgradeHost (not rendered here), so "opens
 * the limit sheet" means the EVENTS.OPEN_FREE_LIMIT event, and nothing else
 * happening. Storage and the other data modules are faked, so nothing here
 * touches Supabase or needs a .env.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';

const { INVOICE } = vi.hoisted(() => ({
  INVOICE: {
    number: 1042, storeName: 'Corner Store', storePhone: '718-555-0123', storeAddress: '1 Main St',
    customerName: 'Sam', notes: 'Back door', date: 'October 1, 2026', time: '09:00 AM',
    paymentMethod: 'cash', paymentStatus: 'unpaid', createdAt: '2026-10-01T09:00:00.000Z',
    items: [{ id: 'a', name: 'Widget', qty: 3, price: 5 }],
  },
}));

vi.mock('../utils/storage', () => ({
  getInvoices: vi.fn(async () => [INVOICE]),
  updateInvoicePaymentStatus: vi.fn(async () => {}),
  deleteInvoice: vi.fn(async () => {}),
  togglePinnedStore: vi.fn(),
  isStorePinned: vi.fn(() => false),
  getBusinessName: vi.fn(() => 'Test Business'),
}));
vi.mock('../utils/signatureStorage', () => ({
  hasSignature: vi.fn(() => false),
  clearSignatures: vi.fn(),
  loadSignatureIndexFromCloud: vi.fn(async () => {}),
}));
vi.mock('../utils/paymentStorage', () => ({
  getPaymentsFor: vi.fn(() => []),
  addPayment: vi.fn(),
  removePayment: vi.fn(),
  getTotalPaid: vi.fn(() => 0),
  clearPaymentsFor: vi.fn(),
  loadAllPaymentsFromCloud: vi.fn(async () => {}),
}));
vi.mock('../utils/storeOwnerStorage', () => ({
  getBridgeRequests: vi.fn(() => []),
  dismissBridgeRequest: vi.fn(),
  loadBridgeRequestsFromCloud: vi.fn(async () => []),
}));
vi.mock('../utils/connectionOrderStorage', () => ({
  getConnectionOrders: vi.fn(() => []),
  loadConnectionOrdersFromCloud: vi.fn(async () => []),
  updateConnectionOrderStatus: vi.fn(),
  setActiveConnectionOrder: vi.fn(),
}));
vi.mock('../components/navigation/AppFooter', () => ({ default: () => null }));

import InvoiceHistory from '../components/invoice/InvoiceHistory.jsx';
import { STORAGE_KEYS, EVENTS } from '../utils/constants';
import { getBridgeRequests, dismissBridgeRequest, loadBridgeRequestsFromCloud } from '../utils/storeOwnerStorage';
import { getConnectionOrders, loadConnectionOrdersFromCloud, updateConnectionOrderStatus, setActiveConnectionOrder } from '../utils/connectionOrderStorage';

// What can wait on Route to become an invoice: a request from the store-owner side of the same account, and a
// connected store's order. Both end in "Fill Invoice", which starts a NEW invoice.
const BRIDGE_REQUEST = { id: 'br_1', productName: 'Oil filter', quantity: 4, notes: 'Back door' };
const STORE_ORDER = { id: 'co_1', status: 'pending', storeName: 'Sunrise Deli', productName: 'Coke 12oz', quantity: 24, notes: 'By 9am' };

/** This local month as plan.js keys it: 'YYYY-MM'. */
function monthNow() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
/** The server's cached answer: a free account with `used` new invoices this month. */
function seedFreePlan(used) {
  localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: false, usedThisMonth: used, month: monthNow() }));
}

/** Renders Route with the given requests / orders waiting (none by default, so no test inherits another's). */
function renderHistory({ requests = [], orders = [] } = {}) {
  getBridgeRequests.mockReturnValue(requests);
  loadBridgeRequestsFromCloud.mockResolvedValue(requests);
  getConnectionOrders.mockReturnValue(orders);
  loadConnectionOrdersFromCloud.mockResolvedValue(orders);
  const onNewInvoice = vi.fn();
  const onNav = vi.fn();
  render(<ThemeProvider><InvoiceHistory onNav={onNav} onNewInvoice={onNewInvoice} /></ThemeProvider>);
  return { onNewInvoice, onNav };
}
/** Opens the ••• menu on the one invoice card. */
async function openInvoiceMenu() {
  fireEvent.click(await screen.findByRole('button', { name: 'Invoice actions' }));
}

const limitSheet = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.addEventListener(EVENTS.OPEN_FREE_LIMIT, limitSheet);
});
afterEach(() => {
  window.removeEventListener(EVENTS.OPEN_FREE_LIMIT, limitSheet);
});

describe('Route — + New', () => {
  it('under the limit it goes on to a new invoice', () => {
    seedFreePlan(19);
    const { onNewInvoice } = renderHistory();

    fireEvent.click(screen.getByRole('button', { name: '+ New' }));

    expect(onNewInvoice).toHaveBeenCalledTimes(1);
    expect(limitSheet).not.toHaveBeenCalled();
  });

  it('at 20 used it opens the limit sheet instead', () => {
    seedFreePlan(20);
    const { onNewInvoice } = renderHistory();

    fireEvent.click(screen.getByRole('button', { name: '+ New' }));

    expect(onNewInvoice).not.toHaveBeenCalled();
    expect(limitSheet).toHaveBeenCalledTimes(1);
  });
});

describe('Route — Duplicate', () => {
  it('under the limit it hands the old invoice’s lines to a NEW invoice', async () => {
    seedFreePlan(19);
    const { onNav } = renderHistory();
    await openInvoiceMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

    expect(onNav).toHaveBeenCalledWith('invoice');
    const prefill = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFILL));
    expect(prefill.storeName).toBe('Corner Store');
    expect(prefill.items).toHaveLength(1);
    expect(prefill.editNumber).toBeUndefined();
    expect(limitSheet).not.toHaveBeenCalled();
  });

  it('at 20 used it opens the limit sheet, starts no invoice and closes the menu', async () => {
    seedFreePlan(20);
    const { onNav } = renderHistory();
    await openInvoiceMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

    expect(limitSheet).toHaveBeenCalledTimes(1);
    expect(onNav).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.PREFILL)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Duplicate' })).toBeNull();
  });
});

describe('Route — Fill Invoice', () => {
  it('a request from the store-owner side: under the limit it is dismissed and becomes a NEW invoice with its lines', () => {
    seedFreePlan(19);
    const { onNav } = renderHistory({ requests: [BRIDGE_REQUEST] });

    fireEvent.click(screen.getByRole('button', { name: 'Fill Invoice' }));

    expect(dismissBridgeRequest).toHaveBeenCalledWith('br_1');
    expect(onNav).toHaveBeenCalledWith('invoice');
    const prefill = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFILL));
    expect(prefill.notes).toBe('Back door');
    expect(prefill.items).toEqual([expect.objectContaining({ name: 'Oil filter', qty: 4, price: 0 })]);
    expect(prefill.editNumber).toBeUndefined();
    expect(limitSheet).not.toHaveBeenCalled();
  });

  it('a request from the store-owner side: at 20 used it opens the limit sheet and the request stays exactly as it was', () => {
    seedFreePlan(20);
    const { onNav } = renderHistory({ requests: [BRIDGE_REQUEST] });

    fireEvent.click(screen.getByRole('button', { name: 'Fill Invoice' }));

    expect(limitSheet).toHaveBeenCalledTimes(1);
    expect(dismissBridgeRequest).not.toHaveBeenCalled();
    expect(onNav).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.PREFILL)).toBeNull();
  });

  it('a connected store’s order: under the limit it is accepted, latched and becomes a NEW invoice with its lines', () => {
    seedFreePlan(19);
    const { onNav } = renderHistory({ orders: [STORE_ORDER] });

    fireEvent.click(screen.getByRole('button', { name: 'Fill Invoice' }));

    expect(updateConnectionOrderStatus).toHaveBeenCalledWith('co_1', 'accepted');
    expect(setActiveConnectionOrder).toHaveBeenCalledWith('co_1');
    expect(onNav).toHaveBeenCalledWith('invoice');
    const prefill = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFILL));
    expect(prefill.storeName).toBe('Sunrise Deli');
    expect(prefill.notes).toBe('By 9am');
    expect(prefill.items).toEqual([expect.objectContaining({ name: 'Coke 12oz', qty: 24, price: 0 })]);
    expect(prefill.editNumber).toBeUndefined();
    expect(limitSheet).not.toHaveBeenCalled();
  });

  it('a connected store’s order: at 20 used it opens the limit sheet and the order stays exactly as it was (not accepted, not latched)', () => {
    seedFreePlan(20);
    const { onNav } = renderHistory({ orders: [STORE_ORDER] });

    fireEvent.click(screen.getByRole('button', { name: 'Fill Invoice' }));

    expect(limitSheet).toHaveBeenCalledTimes(1);
    expect(updateConnectionOrderStatus).not.toHaveBeenCalled();
    expect(setActiveConnectionOrder).not.toHaveBeenCalled();
    expect(onNav).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.PREFILL)).toBeNull();
  });
});

describe('Route — what the limit leaves alone', () => {
  it('at 20 used, Edit still opens the invoice for editing', async () => {
    seedFreePlan(20);
    const { onNav } = renderHistory();
    await openInvoiceMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onNav).toHaveBeenCalledWith('invoice');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFILL)).editNumber).toBe(1042);
    expect(limitSheet).not.toHaveBeenCalled();
  });

  it.each([
    ['a Pro driver', () => localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: true, source: 'manual', proUntil: null, usedThisMonth: 40, month: monthNow() }))],
    ['a guest', () => { seedFreePlan(40); localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true'); }],
    ['a store owner', () => { seedFreePlan(40); localStorage.setItem(STORAGE_KEYS.USER_ROLE, JSON.stringify('store_owner')); }],
  ])('%s is never stopped: + New, Duplicate and both Fill Invoice buttons go on', async (_who, setUp) => {
    setUp();
    const { onNewInvoice, onNav } = renderHistory({ requests: [BRIDGE_REQUEST], orders: [STORE_ORDER] });

    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    await openInvoiceMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    for (const fill of screen.getAllByRole('button', { name: 'Fill Invoice' })) fireEvent.click(fill);

    expect(onNewInvoice).toHaveBeenCalledTimes(1);
    expect(onNav).toHaveBeenCalledTimes(3); // Duplicate, then the order, then the request
    expect(setActiveConnectionOrder).toHaveBeenCalledWith('co_1');
    expect(dismissBridgeRequest).toHaveBeenCalledWith('br_1');
    expect(limitSheet).not.toHaveBeenCalled();
  });
});
