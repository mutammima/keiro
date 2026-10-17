/**
 * Uploads the server refuses for the free plan's limit (KEIRO_FREE_LIMIT) are
 * held on the phone — never retried into the set-aside list, never deleted —
 * and go back to the front of the queue once Pro or next month. An invoice the
 * driver deletes on the phone while it is held is dropped, not re-sent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../services/db', () => ({ saveInvoice: vi.fn() }));

import * as db from '../services/db';
import { enqueueSync, processSyncQueue, getHeldSyncs, getFailedSyncs, getQueueLength, getUnsyncedCount, releaseHeldSyncs } from '../utils/syncQueue';
import SyncAttentionBanner from '../components/ui/SyncAttentionBanner';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { STORAGE_KEYS, EVENTS } from '../utils/constants';
import { localMonth } from '../utils/invoiceUtils';

const LIMIT = { code: 'P0001', message: 'KEIRO_FREE_LIMIT' };
const held = (number, month = localMonth()) => ({ id: `h${number}`, type: 'save_invoice', payload: { invoice: { number } }, ts: 1, retries: 0, heldMonth: month });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(db.saveInvoice).mockReset();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('held uploads', () => {
  it('a free-limit refusal is held without spending a try, and the rest of the queue goes on', async () => {
    db.saveInvoice.mockResolvedValueOnce({ error: LIMIT }).mockResolvedValueOnce({ error: null });
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1021 } } });
    enqueueSync({ type: 'save_invoice', payload: { invoice: { number: 1022 } } });
    await processSyncQueue();
    expect(getHeldSyncs().map(a => a.payload.invoice.number)).toEqual([1021]);
    expect(getHeldSyncs()[0].retries).toBe(0);
    expect(getHeldSyncs()[0].heldMonth).toBe(localMonth());
    expect(getFailedSyncs()).toEqual([]);
    expect(getQueueLength()).toBe(0);
    expect(db.saveInvoice).toHaveBeenCalledTimes(2);
  });

  it('held uploads count as not yet in the cloud (sign-out warns about them)', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    expect(getUnsyncedCount()).toBe(1);
  });

  it('releasing puts them back at the front, with the invoice as the phone has it now', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([{ ...held(1021), payload: { invoice: { number: 1021, paymentStatus: 'unpaid' } } }]));
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([{ id: 'q1', type: 'save_invoice', payload: { invoice: { number: 1030 } }, ts: 2, retries: 0 }]));
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify([{ number: 1021, paymentStatus: 'paid' }]));
    releaseHeldSyncs();
    const q = JSON.parse(localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE));
    expect(q.map(a => a.payload.invoice.number)).toEqual([1021, 1030]);
    expect(q[0].payload.invoice.paymentStatus).toBe('paid');
    expect(getHeldSyncs()).toEqual([]);
  });

  it('a new month releases them before the next round', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021, '2000-01')]));
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify([{ number: 1021 }]));
    db.saveInvoice.mockResolvedValueOnce({ error: null });
    await processSyncQueue();
    expect(getHeldSyncs()).toEqual([]);
    expect(db.saveInvoice).toHaveBeenCalledTimes(1);
  });

  it('a held invoice deleted on this phone is dropped, never re-sent', async () => {
    // Held in a past month, and STORAGE_KEYS.LIST has no 1021: it was deleted while held.
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021, '2000-01')]));
    await processSyncQueue();
    expect(getHeldSyncs()).toEqual([]);
    expect(db.saveInvoice).not.toHaveBeenCalled();
    expect(getQueueLength()).toBe(0);
  });

  it('this month\'s held uploads stay held', async () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    await processSyncQueue();
    expect(getHeldSyncs()).toHaveLength(1);
    expect(db.saveInvoice).not.toHaveBeenCalled();
  });
});

describe('the banner', () => {
  it('says how many invoices wait for Pro, and Upgrade opens the Upgrade sheet', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021), held(1022)]));
    const opened = vi.fn();
    window.addEventListener(EVENTS.OPEN_UPGRADE, opened);
    render(<ThemeProvider><SyncAttentionBanner /></ThemeProvider>);
    expect(screen.getByText('2 invoices wait for Pro to upload')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTS.OPEN_UPGRADE, opened);
  });

  it('only held uploads: no Try again button, only Later and Upgrade', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([held(1021)]));
    render(<ThemeProvider><SyncAttentionBanner /></ThemeProvider>);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Later', 'Upgrade']);
  });
});
