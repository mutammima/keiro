/**
 * serverUnreachable.test.jsx
 *
 * Keiro's free Supabase project pauses after a week without use, and its host
 * then doesn't resolve. Probed against a dead host (Oct 2026), the app showed:
 *   • a returning driver: "Loading…" for 30-60s, then the welcome screen as if
 *     signed out — their invoices on the phone unreachable;
 *   • email sign-in: the raw "Failed to fetch";
 *   • "Continue with Google": the browser's "site can't be reached" page.
 *
 * supabase-js keeps a stored session when a refresh fails for lack of an
 * answer (only a server REJECTION removes it), so a signed-in device can open
 * on its local data and pick the session back up when the server returns.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const STORAGE_KEY = 'sb-test-auth-token';

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      storageKey: 'sb-test-auth-token',
      getSession: vi.fn(),
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
  },
}));

import { supabase } from '../services/supabase';
import {
  getSessionState, isServerUnreachableError, signInWithGoogle, SERVER_UNREACHABLE_MESSAGE,
} from '../services/auth';

const retryable = () => Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 });
const storeSession = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1 }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe('getSessionState', () => {
  it('returns the session when the server answers', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } }, error: null });

    expect(await getSessionState()).toEqual({ session: { user: { id: 'u' } }, offline: false });
  });

  it('lets a signed-in device in, offline, when the refresh could not reach the server', async () => {
    storeSession();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: retryable() });

    expect(await getSessionState()).toEqual({ session: null, offline: true });
  });

  it('stops waiting after the timeout instead of showing "Loading…" for a minute', async () => {
    storeSession();
    supabase.auth.getSession.mockReturnValue(new Promise(() => {})); // supabase-js retrying

    expect(await getSessionState({ timeoutMs: 20 })).toEqual({ session: null, offline: true });
  });

  it('is signed out, not offline, on a device with no stored session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: retryable() });

    expect(await getSessionState()).toEqual({ session: null, offline: false });
  });

  it('is signed out when the server rejected the session', async () => {
    storeSession();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: Object.assign(new Error('Invalid Refresh Token'), { name: 'AuthApiError', status: 400 }) });

    expect(await getSessionState()).toEqual({ session: null, offline: false });
  });
});

describe('isServerUnreachableError', () => {
  it.each([
    ['Chrome', new TypeError('Failed to fetch')],
    ['Safari', new TypeError('Load failed')],
    ['Firefox', new TypeError('NetworkError when attempting to fetch resource.')],
    ['supabase-js', retryable()],
  ])('recognises %s\'s network failure', (_, err) => {
    expect(isServerUnreachableError(err)).toBe(true);
  });

  it('does not mistake a real answer for an outage', () => {
    expect(isServerUnreachableError(new Error('Invalid login credentials'))).toBe(false);
    expect(isServerUnreachableError(null)).toBe(false);
  });
});

describe('signInWithGoogle', () => {
  it('stays in the app with a clear message when the server is down, instead of opening a dead page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    const { error } = await signInWithGoogle();

    expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(error.message).toBe(SERVER_UNREACHABLE_MESSAGE);
  });

  it('goes to Google as before when the server answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));

    await signInWithGoogle();

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalled();
  });
});

describe('AuthGate while the server is unreachable', () => {
  it('opens a signed-in device on its local data, says why, and clears the notice when the server is back', async () => {
    vi.resetModules();
    let authListener;
    vi.doMock('../services/auth', () => ({
      getSessionState: vi.fn(async () => ({ session: null, offline: true })),
      onAuthStateChange: vi.fn(cb => { authListener = cb; return () => {}; }),
      updatePassword: vi.fn(),
    }));
    vi.doMock('../services/migration', () => ({ runMigrationIfNeeded: vi.fn(async () => ({ ran: false })) }));
    vi.doMock('../components/auth/OnboardingFlow', () => ({ default: () => <div>WELCOME SCREEN</div> }));
    localStorage.setItem('inv_user_role', JSON.stringify('driver'));
    const { default: AuthGate } = await import('../components/auth/AuthGate');

    render(<AuthGate><div>THE APP</div></AuthGate>);

    expect(await screen.findByText('THE APP')).toBeInTheDocument();
    expect(screen.getByText(/Can't reach Keiro's server right now/)).toBeInTheDocument();
    expect(screen.queryByText('WELCOME SCREEN')).not.toBeInTheDocument();

    await act(async () => authListener('TOKEN_REFRESHED', { user: { id: 'u' } }));

    expect(screen.getByText('THE APP')).toBeInTheDocument();
    expect(screen.queryByText(/Can't reach Keiro's server right now/)).not.toBeInTheDocument();
  });
});
