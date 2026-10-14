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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';

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
import { saveInvoice, getProductByBarcode, saveProductBarcode, getInvoices } from '../utils/storage';
import { lookupBarcode } from '../utils/barcodeApi';
import { canSaveGuestEntry } from '../utils/guestMode';

function renderEasy() {
  const onGenerated = vi.fn();
  render(<ThemeProvider><EasyInvoice onGenerated={onGenerated} onBack={vi.fn()} /></ThemeProvider>);
  return { onGenerated };
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
});
