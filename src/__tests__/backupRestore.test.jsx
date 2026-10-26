/**
 * backupRestore.test.jsx — restoring a backup never brings back the mark that
 * says "the cloud has this signature". The backup can be older than the cloud,
 * or from another account; the phone would otherwise free (delete) its only
 * copy of a signature the cloud may not hold.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../services/supabase', () => ({ supabase: { auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })) } } }));

import { useBackup } from '../hooks/useBackup';

beforeEach(() => {
  localStorage.clear();
  // The restore reloads the page 1.5 s later; that timer never runs here.
  // FileReader itself runs on setImmediate, which stays real.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => vi.useRealTimers());

describe('backup restore', () => {
  it('restores signatures without their "uploaded" stamp, and everything else as it was', async () => {
    const sig = { seller: 'data:seller', buyer: null, updatedAt: '2026-10-01T09:06:00.000Z', syncedVersion: '2026-10-01T09:06:00.000Z' };
    const backup = {
      inv_sig_1050: JSON.stringify(sig),
      inv_sig_index: JSON.stringify([1050]),
      inv_business_name: JSON.stringify('Corner Shop'),
    };
    const { result } = renderHook(() => useBackup());
    const file = new File([JSON.stringify(backup)], 'keiro-backup.json', { type: 'application/json' });
    act(() => result.current.handleImportFile({ target: { files: [file], value: 'x' } }));
    await vi.waitFor(() => expect(result.current.backupMsg).toMatch(/Restore complete/));

    const { syncedVersion, ...unstamped } = sig;
    expect(syncedVersion).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('inv_sig_1050'))).toEqual(unstamped);
    expect(localStorage.getItem('inv_sig_index')).toBe(backup.inv_sig_index);
    expect(localStorage.getItem('inv_business_name')).toBe(backup.inv_business_name);
  });
});
