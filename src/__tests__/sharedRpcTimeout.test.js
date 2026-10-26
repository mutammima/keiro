/**
 * The shared-name RPCs are a nicety in the middle of scanning and typing: a
 * slow server must not hold the scan, so they carry a 4 s abort signal and
 * a timeout resolves through the usual catch to "no name" / "no suggestions".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withoutAbortSignalTimeout } from './helpers/withoutAbortSignalTimeout';

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

let supabase, db, controller;

/** An rpc builder that never answers on its own but rejects when its signal aborts. */
function hangingRpc() {
  return {
    abortSignal(signal) {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    },
  };
}

beforeEach(async () => {
  vi.resetModules();
  controller = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  ({ supabase } = await import('../services/supabase'));
  supabase.rpc.mockReset();
  db = await import('../services/db');
});
afterEach(() => vi.restoreAllMocks());

describe('shared product name RPC timeout', () => {
  it('getSharedProductName gives up after 4 s and reports no name', async () => {
    supabase.rpc.mockReturnValue(hangingRpc());
    const p = db.getSharedProductName('071924145009');
    await vi.waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    expect(AbortSignal.timeout).toHaveBeenCalledWith(4000);
    controller.abort();
    const { data, error } = await p;
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it('suggestProductNames gives up after 4 s and reports no suggestions', async () => {
    supabase.rpc.mockReturnValue(hangingRpc());
    const p = db.suggestProductNames('mobil');
    await vi.waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    expect(AbortSignal.timeout).toHaveBeenCalledWith(4000);
    controller.abort();
    const { data } = await p;
    expect(data).toEqual([]);
  });
});

describe('on iOS 15 (no AbortSignal.timeout)', () => {
  // Safari before 16 has no AbortSignal.timeout: the call threw before the request, so the shared names never came.
  beforeEach(() => {
    vi.mocked(AbortSignal.timeout).mockRestore(); // the real one, for withoutAbortSignalTimeout to take away
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => vi.useRealTimers());

  it('getSharedProductName still asks, and gives up after 4 s', async () => {
    const rpc = hangingRpc();
    const abortSignal = vi.spyOn(rpc, 'abortSignal');
    supabase.rpc.mockReturnValue(rpc);
    await withoutAbortSignalTimeout(async () => {
      const p = db.getSharedProductName('071924145009');
      await vi.advanceTimersByTimeAsync(0);
      expect(supabase.rpc).toHaveBeenCalledWith('shared_product_name', { p_barcode: '071924145009' });
      expect(abortSignal).toHaveBeenCalledTimes(1);
      const signal = abortSignal.mock.calls[0][0];
      await vi.advanceTimersByTimeAsync(3999);
      expect(signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signal.aborted).toBe(true);
      const { data, error } = await p;
      expect(data).toBeNull();
      expect(error).toBeTruthy();
    });
  });

  it('suggestProductNames still asks, and gives up after 4 s', async () => {
    const rpc = hangingRpc();
    const abortSignal = vi.spyOn(rpc, 'abortSignal');
    supabase.rpc.mockReturnValue(rpc);
    await withoutAbortSignalTimeout(async () => {
      const p = db.suggestProductNames('mobil');
      await vi.advanceTimersByTimeAsync(0);
      expect(supabase.rpc).toHaveBeenCalledWith('suggest_product_names', { p_query: 'mobil' });
      expect(abortSignal).toHaveBeenCalledTimes(1);
      const signal = abortSignal.mock.calls[0][0];
      await vi.advanceTimersByTimeAsync(4000);
      expect(signal.aborted).toBe(true);
      expect((await p).data).toEqual([]);
    });
  });
});
