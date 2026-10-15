/**
 * newInvoiceScan.test.jsx
 *
 * Normal-mode New Invoice: while a scanned barcode is still being named
 * ("Looking up…"), + Add Item must look disabled — the hook already refuses
 * the tap, and a button that silently does nothing reads as broken.
 *
 * Storage, lookup and heavy children are mocked; the camera is a fake
 * BarcodeScanner whose "fake-scan" button reports a barcode.
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
vi.mock('../utils/guestMode', () => ({ canSaveGuestEntry: vi.fn(() => true), promptAccount: vi.fn(), isGuest: vi.fn(() => false) }));
vi.mock('../components/navigation/AppFooter', () => ({ default: () => null }));
vi.mock('../components/invoice/LiveInvoicePreview', () => ({ default: () => null }));
vi.mock('../components/invoice/InvoicePreview', () => ({ default: () => null }));
vi.mock('../hooks/useContactImport', () => ({ isContactsSupported: () => false, pickContact: vi.fn() }));
vi.mock('../components/ui/BarcodeScanner', () => ({
  default: ({ onScan }) => <button onClick={() => onScan('0071181000240', 'EAN_13')}>fake-scan</button>,
}));

import NewInvoice from '../components/invoice/NewInvoice.jsx';
import { lookupBarcode } from '../utils/barcodeApi';
import { getSharedProductName, getSharedProductSuggestions } from '../utils/storage';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('NewInvoice — scanning', () => {
  it('+ Add Item is disabled while the scanned name is being looked up', async () => {
    lookupBarcode.mockReturnValueOnce(new Promise(() => {}));
    render(<ThemeProvider><NewInvoice onGenerated={vi.fn()} onNav={vi.fn()} onBack={vi.fn()} /></ThemeProvider>);

    fireEvent.click(document.querySelector('[data-tip="barcode"]'));
    fireEvent.click(await screen.findByText('fake-scan'));

    await waitFor(() => expect(screen.getByDisplayValue('Looking up…')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '+ Add Item' })).toBeDisabled();
  });

  it('+ Add Item is enabled otherwise', () => {
    render(<ThemeProvider><NewInvoice onGenerated={vi.fn()} onNav={vi.fn()} onBack={vi.fn()} /></ThemeProvider>);
    expect(screen.getByRole('button', { name: '+ Add Item' })).toBeEnabled();
  });
});

describe('NewInvoice — Is this it?', () => {
  it('a name from other drivers is asked about; Yes fills the field', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    render(<ThemeProvider><NewInvoice onGenerated={vi.fn()} onNav={vi.fn()} onBack={vi.fn()} /></ThemeProvider>);
    fireEvent.click(document.querySelector('[data-tip="barcode"]'));
    fireEvent.click(await screen.findByText('fake-scan'));

    expect(await screen.findByText('Is this it?')).toBeInTheDocument();
    expect(screen.getByText('Mobil 1 5W-30 5qt')).toBeInTheDocument();
    expect(screen.getByText('from other Keiro drivers')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, use it' }));
    expect(screen.getByDisplayValue('Mobil 1 5W-30 5qt')).toBeInTheDocument();
    expect(screen.queryByText('Is this it?')).toBeNull();
  });

  it('No leaves the field empty to type', async () => {
    getSharedProductName.mockResolvedValueOnce('Mobil 1 5W-30 5qt');
    render(<ThemeProvider><NewInvoice onGenerated={vi.fn()} onNav={vi.fn()} onBack={vi.fn()} /></ThemeProvider>);
    fireEvent.click(document.querySelector('[data-tip="barcode"]'));
    fireEvent.click(await screen.findByText('fake-scan'));
    fireEvent.click(await screen.findByRole('button', { name: 'No, I’ll type it' }));
    expect(screen.queryByText('Is this it?')).toBeNull();
    expect(screen.queryByDisplayValue('Mobil 1 5W-30 5qt')).toBeNull();
  });

  it('typing shows other drivers’ names in the suggestions', async () => {
    getSharedProductSuggestions.mockResolvedValue(['Mobil 1 5W-30 5qt']);
    render(<ThemeProvider><NewInvoice onGenerated={vi.fn()} onNav={vi.fn()} onBack={vi.fn()} /></ThemeProvider>);
    fireEvent.change(screen.getByPlaceholderText('GMan V Cut T-Shirt'), { target: { value: 'mobil' } });
    expect(await screen.findByText('Mobil 1 5W-30 5qt', {}, { timeout: 2000 })).toBeInTheDocument();
  });
});
