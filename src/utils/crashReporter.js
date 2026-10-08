/**
 * crashReporter.js — sends Keiro's crash reports to Sentry (free plan).
 *
 * errorLog.logError() is the single funnel for every render crash
 * (ErrorBoundary) and every uncaught error or unhandled rejection (window
 * listeners); it calls reportCrash(). Sentry's SDK is imported lazily, after
 * first paint, and only when VITE_SENTRY_DSN is set, so a build without one
 * (local dev, tests, CI) never loads it. Crashes before it loads wait in memory
 * and are sent once it is ready.
 *
 * What is sent (PRIVACY.md §2 and §5, Legal.jsx): the error and its stack, the
 * build (__APP_VERSION__), web or iOS app, device/browser type, and the screen
 * it happened on. Never invoice contents, names, emails, phone numbers, the IP
 * address, URL query strings or hashes (invite codes), console or network
 * breadcrumbs, replays or performance traces; scrubEvent() enforces it.
 * Switchable in Settings → Terms & Privacy ("Send crash reports", on by default,
 * a device preference kept across sign-out). At most SESSION_CAP per session.
 */

import { Capacitor } from '@capacitor/core';
import { STORAGE_KEYS } from './constants';
import { lsGet, lsSet } from './storage';

export const SESSION_CAP = 20;

const KEY = STORAGE_KEYS.CRASH_REPORTS;
const ENV_DSN = import.meta.env.VITE_SENTRY_DSN || '';

let configured = Boolean(ENV_DSN);
let sentry = null;
let loading = null;
let sent = 0;
let screen = 'startup';
const waiting = [];

export function crashReportsEnabled() {
  return lsGet(KEY, true) !== false;
}

export function setCrashReportsEnabled(on) {
  lsSet(KEY, Boolean(on));
}

/** The tab or overlay on screen, attached to each report. */
export function setCrashScreen(name) {
  if (name) screen = String(name);
}

/** The URL without its query string or hash (invite codes live there). */
export function scrubUrl(url) {
  if (typeof url !== 'string') return url;
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

// Console lines, network requests and clicked-element text can all carry names.
const DROPPED_BREADCRUMBS = /^(console|fetch|xhr|ui\.)/;

export function scrubBreadcrumb(b) {
  if (!b || DROPPED_BREADCRUMBS.test(b.category || '')) return null;
  if (b.category === 'navigation') {
    return { ...b, data: { from: scrubUrl(b.data?.from), to: scrubUrl(b.data?.to) } };
  }
  return { ...b, data: undefined };
}

export function scrubEvent(event) {
  if (!event) return event;
  const out = { ...event };
  delete out.user;
  delete out.extra;
  if (out.request) out.request = { url: scrubUrl(out.request.url) };
  if (Array.isArray(out.breadcrumbs)) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb).filter(Boolean);
  return out;
}

/**
 * Loads and starts Sentry. Safe to call more than once; a no-op without a DSN.
 * @param {{ dsn?: string, load?: () => Promise<object> }} [opts]  overrides for tests
 * @returns {Promise<object|null>} the Sentry module, or null
 */
export function initCrashReporter({ dsn = ENV_DSN, load = () => import('@sentry/react') } = {}) {
  configured = Boolean(dsn);
  if (!configured) return Promise.resolve(null);
  if (loading) return loading;
  loading = load()
    .then((S) => {
      S.init({
        dsn,
        release: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
        environment: Capacitor.isNativePlatform() ? 'ios-app' : 'web',
        sendDefaultPii: false,
        // errorLog's own window listeners already report uncaught errors;
        // Sentry's would send each one twice.
        integrations: (defaults) => defaults.filter((i) => i.name !== 'GlobalHandlers'),
        beforeSend: (event) => (crashReportsEnabled() ? scrubEvent(event) : null),
        beforeBreadcrumb: scrubBreadcrumb,
      });
      sentry = S;
      waiting.splice(0).forEach(send);
      return S;
    })
    .catch((e) => {
      console.warn('Crash reporting could not start', e);
      return null;
    });
  return loading;
}

/**
 * Sends one crash, or holds it until Sentry has loaded.
 * @returns {boolean} whether it was sent now
 */
export function reportCrash(error, meta = {}) {
  if (!configured || !crashReportsEnabled()) return false;
  const report = { error, meta };
  if (!sentry) {
    if (waiting.length < SESSION_CAP) waiting.push(report);
    return false;
  }
  return send(report);
}

function send({ error, meta }) {
  if (sent >= SESSION_CAP || !crashReportsEnabled()) return false;
  sent += 1;
  const err = error instanceof Error ? error : new Error(String(error?.message || error));
  sentry.captureException(err, { tags: { source: meta.source || 'unknown', screen } });
  return true;
}

/**
 * Settings → Help → "Send test report".
 * @returns {Promise<'sent' | 'no-dsn' | 'off' | 'offline' | 'not-ready'>}
 */
export async function sendTestReport() {
  if (!configured) return 'no-dsn';
  if (!crashReportsEnabled()) return 'off';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const S = sentry || (await (loading || initCrashReporter()));
  if (!S) return 'not-ready';
  S.captureException(new Error('Keiro test report'), { tags: { source: 'test-report', screen } });
  return 'sent';
}

/** Test-only: forget all state, as if the app had just started without a DSN. */
export function _resetCrashReporterForTests() {
  configured = false;
  sentry = null;
  loading = null;
  sent = 0;
  screen = 'startup';
  waiting.length = 0;
}
