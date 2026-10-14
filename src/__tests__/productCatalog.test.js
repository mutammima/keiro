/**
 * productCatalog.test.js
 *
 * When a scan finds nothing, the driver types the name and price once and
 * addItem() saves it under that barcode, so the next scan fills both in. A
 * guest has no cloud account, so the save lands in the phone's catalog
 * (inv_catalog) — but the lookup only fell back to that catalog on a cloud
 * *error*. As a guest the cloud query doesn't error; row-level security just
 * returns no row. So the phone's copy was never read and every rescan said
 * "Product not found".
 *
 * The cloud boundary (services/db.js) is mocked; localStorage is jsdom's.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/db', () => ({
  getProductByBarcode: vi.fn(),
  getProductByName: vi.fn(),
  saveProductBarcode: vi.fn(),
}));

import * as db from '../services/db';
import { getProductByBarcode, getProductByName, saveProductBarcode } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/constants';

const noRow = { data: null, error: null }; // what an anonymous (guest) query gets back
const notSignedIn = { data: null, error: new Error('Not authenticated') };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('remembering a product typed on this phone', () => {
  it('a guest’s rescan finds the product saved on the phone', async () => {
    db.saveProductBarcode.mockResolvedValue(notSignedIn);
    db.getProductByBarcode.mockResolvedValue(noRow);

    await saveProductBarcode('0071181000240', 'Motor Oil 5W-30 5qt', 24.99);

    expect(await getProductByBarcode('0071181000240')).toEqual({ name: 'Motor Oil 5W-30 5qt', lastPrice: 24.99 });
  });

  it('a guest typing a remembered name gets its price back', async () => {
    db.saveProductBarcode.mockResolvedValue(notSignedIn);
    db.getProductByName.mockResolvedValue(noRow);

    await saveProductBarcode('0071181000240', 'Motor Oil 5W-30 5qt', 24.99);

    expect(await getProductByName('motor oil 5w-30 5qt')).toEqual({ name: 'Motor Oil 5W-30 5qt', lastPrice: 24.99 });
  });

  it('prefers the cloud copy when the account has one', async () => {
    localStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify({ '0071181000240': { name: 'Old name', lastPrice: 20 } }));
    db.getProductByBarcode.mockResolvedValue({ data: { name: 'Motor Oil 5W-30 5qt', lastPrice: 24.99 }, error: null });

    expect(await getProductByBarcode('0071181000240')).toEqual({ name: 'Motor Oil 5W-30 5qt', lastPrice: 24.99 });
  });

  it('still returns null for a product nobody has saved', async () => {
    db.getProductByBarcode.mockResolvedValue(noRow);

    expect(await getProductByBarcode('0071181000240')).toBeNull();
  });
});
