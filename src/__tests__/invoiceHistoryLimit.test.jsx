/**
 * invoiceHistoryLimit.test.jsx
 *
 * The free plan's 20 new invoices a month on the Route screen
 * (docs/specs/2026-10-16-pricing-design.md §1). + New and Duplicate each start a
 * NEW invoice, so at the limit they open the limit sheet instead of the form.
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

/** This local month as plan.js keys it: 'YYYY-MM'. */
function monthNow() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
/** The server's cached answer: a free account with `used` new invoices this month. */
function seedFreePlan(used) {
  localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: false, usedThisMonth: used, month: monthNow() }));
}

function renderHistory() {
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
  ])('%s is never stopped: + New and Duplicate both go on', async (_who, setUp) => {
    setUp();
    const { onNewInvoice, onNav } = renderHistory();

    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    await openInvoiceMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

    expect(onNewInvoice).toHaveBeenCalledTimes(1);
    expect(onNav).toHaveBeenCalledWith('invoice');
    expect(limitSheet).not.toHaveBeenCalled();
  });
});
