/**
 * easyInvoice.test.jsx
 *
 * The Easy Mode invoice (docs/specs/2026-10-14-easy-mode-design.md §1): pick a
 * store (optional), scan an item, check it on a card, Add — and the camera
 * reopens for the next one. A rescan adds +1 to its line; a tapped line can be
 * changed or removed; Make invoice needs no store.
 *
 * The storage boundary and barcode lookup are mocked (as in invoiceFlow.test);
 * the camera is a fake BarcodeScanner whose "fake-scan" button reports
 * globalThis.__nextScan.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { STORAGE_KEYS, EVENTS } from '../utils/constants';
import { givePro } from './helpers/givePro';

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
vi.mock('../utils/orderSuggestions', () => ({ buildOrderSuggestions: vi.fn(() => []), checkInvoiceAnomaly: vi.fn(() => null) }));
vi.mock('../utils/connectionOrderStorage', () => ({ completeActiveConnectionOrder: vi.fn(), resolveConnectedStoreUserId: vi.fn(() => null) }));
vi.mock('../utils/guestMode', () => ({ canSaveGuestEntry: vi.fn(() => true), promptAccount: vi.fn() }));
vi.mock('../components/ui/BarcodeScanner', () => ({
  default: ({ onScan, onClose, closeLabel }) => (
    <div data-testid="scanner">
      <button onClick={() => onScan(globalThis.__nextScan, 'UPC_A')}>fake-scan</button>
      <button onClick={onClose}>{closeLabel}</button>
    </div>
  ),
}));

import EasyInvoice from '../components/invoice/EasyInvoice.jsx';
import { saveInvoice, getProductByBarcode, saveProductBarcode, getInvoices, getSharedProductName } from '../utils/storage';
import { lookupBarcode } from '../utils/barcodeApi';
import { canSaveGuestEntry } from '../utils/guestMode';
import { recordNewInvoice } from '../utils/plan';

/** This local month as plan.js keys it: 'YYYY-MM'. */
function monthNow() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
/** The server's cached answer: a free account with `used` new invoices this month. */
function seedFreePlan(used) {
  localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: false, usedThisMonth: used, month: monthNow() }));
}
const LEFT_LINE = /free invoices? left this month/;

function renderEasy() {
  const onGenerated = vi.fn();
  const onBack = vi.fn();
  render(<ThemeProvider><EasyInvoice onGenerated={onGenerated} onBack={onBack} /></ThemeProvider>);
  return { onGenerated, onBack };
}

async function scan(code) {
  globalThis.__nextScan = code;
  fireEvent.click(await screen.findByText('fake-scan'));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  canSaveGuestEntry.mockReturnValue(true);
});

