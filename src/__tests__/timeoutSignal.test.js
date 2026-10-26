/**
 * timeoutSignal.test.js
 *
 * AbortSignal.timeout does not exist before Safari 16, and the iOS app targets
 * iOS 15. Calling it there throws before the request is sent, so the plan
 * answer (and the barcode and shared-name lookups) never went out. timeoutSignal
 * uses it where it exists and an AbortController on a timer where it does not.
 * No module is mocked here.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { timeoutSignal } from '../utils/timeoutSignal';
import { withoutAbortSignalTimeout } from './helpers/withoutAbortSignalTimeout';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('timeoutSignal', () => {
  it('uses AbortSignal.timeout where the browser has it', () => {
    const native = new AbortController().signal;
    const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(native);
    expect(timeoutSignal(4000)).toBe(native);
    expect(spy).toHaveBeenCalledWith(4000);
  });

  it('without AbortSignal.timeout (Safari before 16) it still hands back an AbortSignal', async () => {
    await withoutAbortSignalTimeout(async () => {
      expect(AbortSignal.timeout).toBeUndefined();
      const signal = timeoutSignal(4000);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
    });
  });

  it('...which aborts after the time given, with a TimeoutError, and not before', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await withoutAbortSignalTimeout(async () => {
      const signal = timeoutSignal(4000);
      const onAbort = vi.fn();
      signal.addEventListener('abort', onAbort);
      vi.advanceTimersByTime(3999);
      expect(signal.aborted).toBe(false);
      expect(onAbort).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(signal.aborted).toBe(true);
      expect(onAbort).toHaveBeenCalledTimes(1);
      expect(signal.reason?.name).toBe('TimeoutError'); // what AbortSignal.timeout aborts with
    });
  });

  it('...and every call has its own clock', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await withoutAbortSignalTimeout(async () => {
      const quick = timeoutSignal(1000);
      const slow = timeoutSignal(8000);
      vi.advanceTimersByTime(1000);
      expect([quick.aborted, slow.aborted]).toEqual([true, false]);
      vi.advanceTimersByTime(7000);
      expect(slow.aborted).toBe(true);
    });
  });
});
