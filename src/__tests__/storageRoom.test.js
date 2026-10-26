/**
 * storageRoom.test.js
 *
 * localStorage holds ~5 MB and a full one throws on write. These tests pin the
 * guarded write (never fail silently), make-room (only remove what the cloud is
 * known to have), and the callers that now report a failed write.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/db', () => ({
  saveSignatureRow:   vi.fn(async () => ({ error: null })),
  deleteSignatureRow: vi.fn(async () => ({ error: null })),
  saveInvoice:        vi.fn(async () => ({ error: new Error('offline') })),
}));

import {
  writeLocal, makeRoom, markSignatureSynced, estimateUsage, isQuotaError,
  isStorageFull, _resetStorageRoomForTests, checkStorageOnLaunch,
} from '../utils/storageRoom';
import { EVENTS, STORAGE_KEYS } from '../utils/constants';
import { lsSet, saveInvoice } from '../utils/storage';
import { enqueueSync, processSyncQueue, retryFailedSyncs } from '../utils/syncQueue';
import * as db from '../services/db';
import { saveSignatures } from '../utils/signatureStorage';

function quotaError() {
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError');
}

/** A stored signature entry; `synced` stamps it as confirmed in the cloud. */
function sig(n, { at, synced = true, size = 1000 }) {
  const updatedAt = new Date(at).toISOString();
  localStorage.setItem(STORAGE_KEYS.SIG_PREFIX + n, JSON.stringify({
    seller: 'data:image/png;base64,' + 'A'.repeat(size),
    buyer: null,
    updatedAt,
    ...(synced ? { syncedVersion: updatedAt } : {}),
  }));
}

beforeEach(() => {
  localStorage.clear();
  _resetStorageRoomForTests();
});

describe('isQuotaError', () => {
  it('recognises the standard name and the legacy codes', () => {
    expect(isQuotaError(quotaError())).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError({ code: 1014 })).toBe(true);
    expect(isQuotaError(new Error('other'))).toBe(false);
  });
});

describe('writeLocal', () => {
  let setItem;
  beforeEach(() => { setItem = vi.spyOn(Storage.prototype, 'setItem'); });
  afterEach(() => { setItem.mockRestore(); });

  it('writes and returns true', () => {
    expect(writeLocal('inv_x', '"a"')).toBe(true);
    expect(localStorage.getItem('inv_x')).toBe('"a"');
  });

  it('frees room and retries once when the first write hits the quota', () => {
    setItem.mockImplementationOnce(() => { throw quotaError(); });
    const onFull = vi.fn();
    window.addEventListener(EVENTS.STORAGE_FULL, onFull);
    expect(writeLocal('inv_x', '"a"')).toBe(true);
    expect(localStorage.getItem('inv_x')).toBe('"a"');
    expect(onFull).not.toHaveBeenCalled();
    window.removeEventListener(EVENTS.STORAGE_FULL, onFull);
  });

  it('returns false and announces STORAGE_FULL when there is still no room, then STORAGE_OK on the next success', () => {
    const onFull = vi.fn();
    const onOk = vi.fn();
    window.addEventListener(EVENTS.STORAGE_FULL, onFull);
    window.addEventListener(EVENTS.STORAGE_OK, onOk);
    setItem.mockImplementation(() => { throw quotaError(); });

    expect(writeLocal('inv_x', '"a"')).toBe(false);
    expect(isStorageFull()).toBe(true);
    expect(onFull).toHaveBeenCalledTimes(1);

    setItem.mockRestore();
    expect(writeLocal('inv_x', '"b"')).toBe(true);
    expect(isStorageFull()).toBe(false);
    expect(onOk).toHaveBeenCalledTimes(1);

    window.removeEventListener(EVENTS.STORAGE_FULL, onFull);
    window.removeEventListener(EVENTS.STORAGE_OK, onOk);
  });

  it('stays full until the write that failed goes through, not on any unrelated small write', () => {
    setItem.mockRestore();                         // take the real one before re-spying
    const realSetItem = Storage.prototype.setItem;
    setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'inv_payments') throw quotaError();
      return realSetItem.call(this, key, value);
    });
    const onOk = vi.fn();
    window.addEventListener(EVENTS.STORAGE_OK, onOk);

    expect(writeLocal('inv_payments', '[1]')).toBe(false);
    expect(writeLocal('inv_seen_home', '1')).toBe(true);     // e.g. a badge timestamp
    expect(isStorageFull()).toBe(true);
    expect(onOk).not.toHaveBeenCalled();

    setItem.mockRestore();
    expect(writeLocal('inv_payments', '[1]')).toBe(true);
    expect(isStorageFull()).toBe(false);
    expect(onOk).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTS.STORAGE_OK, onOk);
  });

  it('returns false without announcing for a failure that is not about space', () => {
    setItem.mockImplementation(() => { throw new Error('SecurityError'); });
    const onFull = vi.fn();
    window.addEventListener(EVENTS.STORAGE_FULL, onFull);
    expect(writeLocal('inv_x', '"a"')).toBe(false);
    expect(onFull).not.toHaveBeenCalled();
    window.removeEventListener(EVENTS.STORAGE_FULL, onFull);
  });

  it('lsSet and enqueueSync report a write that could not happen', () => {
    setItem.mockImplementation(() => { throw quotaError(); });
    expect(lsSet('inv_x', { a: 1 })).toBe(false);
    expect(enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1001 } } })).toBe(false);
  });
});

