/**
 * pdfTemplate.test.js
 *
 * Easy Mode prints a letter-page template: any empty Bill-To field (store,
 * contact, phone, address) and empty notes print as a labeled ruled line to
 * fill in by pen, plus a "Paid by ☐ Cash ☐ Card ☐ Check · Amount" line.
 * Normal-mode PDFs keep today's layout. jsPDF writes uncompressed content
 * streams, so drawn text appears in doc.output() as "(text)".
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generatePDFBlob } from '../utils/pdfGenerator';
import { pdfLayoutFor } from '../utils/easyMode';
import { STORAGE_KEYS } from '../utils/constants';

const base = {
  businessName: 'Biz', businessPhone: '555-123-4567', number: 1042,
  date: 'October 14, 2026', time: '09:41 AM',
  items: [{ id: 'a', name: 'Mobil 1 5W-30 5qt', qty: 2, price: 24.99 }],
};
const pdfText = async (invoice) => (await generatePDFBlob(invoice)).doc.output();
const TEMPLATE_LABELS = ['(Store:)', '(Contact:)', '(Phone:)', '(Address:)', '(Paid by:)', '(Cash)', '(Card)', '(Check)', '(Amount:)', '(Notes:)'];

beforeEach(() => localStorage.clear());

describe('Easy Mode template', () => {
  it('prints labeled lines for empty fields, plus Paid by', async () => {
    const out = await pdfText({ ...base, storeName: '', notes: '', layout: 'template' });
    for (const label of TEMPLATE_LABELS) expect(out).toContain(label);
  });

  it('prints filled fields with their values', async () => {
    const out = await pdfText({ ...base, storeName: 'Sunrise Deli', storePhone: '718-555-0123', notes: 'Leave at back door', layout: 'template' });
    expect(out).toContain('(Sunrise Deli)');
    expect(out).toContain('(718-555-0123)');
    expect(out).toContain('(Leave at back door)');
    expect(out).toContain('(Paid by:)');
  });

  // The layout belongs to the screen that asks for it (pdfLayoutFor, from the shell's mode). The flag can
  // already say otherwise: a free driver with no plan answer yet is in an Easy shell with the flag off.
  it('the stored Easy Mode flag does not pick the layout: only the caller does', async () => {
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    const out = await pdfText({ ...base, storeName: 'Sunrise Deli' });
    expect(out).not.toContain('(Paid by:)');
  });

  it('a template asked for prints whatever the flag says', async () => {
    localStorage.removeItem(STORAGE_KEYS.EASY_MODE);
    const out = await pdfText({ ...base, storeName: 'Sunrise Deli', layout: 'template' });
    expect(out).toContain('(Paid by:)');
  });

  it('pdfLayoutFor maps the shell\'s mode to a layout', () => {
    expect(pdfLayoutFor(true)).toBe('template');
    expect(pdfLayoutFor(false)).toBe('standard');
    expect(pdfLayoutFor(undefined)).toBe('standard');
  });
});

describe('normal mode', () => {
  it('keeps today’s layout: no template labels', async () => {
    const out = await pdfText({ ...base, storeName: 'Sunrise Deli', notes: '' });
    expect(out).toContain('(Sunrise Deli)');
    for (const label of ['(Store:)', '(Contact:)', '(Paid by:)', '(Amount:)']) expect(out).not.toContain(label);
  });
});

describe('file name', () => {
  it('leaves the store out when there is none', async () => {
    expect((await generatePDFBlob({ ...base, storeName: '' })).filename).toBe('Invoice_1042.pdf');
    expect((await generatePDFBlob({ ...base, storeName: 'Sunrise Deli' })).filename).toBe('Invoice_1042_Sunrise_Deli.pdf');
  });
});

describe('long deliveries', () => {
  /** The y (from the top) and page where `text` was drawn, read from jsPDF's page streams. */
  function placeOf(doc, text) {
    const pageH = doc.internal.pageSize.getHeight();
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
      // Each text draw is one entry: "BT … <x> <y> Td (<text>) Tj ET", y from the bottom.
      const op = doc.internal.pages[p].find(l => l.includes(`(${text}) Tj`));
      const m = op && /(-?[\d.]+) (-?[\d.]+) Td/.exec(op);
      if (m) return { page: p, y: pageH - parseFloat(m[2]) };
    }
    return null;
  }

  it('a normal invoice also never prints its totals or signatures off the bottom of a page', async () => {
    for (const count of [12, 14, 16, 18]) {
      const items = Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Item ${i + 1}`, qty: 1, price: 1 }));
      const { doc } = await generatePDFBlob({ ...base, storeName: 'Sunrise Deli', notes: 'Back door', items });
      const bottom = doc.internal.pageSize.getHeight() - 60;
      for (const text of ['Subtotal', 'Notes:', 'Buyer / Recipient Signature']) {
        const at = placeOf(doc, text);
        expect(at, `${text} with ${count} items`).not.toBeNull();
        expect(at.y, `${text} with ${count} items`).toBeLessThan(bottom - (text.startsWith('Buyer') ? 70 : 0));
      }
    }
  });

  it('a short normal invoice stays on one page', async () => {
    const { doc } = await generatePDFBlob({ ...base, storeName: 'Sunrise Deli', notes: '' });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('the template never prints Paid by, Notes or the signatures off the bottom of a page', async () => {
    for (const count of [10, 12, 14, 16, 18]) {
      const items = Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Item ${i + 1}`, qty: 1, price: 1 }));
      const { doc } = await generatePDFBlob({ ...base, storeName: '', notes: '', items, layout: 'template' });
      const bottom = doc.internal.pageSize.getHeight() - 60; // above the footer rule
      for (const text of ['Paid by:', 'Notes:', 'Buyer / Recipient Signature']) {
        const at = placeOf(doc, text);
        expect(at, `${text} with ${count} items`).not.toBeNull();
        expect(at.y, `${text} with ${count} items`).toBeLessThan(bottom - (text.startsWith('Buyer') ? 70 : 0));
      }
    }
  });
});

describe('template fields that are too long', () => {
  it('are cut to fit with "..." instead of running into the next label or off the page', async () => {
    const contact = 'Alexandra Konstantinopoulos-Vanderbilt Jr., Purchasing Manager';
    const address = '12345 North Very Long Boulevard Name Extension, Building 7, Suite 1200, Springfield Gardens, NY 11413';
    const { doc } = await generatePDFBlob({ ...base, storeName: 'Sunrise Deli', customerName: contact, storeAddress: address, notes: '', layout: 'template' });
    const out = doc.output();
    expect(out).not.toContain(`(${contact})`);
    expect(out).toContain('(Alexandra');
    expect(out).toMatch(/\(Alexandra[^)]*\.\.\.\)/);
    expect(out).not.toContain(`(${address})`);
    expect(out).toMatch(/\(12345 North[^)]*\.\.\.\)/);
  });
});
