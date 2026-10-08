/**
 * crashReporter.test.js
 *
 * Crash reports go to Sentry: scrubbed, capped, switchable, and costing nothing
 * in a build without a DSN.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/db', () => ({}));
vi.mock('../services/supabase', () => ({ supabase: { auth: {} } }));
// @capacitor/core is NOT mocked: under jsdom it already reports a web platform,
// and auth.js (imported below) needs its real registerPlugin.

import {
  initCrashReporter, reportCrash, sendTestReport, scrubEvent, setCrashScreen,
  crashReportsEnabled, setCrashReportsEnabled, SESSION_CAP, _resetCrashReporterForTests,
} from '../utils/crashReporter';
import { STORAGE_KEYS } from '../utils/constants';

const DSN = 'https://key@o0.ingest.sentry.io/1';

function fakeSentry() {
  return { init: vi.fn(), captureException: vi.fn() };
}

beforeEach(() => {
  localStorage.clear();
  _resetCrashReporterForTests();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('crash reporter', () => {
  it('without a DSN never loads Sentry and sends nothing', async () => {
    const load = vi.fn();
    expect(await initCrashReporter({ dsn: '', load })).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(reportCrash(new Error('x'))).toBe(false);
    expect(await sendTestReport()).toBe('no-dsn');
  });

  it("starts Sentry without personal data or its own global handlers, and sends crashes with the screen", async () => {
    const S = fakeSentry();
    await initCrashReporter({ dsn: DSN, load: async () => S });
    const opts = S.init.mock.calls[0][0];
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.integrations([{ name: 'GlobalHandlers' }, { name: 'Breadcrumbs' }]).map(i => i.name)).toEqual(['Breadcrumbs']);

    setCrashScreen('route');
    expect(reportCrash(new Error('boom'), { source: 'ErrorBoundary' })).toBe(true);
    expect(S.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { source: 'ErrorBoundary', screen: 'route' } });
  });

  it('sends crashes from before Sentry loaded once it is ready, and only once', async () => {
    const S = fakeSentry();
    let resolve;
    const ready = initCrashReporter({ dsn: DSN, load: () => new Promise((r) => { resolve = r; }) });
    reportCrash(new Error('early'));
    resolve(S);
    await ready;
    expect(S.captureException).toHaveBeenCalledTimes(1);
    reportCrash(new Error('later'));
    expect(S.captureException).toHaveBeenCalledTimes(2);
  });

  it('stops at the session cap', async () => {
    const S = fakeSentry();
    await initCrashReporter({ dsn: DSN, load: async () => S });
    for (let i = 0; i < SESSION_CAP + 5; i++) reportCrash(new Error('loop'));
    expect(S.captureException).toHaveBeenCalledTimes(SESSION_CAP);
  });

  it('is on by default; switched off it sends nothing and Sentry drops the rest', async () => {
    expect(crashReportsEnabled()).toBe(true);
    const S = fakeSentry();
    await initCrashReporter({ dsn: DSN, load: async () => S });
    setCrashReportsEnabled(false);
    expect(crashReportsEnabled()).toBe(false);
    expect(reportCrash(new Error('x'))).toBe(false);
    expect(S.captureException).not.toHaveBeenCalled();
    expect(S.init.mock.calls[0][0].beforeSend({ message: 'm' })).toBeNull();
    expect(await sendTestReport()).toBe('off');
  });

  it('scrubs the user, extras, query strings, hashes and chatty breadcrumbs', () => {
    const out = scrubEvent({
      message: 'boom',
      user: { email: 'a@b.c' },
      extra: { invoice: { storeName: 'Corner Store' } },
      request: { url: 'https://keiro.app/?invite=ABC123#x', headers: { a: 1 }, query_string: 'invite=ABC123' },
      breadcrumbs: [
        { category: 'console', message: 'Corner Store' },
        { category: 'ui.click', message: 'button Corner Store' },
        { category: 'fetch', data: { url: '/rest/v1/invoices?store=Corner' } },
        { category: 'navigation', data: { from: '/?invite=X', to: '/#y' } },
        { category: 'sentry.event', data: { a: 1 } },
      ],
    });
    expect(out.user).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.request).toEqual({ url: 'https://keiro.app/' });
    expect(out.breadcrumbs).toEqual([
      { category: 'navigation', data: { from: '/', to: '/' } },
      { category: 'sentry.event', data: undefined },
    ]);
  });

  it('the test report says why it was not sent, and is tagged as a test', async () => {
    const S = fakeSentry();
    await initCrashReporter({ dsn: DSN, load: async () => S });
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await sendTestReport()).toBe('offline');
    online.mockRestore();
    expect(await sendTestReport()).toBe('sent');
    expect(S.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ source: 'test-report' }) }),
    );
  });

  it('every crash the phone records is also reported', async () => {
    const S = fakeSentry();
    await initCrashReporter({ dsn: DSN, load: async () => S });
    const { logError } = await import('../utils/errorLog');
    logError(new Error('render crash'), { source: 'ErrorBoundary' });
    expect(S.captureException).toHaveBeenCalledTimes(1);
  });

  it('signing out keeps the crash-report choice (a device preference)', async () => {
    const { DEVICE_PREF_KEYS } = await import('../services/auth');
    expect(DEVICE_PREF_KEYS.has(STORAGE_KEYS.CRASH_REPORTS)).toBe(true);
  });
});
