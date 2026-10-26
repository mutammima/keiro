/**
 * Runs `fn` as on Safari before 16 (the iOS app targets iOS 15), where
 * AbortSignal.timeout does not exist: calling it there throws "undefined is not
 * a function" before the request goes out. The real one is put back afterwards,
 * whatever `fn` does.
 */
export async function withoutAbortSignalTimeout(fn) {
  const saved = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
  delete AbortSignal.timeout;
  try {
    if (typeof AbortSignal.timeout === 'function') throw new Error('the test could not take AbortSignal.timeout away');
    return await fn();
  } finally {
    if (saved) Object.defineProperty(AbortSignal, 'timeout', saved);
  }
}
