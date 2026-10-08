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
const loadSentry = () => import('@sentry/react');

// Sentry integrations Keiro does not run: GlobalHandlers and BrowserApiErrors
// would catch crashes before errorLog does (sent twice, or without the screen
// and outside the cap); BrowserSession sends a "session" with the IP at every
// launch; CultureContext adds the locale and timezone, which the privacy text
// does not list.
const DROPPED_INTEGRATIONS = new Set(['GlobalHandlers', 'BrowserApiErrors', 'BrowserSession', 'CultureContext']);

let activeDsn = ENV_DSN;
let activeLoad = loadSentry;
let activeExtra = {};
let configured = Boolean(ENV_DSN);
let sentry = null;
let loading = null;
let generation = 0;   // bumped when reporting is switched off, so a load in flight is dropped
let sent = 0;
let screen = 'startup';
const waiting = [];

export function crashReportsEnabled() {
  return lsGet(KEY, true) !== false;
}

/** The Settings switch. Off closes Sentry; on starts it (when a DSN exists). */
export function setCrashReportsEnabled(on) {
  lsSet(KEY, Boolean(on));
  if (on) {
    initCrashReporter();
  } else {
    shutDown();
  }
}

function shutDown() {
  generation += 1;
  const S = sentry;
  sentry = null;
  loading = null;
  waiting.length = 0;
  try { Promise.resolve(S?.close?.()).catch(() => {}); } catch { /* closing is best-effort */ }
}

/** The tab or overlay on screen, attached to each report. */
export function setCrashScreen(name) {
  if (!name) return;
  screen = String(name);
  sentry?.setTag?.('screen', screen);
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
 * Loads and starts Sentry. Safe to call more than once; a no-op without a DSN
 * or while the user has switched crash reports off (nothing is contacted then).
 * @param {{ dsn?: string, load?: () => Promise<object>, extraOptions?: object }} [opts]
 *   overrides for tests (extraOptions is merged into Sentry.init, e.g. a transport)
 * @returns {Promise<object|null>} the Sentry module, or null
 */
export function initCrashReporter({ dsn = activeDsn, load = activeLoad, extraOptions = activeExtra } = {}) {
  activeDsn = dsn;
  activeLoad = load;
  activeExtra = extraOptions;
  configured = Boolean(dsn);
  if (!configured || !crashReportsEnabled()) return Promise.resolve(null);
  if (loading) return loading;
  const attempt = generation;
  loading = load()
    .then((S) => {
      if (attempt !== generation || !crashReportsEnabled()) return null; // switched off meanwhile
      S.init({
        dsn,
        release: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
        environment: Capacitor.isNativePlatform() ? 'ios-app' : 'web',
        // Sentry 11's data-collection switches: no IP address (events say
        // infer_ip "never"), cookies, headers or URL query strings.
        dataCollection: { userInfo: false, cookies: false, httpHeaders: false, urlQueryParams: false },
        sendClientReports: false,
        integrations: (defaults) => defaults.filter((i) => !DROPPED_INTEGRATIONS.has(i.name)),
        beforeSend: (event) => (crashReportsEnabled() ? scrubEvent(event) : null),
        beforeBreadcrumb: scrubBreadcrumb,
        ...extraOptions,
      });
      S.setTag?.('screen', screen);
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
  generation += 1;
  activeDsn = '';
  activeLoad = loadSentry;
  activeExtra = {};
  configured = false;
  sentry = null;
  loading = null;
  sent = 0;
  screen = 'startup';
  waiting.length = 0;
}
