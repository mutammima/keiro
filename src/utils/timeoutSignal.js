/**
 * timeoutSignal.js — an AbortSignal that aborts after `ms`.
 *
 * AbortSignal.timeout is missing before Safari 16, and the iOS app targets
 * iOS 15: calling it there throws before the request is sent, so the plan
 * answer, the barcode lookups and the shared product names never went out. Use
 * this wherever a request needs a time limit. It is looked up at call time,
 * not at import.
 */

/** What AbortSignal.timeout aborts with. */
function timeoutReason() {
  try {
    return new DOMException('signal timed out', 'TimeoutError');
  } catch {
    const err = new Error('signal timed out');
    err.name = 'TimeoutError';
    return err;
  }
}

/**
 * @param {number} ms
 * @returns {AbortSignal} aborts after `ms` milliseconds
 */
export function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(timeoutReason()), ms);
  return controller.signal;
}
