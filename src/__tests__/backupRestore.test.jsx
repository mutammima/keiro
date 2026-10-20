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

/** Runs the export and returns the keys of the backup file. jsdom has no object URLs and would try to navigate on the download click. */
async function exportedKeys() {
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
    return Object.keys(JSON.parse(text));
  } finally {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
    click.mockRestore();
  }
}

describe('backup and the sync lists', () => {
  // The queue, the set-aside list and the held list all hold changes that exist ONLY on this phone (an invoice
  // refused for the free limit is the only copy of that invoice). The backup keeps all three, so a backup taken
  // while uploads wait, restored later, still has them; excluding one would silently lose invoices.
  const waiting = (id, number) => [{ id, type: 'save_invoice', payload: { invoice: { number } }, ts: 1, retries: 0 }];
  const lists = {
    inv_sync_queue: JSON.stringify(waiting('q1', 1021)),
    inv_sync_failed: JSON.stringify(waiting('f1', 1022)),
    inv_sync_held: JSON.stringify(waiting('h1', 1023)),
  };

  it('exports the queue, the set-aside list and the held list', async () => {
    for (const [key, value] of Object.entries(lists)) localStorage.setItem(key, value);
    expect(await exportedKeys()).toEqual(expect.arrayContaining(Object.keys(lists)));
  });

  it('restores the queue, the set-aside list and the held list', async () => {
    const backup = { ...lists, inv_business_name: JSON.stringify('Corner Shop') };
    const { result } = renderHook(() => useBackup());
    const file = new File([JSON.stringify(backup)], 'keiro-backup.json', { type: 'application/json' });
    act(() => result.current.handleImportFile({ target: { files: [file], value: 'x' } }));
    await vi.waitFor(() => expect(result.current.backupMsg).toMatch(/Restore complete/));
    for (const [key, value] of Object.entries(lists)) expect(localStorage.getItem(key)).toBe(value);
  });
});
