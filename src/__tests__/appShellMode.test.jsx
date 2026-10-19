/**
 * appShellMode.test.jsx
 *
 * App-level guard for the shell deciding its mode ONCE per mount. AppInner used to
 * re-read easyModeFor(role) on every render, so once a plan answer rewrote the cache,
 * the next routine re-render (a badge refresh on the 60 s poll, a Realtime event,
 * opening the drawer) swapped <EasyInvoice/> for <NewInvoice/> and emptied a half-made
 * invoice, while the reload that rebuilds the shell was still waiting for the invoice
 * to close (useSafeReload). A real browser shows the same thing; this keeps it from
 * coming back without one.
 *
 * The whole backend is faked: every call answers "no data", which the app already
 * handles by falling back to localStorage. Nothing here needs a Supabase .env.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';

const { fakeClient, fakeModule } = vi.hoisted(() => {
  const NO_DATA = { data: null, error: { message: 'backend is faked in this test' } };
  // Anything chained off the client (from().select().eq(), channel().on().subscribe()) is a thenable that resolves to "no data".
  const chain = () => new Proxy(() => {}, {
    get: (_target, prop) => (prop === 'then' ? (resolve) => resolve(NO_DATA) : chain()),
    apply: () => chain(),
  });
  // A module mock whose every export not listed answers "no data" (vitest throws on an export the factory lacks).
  // `then` and symbols stay undefined: a module that looks thenable would be awaited forever.
  const fakeModule = (known = {}) => new Proxy(known, {
    has: () => true,
    get: (target, prop) => {
      if (prop in target) return target[prop];
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return async () => NO_DATA;
    },
  });
  return { fakeClient: chain(), fakeModule };
});

vi.mock('../services/supabase', () => ({ supabase: fakeClient }));
vi.mock('../services/db', () => fakeModule());
vi.mock('../services/migration', () => fakeModule());
vi.mock('../services/auth', () => fakeModule({
  getSessionState: async () => ({ session: { user: { id: 'driver-1' } }, offline: false }),
  onAuthStateChange: () => () => {},
}));

import App from '../App.jsx';
import { STORAGE_KEYS } from '../utils/constants';
import { givePro } from './helpers/givePro';

// jsdom has no ResizeObserver, which the swipe strip measures with.
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

// A signed-in account that has finished onboarding and both tours, so no tour or What's New sits over the screen.
function signedIn(role = 'driver') {
  const set = (k, v) => localStorage.setItem(k, v);
  set(STORAGE_KEYS.USER_ROLE, JSON.stringify(role));
  set('inv_onboarding_done', 'true');
  set(STORAGE_KEYS.ONBOARDING_DONE, 'true');
  set(STORAGE_KEYS.TOUR_SEEN_FULL, '1');
  set(STORAGE_KEYS.TOUR_SEEN_EASY, '1');
  set(`${STORAGE_KEYS.WHATS_NEW_SEEN_PREFIX}5.9`, '1');
}
const turnFree = () => localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({
  pro: false, source: null, status: null, proUntil: null, usedThisMonth: 0, month: null, fetchedAt: '2026-10-16T12:00:00.000Z',
}));

const found = (container, selector) => waitFor(() => {
  const el = container.querySelector(selector);
  expect(el).not.toBeNull();
  return el;
}, { timeout: 5000 });

// Any routine re-render of AppInner: a badge refresh is what the 60 s poll and Realtime events do (App.jsx).
async function reRender() {
  act(() => { window.dispatchEvent(new Event('inv-badges-refresh')); });
  await act(async () => { await new Promise(r => setTimeout(r, 50)); });
}

beforeEach(() => {
  localStorage.clear();
  signedIn();
});

describe('the shell decides its mode once per mount', () => {
  it('an Easy shell keeps its half-made invoice when a Pro answer lands and the app re-renders', async () => {
    const { container } = render(<App />);                       // no plan answer yet: Free, so an Easy Mode shell
    fireEvent.click(await found(container, '[data-qs="new-invoice"]'));
    const store = await found(container, '[data-qs="easy-store"] input');
    fireEvent.change(store, { target: { value: 'Corner Shop' } });
    expect(store.value).toBe('Corner Shop');

    givePro();                                                   // the Pro answer is cached: easyModeFor() is now false
    await reRender();

    expect(container.querySelector('[data-tutorial="invoice-form"]')).toBeNull();           // the full form never replaced it
    expect(container.querySelector('[data-tutorial="easy-invoice"]')).not.toBeNull();
    expect(container.querySelector('[data-qs="easy-store"] input').value).toBe('Corner Shop');
  });

  it('and a normal-mode shell keeps its full invoice when the plan turns Free', async () => {
    givePro();                                                   // a Pro driver: normal mode
    const { container } = render(<App />);
    fireEvent.click(await found(container, '[data-qs="new-invoice"]'));
    const store = await found(container, 'input[placeholder="Sunrise Deli"]');
    fireEvent.change(store, { target: { value: 'Corner Shop' } });
    expect(store.value).toBe('Corner Shop');

    turnFree();                                                  // Pro ended: easyModeFor() is now true
    await reRender();

    expect(container.querySelector('[data-tutorial="easy-invoice"]')).toBeNull();
    expect(container.querySelector('[data-tutorial="invoice-form"]')).not.toBeNull();
    expect(container.querySelector('input[placeholder="Sunrise Deli"]').value).toBe('Corner Shop');
  });

  it('and its tab bar and ☰ menu keep that mode too', async () => {
    const { container } = render(<App />);                       // an Easy shell
    await found(container, '[data-qs-tab="route"]');
    const tabs = () => [...container.querySelectorAll('[data-qs-tab]')].map(b => b.getAttribute('data-qs-tab'));
    expect(tabs()).toEqual(['route', 'stores', 'reports']);

    givePro();
    await reRender();

    expect(tabs()).toEqual(['route', 'stores', 'reports']);                           // TopNav did not grow a Home tab
    const menu = screen.getByRole('navigation', { name: 'Main' });                    // the ☰ drawer's list
    expect(within(menu).getByText('Products')).toBeInTheDocument();
    expect(within(menu).queryByText('Store Info')).toBeNull();                        // and the drawer kept its short menu
  });

  it('a role switch rebuilds the shell, so a free driver who was a store owner gets Easy Mode', async () => {
    localStorage.clear();
    signedIn('store_owner');                                     // an owner shell is never Easy; the switch must not carry that over
    const { container } = render(<App />);
    await found(container, '[data-qs-tab="so-home"]');
    fireEvent.click(screen.getByRole('button', { name: 'Driver' }));
    await found(container, '[data-qs-tab="route"]');

    const tabs = [...container.querySelectorAll('[data-qs-tab]')].map(b => b.getAttribute('data-qs-tab'));
    expect(tabs).toEqual(['route', 'stores', 'reports']);
  });
});