describe('EasyInvoice', () => {
  it('scan → check card with his price → Add lists the line and reopens the camera', async () => {
    getProductByBarcode.mockResolvedValueOnce({ name: 'Mobil 1 5W-30 5qt', lastPrice: 24.99 });
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    await scan('071924145009');

    expect(await screen.findByDisplayValue('Mobil 1 5W-30 5qt')).toBeInTheDocument();
    expect(screen.getByLabelText('Price')).toHaveValue(24.99);
    expect(screen.getByLabelText('Quantity')).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('1 × 24.99')).toBeInTheDocument();
    expect(await screen.findByTestId('scanner')).toBeInTheDocument();
  });

  it('rescanning the same item opens its line with qty 2, and Add keeps one line', async () => {
    getProductByBarcode.mockResolvedValueOnce({ name: 'Mobil 1 5W-30 5qt', lastPrice: 24.99 });
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    await scan('071924145009');
    await screen.findByDisplayValue('Mobil 1 5W-30 5qt');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await scan('071924145009');
    await waitFor(() => expect(screen.getByLabelText('Quantity')).toHaveValue('2'));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('2 × 24.99')).toBeInTheDocument();
    expect(screen.queryByText('1 × 24.99')).toBeNull();
    expect(screen.getByText('$49.98')).toBeInTheDocument();
  });

  it('a new product: the looked-up name, and he types the price once', async () => {
    lookupBarcode.mockResolvedValueOnce({ name: 'Coca-Cola Can, 12 fl oz', status: 'found' });
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    await scan('049000006346');

    expect(await screen.findByDisplayValue('Coca-Cola Can, 12 fl oz')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '1.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(saveProductBarcode).toHaveBeenCalledWith('049000006346', 'Coca-Cola Can, 12 fl oz', 1.25);
  });

  it('Cancel discards the scan and reopens the camera', async () => {
    getProductByBarcode.mockResolvedValueOnce({ name: 'Mobil 1 5W-30 5qt', lastPrice: 24.99 });
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    await scan('071924145009');
    await screen.findByDisplayValue('Mobil 1 5W-30 5qt');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByTestId('scanner')).toBeInTheDocument();
    expect(screen.getByText('No items yet. Scan one to start.')).toBeInTheDocument();
  });

  it('Done closes the camera', async () => {
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    fireEvent.click(await screen.findByText('Done'));
    await waitFor(() => expect(screen.queryByTestId('scanner')).toBeNull());
  });

  it('Add without scanning, then tap the line and Remove it', async () => {
    renderEasy();
    fireEvent.click(screen.getByText('+ Add without scanning'));
    fireEvent.change(screen.getByPlaceholderText('Product name'), { target: { value: 'Gildan tee' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.queryByTestId('scanner')).toBeNull(); // only a scan's card reopens the camera

    fireEvent.click(await screen.findByText('Gildan tee'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('No items yet. Scan one to start.')).toBeInTheDocument();
  });

  it('Make invoice with no store saves it and hands it on', async () => {
    const { onGenerated } = renderEasy();
    fireEvent.click(screen.getByText('+ Add without scanning'));
    fireEvent.change(screen.getByPlaceholderText('Product name'), { target: { value: 'Gildan tee' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    fireEvent.click(screen.getByText('Make invoice'));

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    expect(saveInvoice.mock.calls[0][0]).toMatchObject({ storeName: '', items: [expect.objectContaining({ name: 'Gildan tee', qty: 1, price: 6 })] });
  });

  it('recent stores are one tap', async () => {
    getInvoices.mockResolvedValueOnce([{ storeName: 'Sunrise Deli', createdAt: '2026-10-13T10:00:00Z' }]);
    renderEasy();
    fireEvent.click(await screen.findByRole('button', { name: 'Sunrise Deli' }));
    expect(screen.getByPlaceholderText('Start typing a store')).toHaveValue('Sunrise Deli');
  });

  it('Add is disabled while the name is being looked up', async () => {
    lookupBarcode.mockReturnValueOnce(new Promise(() => {}));
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    await scan('0071181000240');
    expect(await screen.findByText('Looking up…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('guest at the cap: Make invoice shows the account wall', async () => {
    canSaveGuestEntry.mockReturnValue(false);
    renderEasy();
    fireEvent.click(screen.getByText('+ Add without scanning'));
    fireEvent.change(screen.getByPlaceholderText('Product name'), { target: { value: 'Gildan tee' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    fireEvent.click(screen.getByText('Make invoice'));

    expect(await screen.findByText("You've reached the limit!")).toBeInTheDocument();
    expect(saveInvoice).not.toHaveBeenCalled();
  });

  it('a $0.00 total asks before saving', async () => {
    renderEasy();
    fireEvent.click(screen.getByText('+ Add without scanning'));
    fireEvent.change(screen.getByPlaceholderText('Product name'), { target: { value: 'Free sample' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    fireEvent.click(screen.getByText('Make invoice'));

    expect(await screen.findByText('Generate a $0.00 invoice?')).toBeInTheDocument();
    expect(saveInvoice).not.toHaveBeenCalled();
  });

  it('a quantity can be a decimal, like 2.5', async () => {
    renderEasy();
    fireEvent.click(screen.getByText('+ Add without scanning'));
    fireEvent.change(screen.getByPlaceholderText('Product name'), { target: { value: 'Ice (lb)' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2.5.' } });
    expect(screen.getByLabelText('Quantity')).toHaveValue('2.5');
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('2.5 × 2.00')).toBeInTheDocument();
  });

  it('← with items asks before throwing the invoice away', async () => {
    const { onBack } = renderEasy();
    fireEvent.click(screen.getByText('+ Add without scanning'));
    fireEvent.change(screen.getByPlaceholderText('Product name'), { target: { value: 'Gildan tee' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Discard this invoice?')).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByText('Discard this invoice?')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('← with nothing on it just goes back', () => {
    const { onBack } = renderEasy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a store-made barcode says so on the card', async () => {
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    await scan('212345678900');
    expect(await screen.findByText(/This is a store-made barcode/)).toBeInTheDocument();
    expect(lookupBarcode).not.toHaveBeenCalled();
  });

  it('a lookup that could not run says so on the card, and Try again fills the name', async () => {
    lookupBarcode
      .mockResolvedValueOnce({ name: null, status: 'unavailable' })
      .mockResolvedValueOnce({ name: 'Coca-Cola Can, 12 fl oz', status: 'found' });
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    await scan('049000006346');
    expect(await screen.findByText(/Couldn't check right now/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByDisplayValue('Coca-Cola Can, 12 fl oz')).toBeInTheDocument();
  });

  it('a name from other drivers says so on the card', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    await scan('071924145009');
    expect(await screen.findByDisplayValue('Mobil 1 5W-30 5qt')).toBeInTheDocument();
    expect(screen.getByText('From other Keiro drivers. Edit it if it’s wrong.')).toBeInTheDocument();
  });

  it('a name from a product database says so on the card', async () => {
    lookupBarcode.mockResolvedValueOnce({ name: 'Coca-Cola Can, 12 fl oz', status: 'found' });
    renderEasy();
    fireEvent.click(screen.getByText('Scan item'));
    await scan('049000006346');
    expect(await screen.findByText('From a product database. Edit it if it’s wrong.')).toBeInTheDocument();
  });

  it('free plan: from 5 left, says how many free invoices are left this month, with Upgrade', () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: false, usedThisMonth: 16, month }));
    const opened = vi.fn();
    window.addEventListener(EVENTS.OPEN_UPGRADE, opened);
    renderEasy();
    expect(screen.getByText('4 free invoices left this month')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTS.OPEN_UPGRADE, opened);
  });

  it('no "left" line with plenty left, or on Pro', () => {
    renderEasy();
    expect(screen.queryByText(/free invoices? left this month/)).toBeNull();
    givePro();
    renderEasy();
    // givePro() has 0 counted, so this half would pass without the Pro check; the Pro case with 17 counted is below.
    expect(screen.queryByText(/free invoices? left this month/)).toBeNull();
  });

  it('the Upgrade link asks for the plain Upgrade sheet, with no title of its own', () => {
    seedFreePlan(16);
    const opened = vi.fn();
    window.addEventListener(EVENTS.OPEN_UPGRADE, opened);
    try {
      renderEasy();
      fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
      expect(opened).toHaveBeenCalledTimes(1);
      expect(opened.mock.calls[0][0].detail).toEqual({ title: undefined });
    } finally {
      window.removeEventListener(EVENTS.OPEN_UPGRADE, opened);
    }
  });

  it.each([
    [14, null],                                // 6 left: nothing yet
    [15, '5 free invoices left this month'],   // the line starts at 5 left
    [19, '1 free invoice left this month'],    // "invoice", not "invoices"
    [20, null],                                // none left: the limit sheet speaks, not this line
  ])('with %i used this month the line is: %s', (used, line) => {
    seedFreePlan(used);
    renderEasy();
    if (line) expect(screen.getByText(line)).toBeInTheDocument();
    else expect(screen.queryByText(LEFT_LINE)).toBeNull();
  });

  it.each([
    ['Pro', () => localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: true, source: 'manual', proUntil: null, usedThisMonth: 17, month: monthNow() }))],
    ['a guest', () => { seedFreePlan(17); localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true'); }],
    ['a store owner', () => { seedFreePlan(17); localStorage.setItem(STORAGE_KEYS.USER_ROLE, JSON.stringify('store_owner')); }],
  ])('no "left" line for %s, even with 17 counted', (_who, setUp) => {
    setUp();
    renderEasy();
    expect(screen.queryByText(LEFT_LINE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });

  it('the line follows the count: an invoice made on this phone counts it down', () => {
    localStorage.setItem(STORAGE_KEYS.USAGE, JSON.stringify({ month: monthNow(), count: 15 }));
    renderEasy();
    expect(screen.getByText('5 free invoices left this month')).toBeInTheDocument();

    act(() => { recordNewInvoice(); });

    expect(screen.getByText('4 free invoices left this month')).toBeInTheDocument();
    expect(screen.queryByText('5 free invoices left this month')).toBeNull();
  });

  it('free plan at 20: Make invoice opens the limit sheet, saves nothing and keeps the lines', async () => {
    seedFreePlan(20);
    const limit = vi.fn();
    window.addEventListener(EVENTS.OPEN_FREE_LIMIT, limit);
    try {
      const { onGenerated } = renderEasy();
      fireEvent.click(screen.getByText('+ Add without scanning'));
      fireEvent.change(screen.getByPlaceholderText('Product name'), { target: { value: 'Gildan tee' } });
      fireEvent.change(screen.getByLabelText('Price'), { target: { value: '6' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));

      fireEvent.click(screen.getByText('Make invoice'));

      await waitFor(() => expect(limit).toHaveBeenCalledTimes(1));
      expect(saveInvoice).not.toHaveBeenCalled();
      expect(onGenerated).not.toHaveBeenCalled();
      expect(screen.getByText('Gildan tee')).toBeInTheDocument();
    } finally {
      window.removeEventListener(EVENTS.OPEN_FREE_LIMIT, limit);
    }
  });
});