describe('makeRoom', () => {
  it('removes signatures the cloud has confirmed, oldest first, and stops once under the target', () => {
    sig(1001, { at: '2026-01-01' });
    sig(1002, { at: '2026-02-01' });
    sig(1003, { at: '2026-03-01' });
    const each = estimateUsage() / 3;
    makeRoom({ target: estimateUsage() - each * 1.5 }); // needs exactly two removed

    expect(localStorage.getItem('inv_sig_1001')).toBeNull();
    expect(localStorage.getItem('inv_sig_1002')).toBeNull();
    expect(localStorage.getItem('inv_sig_1003')).not.toBeNull();
  });

  it('never removes a signature not confirmed in the cloud, waiting to upload, or set aside', () => {
    sig(1001, { at: '2026-01-01', synced: false }); // saved before this change, or upload unconfirmed
    sig(1002, { at: '2026-01-02' });
    sig(1003, { at: '2026-01-03' });
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([
      { id: 'a', type: 'sync_signature', payload: { invoiceNumber: 1002 } },
    ]));
    localStorage.setItem(STORAGE_KEYS.SYNC_FAILED, JSON.stringify([
      { id: 'b', type: 'sync_signature', payload: { invoiceNumber: 1003 } },
    ]));

    expect(makeRoom({ target: 0 })).toBe(0);
    expect(localStorage.getItem('inv_sig_1001')).not.toBeNull();
    expect(localStorage.getItem('inv_sig_1002')).not.toBeNull();
    expect(localStorage.getItem('inv_sig_1003')).not.toBeNull();
  });

  it('keeps the signed-invoice index, invoices and the queue', () => {
    sig(1001, { at: '2026-01-01' });
    localStorage.setItem(STORAGE_KEYS.SIG_INDEX, JSON.stringify([1001]));
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify([{ number: 1001 }]));
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([]));

    makeRoom({ target: 0 });

    expect(localStorage.getItem('inv_sig_1001')).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.SIG_INDEX))).toEqual([1001]);
    expect(localStorage.getItem(STORAGE_KEYS.LIST)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE)).not.toBeNull();
  });

  it('removes nothing for a guest, whose phone is the only copy', () => {
    sig(1001, { at: '2026-01-01' });
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    expect(makeRoom({ target: 0 })).toBe(0);
    expect(localStorage.getItem('inv_sig_1001')).not.toBeNull();
  });
});

