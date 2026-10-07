/**
 * signatureSync.test.js
 *
 * A signature that failed to upload used to be logged and forgotten, so the
 * only copy lived in inv_sig_<n> — and sign-out wipes every inv_* key. Failed
 * uploads (and failed cloud deletes) now go into the sync queue, which is what
 * useSafeSignOut counts before letting anyone sign out.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
