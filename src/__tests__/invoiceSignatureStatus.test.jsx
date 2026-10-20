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
  getSignatures: vi.fn(() => ({ seller: null, buyer: null })),
  hasSignature: () => false,
  fetchSignatureFromCloud: vi.fn(async () => ({ seller: null, buyer: null })),
  saveSignatures: vi.fn(),
}));

import InvoiceView from '../components/invoice/InvoiceView';
import { saveSignatures, getSignatures } from '../utils/signatureStorage';
import { STORAGE_FULL_MESSAGE, STORAGE_KEYS, EVENTS, PLAN_COPY } from '../utils/constants';
import { givePro } from './helpers/givePro';

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
  givePro();
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

  it('free plan: no signing on the phone — the lines print blank, with Upgrade', () => {
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Sign' })).toBeNull();
    expect(screen.getByText(/Signature lines print blank, to sign by hand/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();
  });

  it('free plan: the Upgrade link opens the plain Upgrade sheet, never with the click event as its title', () => {
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    const opened = vi.fn();
    window.addEventListener(EVENTS.OPEN_UPGRADE, opened);
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0][0].detail.title).toBeUndefined();
    window.removeEventListener(EVENTS.OPEN_UPGRADE, opened);
  });

  it('free plan: signatures already on the invoice still show, read-only — no pads', () => {
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    getSignatures.mockReturnValueOnce({ seller: 'data:image/png;base64,SELLER', buyer: 'data:image/png;base64,BUYER' });
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    expect(screen.getByAltText(PLAN_COPY.sellerSigAlt)).toHaveAttribute('src', 'data:image/png;base64,SELLER');
    expect(screen.getByAltText(PLAN_COPY.buyerSigAlt)).toHaveAttribute('src', 'data:image/png;base64,BUYER');
    expect(screen.queryByRole('button', { name: /^sign / })).toBeNull();      // the pads (mocked as "sign …" buttons)
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument(); // the card still folds
    expect(screen.queryByText(/Signature lines print blank/)).toBeNull();     // they are signed: nothing prints blank
    expect(saveSignatures).not.toHaveBeenCalled();                            // showing them re-uploads nothing
  });

  it('the read-only signature images are named from PLAN_COPY, and the real names are unchanged', () => {
    expect(PLAN_COPY.sellerSigAlt).toBe('Driver / Deliverer signature');
    expect(PLAN_COPY.buyerSigAlt).toBe('Store Manager signature');
    // Swap the names for sentinels: an alt typed into InvoiceView would not change.
    const saved = { sellerSigAlt: PLAN_COPY.sellerSigAlt, buyerSigAlt: PLAN_COPY.buyerSigAlt };
    Object.assign(PLAN_COPY, { sellerSigAlt: 'Seller!', buyerSigAlt: 'Buyer!' });
    try {
      localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
      getSignatures.mockReturnValueOnce({ seller: 'data:image/png;base64,SELLER', buyer: 'data:image/png;base64,BUYER' });
      render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
      expect(screen.getByAltText('Seller!')).toHaveAttribute('src', 'data:image/png;base64,SELLER');
      expect(screen.getByAltText('Buyer!')).toHaveAttribute('src', 'data:image/png;base64,BUYER');
    } finally {
      Object.assign(PLAN_COPY, saved);
    }
  });

  it('the Sign button follows the plan when a Pro answer lands while the invoice is open', () => {
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Sign' })).toBeNull();
    act(() => {
      givePro();
      window.dispatchEvent(new CustomEvent(EVENTS.PLAN_CHANGE));
    });
    expect(screen.getByRole('button', { name: 'Sign' })).toBeInTheDocument();
    expect(screen.queryByText(/Signature lines print blank/)).toBeNull();
  });

  it('Pro: signing on the phone works as today', () => {
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    expect(screen.getByRole('button', { name: 'Sign' })).toBeInTheDocument();
    expect(screen.queryByText(/Signature lines print blank/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });

  it('a guest can still sign: only signed-in free drivers are locked', () => {
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    expect(screen.getByRole('button', { name: 'Sign' })).toBeInTheDocument();
    expect(screen.queryByText(/Signature lines print blank/)).toBeNull();
  });
});
