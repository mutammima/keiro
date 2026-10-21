/**
 * invoiceSignatureStatus.test.jsx — what the invoice screen says after a
 * signature is drawn. "Saved" only when a copy exists somewhere; on a full
 * phone with no connection it says the signature was not saved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

vi.mock('../services/supabase', () => ({ supabase: { auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })) } } }));

vi.mock('../components/ui/SignaturePad', () => ({
  default: ({ label, onChange }) => (
    <button onClick={() => onChange(`data:${label}`)}>sign {label}</button>
  ),
}));

vi.mock('../utils/signatureStorage', () => ({
  getSignatures: vi.fn(() => ({ seller: null, buyer: null })),
  hasSignature: vi.fn(() => false),
  fetchSignatureFromCloud: vi.fn(async () => ({ seller: null, buyer: null })),
  saveSignatures: vi.fn(),
}));

// The real recolour draws on a canvas, which jsdom can't (signatureImage.test.js covers it). This one
// says which ink it was asked for, so a test can tell a recoloured image from the one that was stored.
vi.mock('../utils/signatureImage', async (importOriginal) => ({
  ...(await importOriginal()),
  recolorSignature: vi.fn(async (src, color) => `ink(${color}):${src}`),
}));

import InvoiceView from '../components/invoice/InvoiceView';
import { saveSignatures, getSignatures, hasSignature, fetchSignatureFromCloud } from '../utils/signatureStorage';
import { recolorSignature, PRINT_INK } from '../utils/signatureImage';
import { ThemeProvider } from '../context/ThemeContext.jsx';
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
  hasSignature.mockReset();
  hasSignature.mockReturnValue(false);
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

  it('free plan: signatures already on the invoice still show, read-only, as they print — no pads', async () => {
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    getSignatures.mockReturnValueOnce({ seller: 'data:image/png;base64,SELLER', buyer: 'data:image/png;base64,BUYER' });
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    // Shown in print ink (what the PDF will carry), not as stored.
    await waitFor(() => expect(screen.getByAltText(PLAN_COPY.sellerSigAlt)).toHaveAttribute('src', `ink(${PRINT_INK}):data:image/png;base64,SELLER`));
    expect(screen.getByAltText(PLAN_COPY.buyerSigAlt)).toHaveAttribute('src', `ink(${PRINT_INK}):data:image/png;base64,BUYER`);
    expect(recolorSignature).toHaveBeenCalledWith('data:image/png;base64,SELLER', PRINT_INK);
    expect(recolorSignature).toHaveBeenCalledWith('data:image/png;base64,BUYER', PRINT_INK);
    expect(screen.queryByRole('button', { name: /^sign / })).toBeNull();      // the pads (mocked as "sign …" buttons)
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument(); // the card still folds
    expect(screen.queryByText(/Signature lines print blank/)).toBeNull();     // they are signed: nothing prints blank
    expect(saveSignatures).not.toHaveBeenCalled();                            // showing them re-uploads nothing
  });

  // The alt text is for a screen reader; someone looking at the card needs to see whose signature each box is.
  it('free plan: each read-only signature is captioned like its signing pad, not by alt text alone', async () => {
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    getSignatures.mockReturnValueOnce({ seller: 'data:image/png;base64,SELLER', buyer: 'data:image/png;base64,BUYER' });
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    await waitFor(() => expect(screen.getByAltText(PLAN_COPY.sellerSigAlt)).toHaveAttribute('src', `ink(${PRINT_INK}):data:image/png;base64,SELLER`));
    expect(screen.getByText('Driver / Deliverer')).toBeVisible();
    expect(screen.getByText('Store Manager — Proof of Delivery')).toBeVisible();
  });

  it('free plan: a caption only for the signature that exists', async () => {
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    getSignatures.mockReturnValueOnce({ seller: 'data:image/png;base64,SELLER', buyer: null });
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    expect(await screen.findByText('Driver / Deliverer')).toBeVisible();
    expect(screen.queryByText('Store Manager — Proof of Delivery')).toBeNull();
  });

  it('the captions are the signing pads\' own labels, from one place (PLAN_COPY)', async () => {
    const both = { seller: 'data:image/png;base64,SELLER', buyer: 'data:image/png;base64,BUYER' };
    // Pro: the pads (mocked as "sign <label>" buttons).
    givePro();
    getSignatures.mockReturnValueOnce(both);
    const pro = render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    const padLabels = screen.getAllByRole('button', { name: /^sign / }).map((b) => b.textContent.replace(/^sign /, ''));
    expect(padLabels).toEqual([PLAN_COPY.sellerSigCaption, PLAN_COPY.buyerSigCaption]);
    pro.unmount();
    // Free: the same words as captions.
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    getSignatures.mockReturnValueOnce(both);
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    for (const label of padLabels) expect(await screen.findByText(label)).toBeVisible();
  });

  // The invoice was signed on another phone: the index says so, but the images come from the cloud when it is opened.
  // Until they land the card must not say the lines "print blank" (they won't), only to take it back a moment later.
  describe('free plan: an invoice signed on another phone', () => {
    const blankLine = /Signature lines print blank/;
    function fetchByHand() {
      let resolve; let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      hasSignature.mockReturnValue(true);
      fetchSignatureFromCloud.mockReturnValueOnce(promise);
      return { resolve, reject };
    }
    const open = () => render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    beforeEach(() => { localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE); });

    it('says nothing about blank lines while the signatures are being fetched, then shows them', async () => {
      const fetch = fetchByHand();
      open();
      expect(fetchSignatureFromCloud).toHaveBeenCalledWith(invoice.number);
      expect(screen.queryByText(blankLine)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
      await act(async () => { fetch.resolve({ seller: 'data:image/png;base64,SELLER', buyer: null }); });
      expect(await screen.findByAltText(PLAN_COPY.sellerSigAlt)).toBeInTheDocument();
      expect(screen.queryByText(blankLine)).toBeNull();
    });

    it('if the cloud has nothing after all (a stale index), the card then says the lines print blank', async () => {
      const fetch = fetchByHand();
      open();
      expect(screen.queryByText(blankLine)).toBeNull();
      await act(async () => { fetch.resolve({ seller: null, buyer: null }); });
      expect(screen.getByText(blankLine)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();
    });

    it('...and so does a fetch that fails (offline): the lines would print blank', async () => {
      const fetch = fetchByHand();
      open();
      expect(screen.queryByText(blankLine)).toBeNull();
      await act(async () => { fetch.reject(new Error('offline')); });
      expect(screen.getByText(blankLine)).toBeInTheDocument();
    });

    it('an invoice nobody signed says it at once, with nothing to wait for', () => {
      open();
      expect(fetchSignatureFromCloud).not.toHaveBeenCalled();
      expect(screen.getByText(blankLine)).toBeInTheDocument();
    });

    it('opening another signed invoice waits for its own fetch', async () => {
      const first = fetchByHand();
      const { rerender } = open();
      await act(async () => { first.resolve({ seller: null, buyer: null }); });
      expect(screen.getByText(blankLine)).toBeInTheDocument();
      const second = fetchByHand();
      rerender(<InvoiceView invoice={{ ...invoice, number: 1051 }} onBack={() => {}} onNewInvoice={() => {}} />);
      expect(fetchSignatureFromCloud).toHaveBeenLastCalledWith(1051);
      expect(screen.queryByText(blankLine)).toBeNull();
      await act(async () => { second.resolve({ seller: null, buyer: null }); });
      expect(screen.getByText(blankLine)).toBeInTheDocument();
    });
  });

  // The pads were opened with nothing drawn, then a Free answer landed: there is nothing to show read-only, so the
  // card is back to its closed look (no empty box under the header, no 14px left under it for one).
  it('pads open with nothing drawn, then the plan goes Free: no empty box or gap is left in the card', () => {
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
    expect(screen.getAllByRole('button', { name: /^sign / })).toHaveLength(2);   // the pads are open
    act(() => {
      localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
      window.dispatchEvent(new CustomEvent(EVENTS.PLAN_CHANGE));
    });
    expect(screen.queryByRole('button', { name: /^sign / })).toBeNull();
    expect(screen.getByText(/Signature lines print blank/)).toBeInTheDocument();
    const header = screen.getByText('Signatures').parentElement.parentElement;
    const card = header.parentElement;
    expect(header.style.marginBottom).toBe('0px');
    for (const child of card.children) expect(child).not.toBeEmptyDOMElement();
  });

  it('...but signatures that exist keep the card open, with the gap under its header', async () => {
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    getSignatures.mockReturnValueOnce({ seller: 'data:image/png;base64,SELLER', buyer: null });
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    expect(await screen.findByAltText(PLAN_COPY.sellerSigAlt)).toBeInTheDocument();
    const header = screen.getByText('Signatures').parentElement.parentElement;
    expect(header.style.marginBottom).toBe('14px');
  });

  it('free plan, dark mode: a signature drawn in white ink shows in print ink on its white box, never as stored', async () => {
    localStorage.setItem(STORAGE_KEYS.DARK_MODE, 'true');
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    const whiteStrokes = 'data:image/png;base64,WHITE-STROKES'; // what the pad stores in dark mode, Keiro's default
    getSignatures.mockReturnValueOnce({ seller: whiteStrokes, buyer: null });
    render(<ThemeProvider><InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} /></ThemeProvider>);
    expect(document.body.style.background).toBe('rgb(0, 0, 0)'); // it really is dark mode
    const image = screen.getByAltText(PLAN_COPY.sellerSigAlt);
    await waitFor(() => expect(image).toHaveAttribute('src', `ink(${PRINT_INK}):${whiteStrokes}`));
    expect(recolorSignature).toHaveBeenCalledTimes(1);
    expect(recolorSignature).toHaveBeenCalledWith(whiteStrokes, PRINT_INK);
    expect(image.style.backgroundColor).toBe('rgb(255, 255, 255)'); // the white box the print ink sits on
    expect(screen.queryByAltText(PLAN_COPY.buyerSigAlt)).toBeNull();
  });

  it('free plan: the Upgrade link has a 44px hit box that takes no room', () => {
    localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
    render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
    const link = screen.getByRole('button', { name: 'Upgrade' });
    const px = (value) => parseFloat(value);
    const { paddingTop, paddingRight, paddingBottom, paddingLeft, marginTop, marginRight, marginBottom, marginLeft } = link.style;
    // Each side's padding is cancelled by an equal negative margin, so the line is as tall and as wide as its text.
    expect(px(marginTop) + px(paddingTop)).toBe(0);
    expect(px(marginRight) + px(paddingRight)).toBe(0);
    expect(px(marginBottom) + px(paddingBottom)).toBe(0);
    expect(px(marginLeft) + px(paddingLeft)).toBe(0);
    // A 12px text line is at least 14px tall; with the padding it reaches the 44px minimum tap target.
    expect(14 + px(paddingTop) + px(paddingBottom)).toBeGreaterThanOrEqual(44);
    expect(px(paddingLeft) + px(paddingRight)).toBeGreaterThanOrEqual(16); // and a little sideways, for a thumb
    expect(link.style.WebkitTapHighlightColor).toBe('transparent');        // like the file's other buttons
  });

  it('the read-only signature images are named from PLAN_COPY, and the real names are unchanged', async () => {
    expect(PLAN_COPY.sellerSigAlt).toBe('Driver / Deliverer signature');
    expect(PLAN_COPY.buyerSigAlt).toBe('Store Manager signature');
    // Swap the names for sentinels: an alt typed into InvoiceView would not change.
    const saved = { sellerSigAlt: PLAN_COPY.sellerSigAlt, buyerSigAlt: PLAN_COPY.buyerSigAlt };
    Object.assign(PLAN_COPY, { sellerSigAlt: 'Seller!', buyerSigAlt: 'Buyer!' });
    try {
      localStorage.removeItem(STORAGE_KEYS.PLAN_CACHE);
      getSignatures.mockReturnValueOnce({ seller: 'data:image/png;base64,SELLER', buyer: 'data:image/png;base64,BUYER' });
      render(<InvoiceView invoice={invoice} onBack={() => {}} onNewInvoice={() => {}} />);
      await waitFor(() => expect(screen.getByAltText('Seller!')).toHaveAttribute('src', `ink(${PRINT_INK}):data:image/png;base64,SELLER`));
      expect(screen.getByAltText('Buyer!')).toHaveAttribute('src', `ink(${PRINT_INK}):data:image/png;base64,BUYER`);
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
