/**
 * shellModeShare.test.jsx
 *
 * Every Easy-vs-normal decision on screen follows the mode the SHELL was built
 * with (App decides it once per mount and passes it down), never a fresh read
 * of the stored flag. They can differ: a free driver with no plan answer yet is
 * in an Easy shell with the flag off; a Pro driver mid-invoice has a normal
 * shell while a fresh Free answer has already switched the flag on, with the
 * reload waiting. The share label and the PDF layout were reading the flag.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';

const { INVOICE } = vi.hoisted(() => ({
  INVOICE: {
    number: 1042, storeName: 'Corner Store', storePhone: '718-555-0123', storeAddress: '1 Main St',
    customerName: 'Sam', notes: 'Back door', date: 'October 1, 2026', time: '09:00 AM',
    paymentMethod: 'cash', paymentStatus: 'unpaid', createdAt: '2026-10-01T09:00:00.000Z',
    items: [{ id: 'a', name: 'Widget', qty: 3, price: 5 }],
  },
}));

vi.mock('../utils/pdfGenerator', () => ({
  generatePDFBlob: vi.fn(async () => ({ blob: new Blob(), filename: 'Invoice_1042.pdf', doc: {} })),
  generateAndSharePDF: vi.fn(async () => {}),
  sharePDFBlob: vi.fn(async () => {}),
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
  getSignatures: vi.fn(() => ({ seller: null, buyer: null })),
  saveSignatures: vi.fn(),
  hasSignature: vi.fn(() => false),
  fetchSignatureFromCloud: vi.fn(async () => ({ seller: null, buyer: null })),
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

import InvoiceView from '../components/invoice/InvoiceView.jsx';
import InvoiceHistory from '../components/invoice/InvoiceHistory.jsx';
import StoreBalance from '../pages/StoreBalance.jsx';
import { generatePDFBlob, generateAndSharePDF } from '../utils/pdfGenerator';
import { STORAGE_KEYS } from '../utils/constants';
import { givePro } from './helpers/givePro';

const wrap = (el) => render(<ThemeProvider>{el}</ThemeProvider>);

/** A free driver with no plan answer yet: the shell is Easy, the stored flag is off. */
const easyShellFlagOff = () => localStorage.removeItem(STORAGE_KEYS.EASY_MODE);
/** A Pro driver with an open invoice when a Free answer switched the flag on: the shell is normal, the flag is on. */
const normalShellFlagOn = () => { givePro(); localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true'); };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('InvoiceView', () => {
  it('an Easy shell says Print / Share and prints the template, though the stored flag is off', async () => {
    easyShellFlagOff();
    wrap(<InvoiceView invoice={INVOICE} easyMode onBack={() => {}} onNewInvoice={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print / Share' }));
    await waitFor(() => expect(generatePDFBlob).toHaveBeenCalledTimes(1));
    expect(generatePDFBlob.mock.calls[0][0].layout).toBe('template');
  });

  it('...and Download PDF prints the template too', async () => {
    easyShellFlagOff();
    wrap(<InvoiceView invoice={INVOICE} easyMode onBack={() => {}} onNewInvoice={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(generatePDFBlob).toHaveBeenCalledTimes(1));
    expect(generatePDFBlob.mock.calls[0][0].layout).toBe('template');
  });

  it('a normal shell says Share and prints the standard layout, though the stored flag is on', async () => {
    normalShellFlagOn();
    wrap(<InvoiceView invoice={INVOICE} easyMode={false} onBack={() => {}} onNewInvoice={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Print / Share' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(generatePDFBlob).toHaveBeenCalledTimes(1));
    expect(generatePDFBlob.mock.calls[0][0].layout).toBe('standard');
  });
});

describe('Route (InvoiceHistory)', () => {
  const openMenu = async () => fireEvent.click(await screen.findByRole('button', { name: 'Invoice actions' }));

  it('an Easy shell says Print / Share and prints the template, though the stored flag is off', async () => {
    easyShellFlagOff();
    wrap(<InvoiceHistory easyMode onNav={vi.fn()} onNewInvoice={vi.fn()} />);
    await openMenu();
    expect(screen.queryByRole('button', { name: 'Share PDF' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Print / Share' })[0]);
    await waitFor(() => expect(generateAndSharePDF).toHaveBeenCalledTimes(1));
    expect(generateAndSharePDF.mock.calls[0][0].layout).toBe('template');
  });

  it('a normal shell says Share PDF and prints the standard layout, though the stored flag is on', async () => {
    normalShellFlagOn();
    wrap(<InvoiceHistory easyMode={false} onNav={vi.fn()} onNewInvoice={vi.fn()} />);
    await openMenu();
    expect(screen.queryByRole('button', { name: 'Print / Share' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Share PDF' })[0]);
    await waitFor(() => expect(generateAndSharePDF).toHaveBeenCalledTimes(1));
    expect(generateAndSharePDF.mock.calls[0][0].layout).toBe('standard');
  });
});

describe('Store balance', () => {
  async function shareFirstInvoice(props, label) {
    wrap(<StoreBalance storeName="Corner Store" onBack={() => {}} {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
    const tab = { close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab);
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(generateAndSharePDF).toHaveBeenCalledTimes(1));
    window.open.mockRestore();
    return generateAndSharePDF.mock.calls[0][0];
  }

  it('an Easy shell says Print / Share and prints the template, though the stored flag is off', async () => {
    easyShellFlagOff();
    expect((await shareFirstInvoice({ easyMode: true }, 'Print / Share')).layout).toBe('template');
    expect(screen.queryByRole('button', { name: 'Share PDF' })).toBeNull();
  });

  it('a normal shell says Share PDF and prints the standard layout, though the stored flag is on', async () => {
    normalShellFlagOn();
    expect((await shareFirstInvoice({ easyMode: false }, 'Share PDF')).layout).toBe('standard');
    expect(screen.queryByRole('button', { name: 'Print / Share' })).toBeNull();
  });
});

describe('nothing on screen reads the stored flag on its own', () => {
  /** Every non-test source file under src, as { path, text }. */
  // eslint-disable-next-line no-undef -- Node global; vitest runs from the repo root
  const SRC = join(process.cwd(), 'src');
  function sources(dir = SRC) {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
      return /\.(js|jsx)$/.test(name) ? [{ path, text: readFileSync(path, 'utf8') }] : [];
    });
  }
  // The shell's own decision (App), the Easy Mode switch, PlanRunner (which compares the plan's reading
  // with the mode the shell was built for), useQuickStart (which asks about the flag itself, to tell a
  // settled Easy shell from a stopgap one) and easyMode.js itself. NavDrawer and tabs.js only fall back to
  // easyModeFor() for a caller that gives no mode, and App always does.
  const MAY_READ = ['App.jsx', 'EasyModeSetting.jsx', 'PlanRunner.jsx', 'useQuickStart.js', 'easyMode.js', 'NavDrawer.jsx', 'tabs.js'];

  it('isEasyMode() and easyModeFor() are called only by the shell, its switch and the plan', () => {
    const readers = sources()
      .filter(({ text }) => /\b(isEasyMode|easyModeFor)\(/.test(text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')))
      .map(({ path }) => path.split('/').pop())
      .filter((file) => !MAY_READ.includes(file));
    expect(readers).toEqual([]);
  });
});
