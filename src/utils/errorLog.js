/**
 * errorLog.js — lightweight, local-only error monitoring.
 *
 * There is no remote crash reporter (Sentry or similar) wired up — that needs
 * an account/DSN the project owner hasn't provided yet (see CLAUDE.md "Pending
 * — real-world launch blockers"). Until then, this module is the on-device
 * substitute: every render-time crash (via ErrorBoundary) and every uncaught
 * exception / unhandled promise rejection (via the window listeners installed
 * in main.jsx) gets appended here, capped at MAX_ENTRIES, so a user report
 * like "the app crashed" can actually be diagnosed from Settings → Help →
 * "View Error Log" instead of only ever reaching a console nobody's attached
 * to on-device.
 *
 * Swap-in path for a real reporter later: call `reportToRemote(entry)` from
 * `logError()` below once a DSN exists — every *crash / uncaught* error funnels
 * through this one function. (Handled, transient failures like failed cloud
 * writes report separately via syncNotify → SyncToast and are deliberately NOT
 * captured here; bridge notifySyncError → logError if you ever want unified
 * telemetry.)
 */

import { lsGet, lsSet } from './storage';
import { STORAGE_KEYS } from './constants';

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

  // reportToRemote(entry); // ← enable once a Sentry DSN (or equivalent) exists
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
