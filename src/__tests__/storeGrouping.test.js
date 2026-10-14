/**
 * storeGrouping.test.js
 *
 * An Easy Mode invoice can have no store (written on the paper instead).
 * Those must not be lumped into a fake "Unknown" store in Stores or in
 * Reports' top stores; Stores counts them in its total and says how to add
 * the store.
 */

import { describe, it, expect } from 'vitest';
import { storeNameOf, storeLabelOf, groupInvoicesByStore, revenueByStore, unassignedStoreNote, subtotalOf } from '../utils/invoiceUtils';

const inv = (storeName, total, status = 'unpaid', date = 'October 10, 2026') =>
  ({ storeName, date, paymentStatus: status, items: [{ name: 'x', qty: 1, price: total }] });

describe('storeNameOf', () => {
  it('trims, and is empty when there is no store', () => {
    expect(storeNameOf({ storeName: ' Sunrise Deli ' })).toBe('Sunrise Deli');
    expect(storeNameOf({ store_name: 'Corner Mart' })).toBe('Corner Mart');
    expect(storeNameOf({ storeName: '' })).toBe('');
    expect(storeNameOf({})).toBe('');
  });
});

describe('groupInvoicesByStore', () => {
  it('groups by store, biggest balance first, and keeps invoices with no store apart', () => {
    const { stores, unassigned } = groupInvoicesByStore([
      inv('Sunrise Deli', 50), inv('Sunrise Deli', 20, 'paid'), inv('Corner Mart', 80),
      inv('', 30), inv('   ', 10, 'paid'),
    ]);
    expect(stores.map(s => [s.name, s.count, s.outstanding, s.total])).toEqual([
      ['Corner Mart', 1, 80, 80],
      ['Sunrise Deli', 2, 50, 70],
    ]);
    expect(stores.some(s => s.name === 'Unknown' || s.name === '')).toBe(false);
    expect(unassigned).toEqual({ count: 2, outstanding: 30 });
  });

  it('keeps the latest delivery date per store', () => {
    const { stores } = groupInvoicesByStore([inv('A', 1, 'unpaid', 'October 1, 2026'), inv('A', 1, 'unpaid', 'October 9, 2026')]);
    expect(stores[0].lastDate).toBe('October 9, 2026');
  });
});

describe('revenueByStore', () => {
  it('sums by store, biggest first, skipping invoices with no store', () => {
    const list = [inv('A', 10), inv('B', 30), inv('A', 25), inv('', 100)];
    expect(revenueByStore(list, subtotalOf)).toEqual([['A', 35], ['B', 30]]);
  });
});

describe('unassignedStoreNote', () => {
  it('reads naturally for one or many', () => {
    expect(unassignedStoreNote(1)).toBe('1 invoice has no store. Open it and tap ⋯ → Edit to add it.');
    expect(unassignedStoreNote(3)).toBe('3 invoices have no store. Open one and tap ⋯ → Edit to add it.');
  });
});

describe('storeLabelOf', () => {
  it('names the store, or says there is none instead of a blank title', () => {
    expect(storeLabelOf({ storeName: 'Sunrise Deli' })).toBe('Sunrise Deli');
    expect(storeLabelOf({ storeName: '' })).toBe('No store');
    expect(storeLabelOf({ store_name: '  ' })).toBe('No store');
  });
});
