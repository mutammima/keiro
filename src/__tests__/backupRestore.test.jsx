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
import { canCreateInvoice } from '../utils/plan';
import { localMonth } from '../utils/invoiceUtils';

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

  it('never restores a plan answer (a backup must not carry Pro to another account)', async () => {
    const backup = { inv_plan_cache: JSON.stringify({ pro: true, source: 'manual', proUntil: null }), inv_business_name: JSON.stringify('Corner Shop') };
    const { result } = renderHook(() => useBackup());
    const file = new File([JSON.stringify(backup)], 'keiro-backup.json', { type: 'application/json' });
    act(() => result.current.handleImportFile({ target: { files: [file], value: 'x' } }));
    await vi.waitFor(() => expect(result.current.backupMsg).toMatch(/Restore complete/));
    expect(localStorage.getItem('inv_plan_cache')).toBeNull();
    expect(localStorage.getItem('inv_business_name')).toBe(backup.inv_business_name);
  });

  it('never restores another account\'s month count or one-time plan note', async () => {
    // 20 used this month, from someone else's phone: restored, it would block a free driver until the 1st.
    const backup = {
      inv_usage: JSON.stringify({ month: localMonth(), count: 20 }),
      inv_plan_notice: JSON.stringify('moved'),
      inv_business_name: JSON.stringify('Corner Shop'),
    };
    const { result } = renderHook(() => useBackup());
    const file = new File([JSON.stringify(backup)], 'keiro-backup.json', { type: 'application/json' });
    act(() => result.current.handleImportFile({ target: { files: [file], value: 'x' } }));
    await vi.waitFor(() => expect(result.current.backupMsg).toMatch(/Restore complete/));
    expect(localStorage.getItem('inv_usage')).toBeNull();
    expect(localStorage.getItem('inv_plan_notice')).toBeNull();
    expect(localStorage.getItem('inv_business_name')).toBe(backup.inv_business_name);
    expect(canCreateInvoice()).toBe(true);
  });

  it('never exports the plan answer, the month count or the plan note either', async () => {
    localStorage.setItem('inv_plan_cache', JSON.stringify({ pro: true, source: 'manual', proUntil: null }));
    localStorage.setItem('inv_usage', JSON.stringify({ month: localMonth(), count: 20 }));
    localStorage.setItem('inv_plan_notice', JSON.stringify('ended'));
    localStorage.setItem('inv_business_name', JSON.stringify('Corner Shop'));
    // jsdom has no object URLs and would try to navigate on the download click.
    let exported;
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => { exported = blob; return 'blob:keiro-test'; };
    URL.revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useBackup());
      await act(async () => { await result.current.handleExport(); });
      const text = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsText(exported);
      });
      const keys = Object.keys(JSON.parse(text));
      expect(keys).toContain('inv_business_name');
      expect(keys).not.toContain('inv_plan_cache');
      expect(keys).not.toContain('inv_usage');
      expect(keys).not.toContain('inv_plan_notice');
    } finally {
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
      click.mockRestore();
    }
  });
});
