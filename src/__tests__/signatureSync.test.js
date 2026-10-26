/**
 * signatureSync.test.js
 *
 * A signature that failed to upload used to be logged and forgotten, so the
 * only copy lived in inv_sig_<n> — and sign-out wipes every inv_* key. Failed
 * uploads (and failed cloud deletes) now go into the sync queue, which is what
 * useSafeSignOut counts before letting anyone sign out.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/db', () => ({
  saveSignatureRow: vi.fn(),
  deleteSignatureRow: vi.fn(),
}));

import * as db from '../services/db';
import { saveSignatures, clearSignatures } from '../utils/signatureStorage';

const queue = () => JSON.parse(localStorage.getItem('inv_sync_queue') || '[]');
const settle = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('signature uploads', () => {
  it('queue the signature when the upload fails', async () => {
    db.saveSignatureRow.mockResolvedValue({ error: new Error('Failed to fetch') });

    saveSignatures(1050, 'data:seller', null);
    await settle();

    expect(queue()).toEqual([expect.objectContaining({ type: 'sync_signature', payload: { invoiceNumber: 1050 } })]);
  });

  it('queue nothing when the upload succeeds', async () => {
    db.saveSignatureRow.mockResolvedValue({ error: null });

    saveSignatures(1050, 'data:seller', null);
    await settle();

    expect(queue()).toEqual([]);
  });

  it('queue a cleared signature whose cloud delete fails', async () => {
    db.deleteSignatureRow.mockRejectedValue(new TypeError('Failed to fetch'));

    clearSignatures(1050);
    await settle();

    expect(queue()).toEqual([expect.objectContaining({ type: 'sync_signature', payload: { invoiceNumber: 1050 } })]);
  });
});

describe('signatures on a full phone, and upload order (review fixes)', () => {
  const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  /** The phone refuses signature images (inv_sig_<n>) but takes small writes. */
  function refuseSignatureWrites() {
    const realSetItem = Storage.prototype.setItem;
    return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (/^inv_sig_\d+$/.test(key)) throw quota();
      return realSetItem.call(this, key, value);
    });
  }
  const index = () => JSON.parse(localStorage.getItem('inv_sig_index') || '[]');
  let spy = null;
  afterEach(() => { spy?.mockRestore(); spy = null; });

  it('saved nowhere: says so, and the invoice is not marked signed', async () => {
    db.saveSignatureRow.mockResolvedValue({ error: new Error('Failed to fetch') });
    spy = refuseSignatureWrites();
    const result = saveSignatures(1050, 'data:seller', null);
    expect(result.savedLocally).toBe(false);
    expect(await result.cloud).toBe(false);
    expect(index()).toEqual([]);
    expect(queue()).toEqual([]);
  });

  it('saved only in the cloud: marked signed, and the older local copy and its queued replay are dropped', async () => {
    localStorage.setItem('inv_sig_1050', JSON.stringify({ seller: 'data:old', buyer: null, updatedAt: '2026-01-01T00:00:00.000Z' }));
    localStorage.setItem('inv_sync_queue', JSON.stringify([
      { id: 'q', type: 'sync_signature', payload: { invoiceNumber: 1050 }, ts: 1, retries: 0 },
    ]));
    db.saveSignatureRow.mockResolvedValue({ error: null });
    spy = refuseSignatureWrites();
    const result = saveSignatures(1050, 'data:new', null);
    expect(await result.cloud).toBe(true);
    expect(index()).toEqual([1050]);
    expect(localStorage.getItem('inv_sig_1050')).toBeNull();
    expect(queue()).toEqual([]);
  });

  it("uploads one invoice's signatures in order, so the cloud ends with the newest", async () => {
    let release;
    db.saveSignatureRow
      .mockImplementationOnce(() => new Promise((r) => { release = () => r({ error: null }); }))
      .mockResolvedValue({ error: null });
    saveSignatures(1050, 'data:first', null);
    saveSignatures(1050, 'data:second', null);
    await settle();
    expect(db.saveSignatureRow).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => expect(db.saveSignatureRow).toHaveBeenCalledTimes(2));
    expect(db.saveSignatureRow.mock.calls[1][0].seller).toBe('data:second');
  });
});
