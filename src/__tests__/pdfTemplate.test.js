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
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    const out = await pdfText({ ...base, storeName: '', notes: '' });
    for (const label of TEMPLATE_LABELS) expect(out).toContain(label);
  });

  it('prints filled fields with their values', async () => {
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    const out = await pdfText({ ...base, storeName: 'Sunrise Deli', storePhone: '718-555-0123', notes: 'Leave at back door' });
    expect(out).toContain('(Sunrise Deli)');
    expect(out).toContain('(718-555-0123)');
    expect(out).toContain('(Leave at back door)');
    expect(out).toContain('(Paid by:)');
  });

  it('an explicit layout wins over the setting', async () => {
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    const out = await pdfText({ ...base, storeName: 'Sunrise Deli', layout: 'standard' });
    expect(out).not.toContain('(Paid by:)');
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
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    expect((await generatePDFBlob({ ...base, storeName: '' })).filename).toBe('Invoice_1042.pdf');
    expect((await generatePDFBlob({ ...base, storeName: 'Sunrise Deli' })).filename).toBe('Invoice_1042_Sunrise_Deli.pdf');
  });
});
