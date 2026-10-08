/**
 * errorLog.js — Keiro's crash funnel.
 *
 * Every render-time crash (via ErrorBoundary) and every uncaught exception /
 * unhandled promise rejection (via the window listeners installed in main.jsx)
 * comes through logError(). It is kept on the device here, capped at
 * MAX_ENTRIES, so "the app crashed" can be diagnosed from Settings → Help →
 * "View Error Log", and also sent to Sentry through crashReporter.js when a
 * DSN is configured. Handled, transient failures like failed cloud writes
 * report separately via syncNotify → SyncToast and are deliberately NOT
 * captured here.
 */

import { lsGet, lsSet } from './storage';
import { STORAGE_KEYS } from './constants';
import { reportCrash } from './crashReporter';

const KEY = STORAGE_KEYS.ERROR_LOG;
const MAX_ENTRIES = 25;

/**
 * @param {Error|unknown} error
 * @param {{ source?: string, componentStack?: string }} [meta]
 */
export function logError(error, meta = {}) {
  const entry = {
    message: error?.message || String(error),
    stack: error?.stack || null,
    componentStack: meta.componentStack || null,
    source: meta.source || 'unknown',
    time: new Date().toISOString(),
    url: typeof location !== 'undefined' ? location.href : null,
  };

  // Always console.error too — keeps the existing dev-tools workflow intact.
  console.error(`[errorLog:${entry.source}]`, error);

  try {
    const log = lsGet(KEY, []);
    log.push(entry);
    // while, not if: a restored backup (useBackup.js writes inv_error_log
    // back raw, unvalidated) could already be over the cap, so this must
    // converge in one call rather than trim one entry per future error.
    while (log.length > MAX_ENTRIES) log.shift();
    lsSet(KEY, log);
  } catch {
    // localStorage itself can throw (private mode, quota) — never let the
    // logger become a second crash.
  }

  reportCrash(error, { source: entry.source });
}

// lsGet/lsSet already guard their own throws (see storage.js) — no wrapper needed here.
export const getErrorLog = () => lsGet(KEY, []);
export const clearErrorLog = () => lsSet(KEY, []);

/**
 * Installs window-level listeners so errors *outside* React's render tree
 * (event handlers, timers, rejected promises) also reach the log — an
 * ErrorBoundary alone only catches render-phase errors in its child tree.
 * Call once, at app boot.
 */
export function initGlobalErrorListeners() {
  window.addEventListener('error', (event) => {
    logError(event.error || event.message, { source: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason, { source: 'unhandledrejection' });
  });
}
