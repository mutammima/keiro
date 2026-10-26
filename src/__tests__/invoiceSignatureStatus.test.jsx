/**
 * invoiceSignatureStatus.test.jsx — what the invoice screen says after a
 * signature is drawn. "Saved" only when a copy exists somewhere; on a full
 * phone with no connection it says the signature was not saved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../services/supabase', () => ({ supabase: { auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })) } } }));

vi.mock('../components/ui/SignaturePad', () => ({
  default: ({ label, onChange }) => (
    <button onClick={() => onChange(`data:${label}`)}>sign {label}</button>
  ),
}));

vi.mock('../utils/signatureStorage', () => ({
  getSignatures: () => ({ seller: null, buyer: null }),
  hasSignature: () => false,
  fetchSignatureFromCloud: vi.fn(async () => ({ seller: null, buyer: null })),
  saveSignatures: vi.fn(),
}));

import InvoiceView from '../components/invoice/InvoiceView';
import { saveSignatures } from '../utils/signatureStorage';
import { STORAGE_FULL_MESSAGE } from '../utils/constants';

const invoice = { number: 1050, date: 'October 7, 2026', storeName: 'Corner Shop', items: [{ id: 1, name: 'Bread', qty: 2, price: 3 }] };

async function signAsDriver() {
  render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /sign Driver/ }));
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('signature save status', () => {
  it('says "Saved" when the phone stored it', async () => {
    saveSignatures.mockReturnValue({ savedLocally: true, cloud: Promise.resolve(false) });
    await signAsDriver();
    expect(screen.getByText(/Saved/)).toBeInTheDocument();
    expect(screen.queryByText(STORAGE_FULL_MESSAGE)).toBeNull();
  });

  it('says it was not saved when neither the phone nor the cloud took it', async () => {
    saveSignatures.mockReturnValue({ savedLocally: false, cloud: Promise.resolve(false) });
    await signAsDriver();
    expect(await screen.findByText(STORAGE_FULL_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/✓ Saved/)).toBeNull();
  });

  it('says "Saved" once the cloud took it, even though the phone is full', async () => {
    saveSignatures.mockReturnValue({ savedLocally: false, cloud: Promise.resolve(true) });
    await signAsDriver();
    expect(await screen.findByText(/✓ Saved/)).toBeInTheDocument();
    expect(screen.queryByText(STORAGE_FULL_MESSAGE)).toBeNull();
  });
});