describe('upload stamps', () => {
  it('markSignatureSynced stamps only the version that was uploaded', () => {
    sig(1001, { at: '2026-01-01', synced: false });
    const { updatedAt } = JSON.parse(localStorage.getItem('inv_sig_1001'));

    markSignatureSynced(1001, '2025-12-31T00:00:00.000Z'); // an older upload finishing late
    expect(JSON.parse(localStorage.getItem('inv_sig_1001')).syncedVersion).toBeUndefined();

    markSignatureSynced(1001, updatedAt);
    expect(JSON.parse(localStorage.getItem('inv_sig_1001')).syncedVersion).toBe(updatedAt);
  });

  it('saveSignatures stamps the signature once the cloud accepts it', async () => {
    saveSignatures(1001, 'data:image/png;base64,AAA', null);
    await vi.waitFor(() => {
      const entry = JSON.parse(localStorage.getItem('inv_sig_1001'));
      expect(entry.syncedVersion).toBe(entry.updatedAt);
    });
  });

  it('a queued signature replay stamps it once uploaded', async () => {
    sig(1001, { at: '2026-01-01', synced: false });
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([
      { id: 'a', type: 'sync_signature', payload: { invoiceNumber: 1001 }, ts: 1, retries: 0 },
    ]));
    await processSyncQueue();
    const entry = JSON.parse(localStorage.getItem('inv_sig_1001'));
    expect(entry.syncedVersion).toBe(entry.updatedAt);
  });
});

describe('saveInvoice', () => {
  it('reports savedLocally: false when the phone is full and the cloud failed', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw quotaError(); });
    const res = await saveInvoice({ number: 1001, items: [] });
    setItem.mockRestore();
    expect(res.savedLocally).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('reports savedLocally: true normally', async () => {
    const res = await saveInvoice({ number: 1002, items: [] });
    expect(res.savedLocally).toBe(true);
  });
});

describe('checkStorageOnLaunch', () => {
  it('frees room early for a signed-in user past the target', () => {
    sig(1001, { at: '2026-01-01' });
    const budget = estimateUsage() / 0.9;          // 90% full
    expect(checkStorageOnLaunch({ budget })).toBe('ok');
    expect(localStorage.getItem('inv_sig_1001')).toBeNull();
  });

  it('asks a guest near the limit to create an account, and removes nothing', () => {
    sig(1001, { at: '2026-01-01' });
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    const budget = estimateUsage() / 0.85;         // 85% full
    expect(checkStorageOnLaunch({ budget })).toBe('guest-near-full');
    expect(localStorage.getItem('inv_sig_1001')).not.toBeNull();
  });

  it('says ok with room to spare', () => {
    expect(checkStorageOnLaunch()).toBe('ok');
  });
});

describe('sync queue on a full phone', () => {
  /** Only writes that grow a value are refused, as on a phone that is nearly full. */
  function refuseGrowingWrites() {
    const realSetItem = Storage.prototype.setItem;
    return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (String(value).length > (localStorage.getItem(key) || '').length) throw quotaError();
      return realSetItem.call(this, key, value);
    });
  }
  const total = () =>
    JSON.parse(localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE) || '[]').length
    + JSON.parse(localStorage.getItem(STORAGE_KEYS.SYNC_FAILED) || '[]').length;

  it('"Try again" never deletes set-aside changes when the queue cannot be written', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_FAILED, JSON.stringify([
      { id: 'a', type: 'save_invoice', payload: { invoice: { number: 1 } }, retries: 5 },
    ]));
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, '[]');
    const spy = refuseGrowingWrites();
    retryFailedSyncs();
    spy.mockRestore();
    expect(total()).toBe(1);
  });

  it('setting a change aside never drops it when the set-aside list cannot grow', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([
      { id: 'a', type: 'save_invoice', payload: { invoice: { number: 1 } }, ts: 1, retries: 4 },
    ]));
    db.saveInvoice.mockResolvedValueOnce({ error: { code: '23505', message: 'rejected' } });
    const spy = refuseGrowingWrites();
    await processSyncQueue();
    spy.mockRestore();
    expect(total()).toBe(1);
  });
});
