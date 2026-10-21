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
 *
 * It also holds the checks that App mounts UpgradeHost (the Upgrade and limit sheets) once,
 * outside the signed-in shell, because this is the file that renders the whole app.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';

const { fakeClient, fakeModule, authControl } = vi.hoisted(() => {
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
  // What the faked auth service answers. A test sets these to reach another screen (Loading, sign-in, password
  // recovery); beforeEach puts them back.
  const authControl = { getSessionState: null, listener: null };
  return { fakeClient: chain(), fakeModule, authControl };
});

vi.mock('../services/supabase', () => ({ supabase: fakeClient }));
vi.mock('../services/db', () => fakeModule());
vi.mock('../services/migration', () => fakeModule());
vi.mock('../services/auth', () => fakeModule({
  getSessionState: () => (authControl.getSessionState || (async () => ({ session: { user: { id: 'driver-1' } }, offline: false })))(),
  onAuthStateChange: (listener) => { authControl.listener = listener; return () => {}; },
}));

import App from '../App.jsx';
import { STORAGE_KEYS, EVENTS, PLAN_COPY } from '../utils/constants';
import { openUpgrade, openFreeLimit } from '../utils/plan';
import { markWhatsNewSeen } from '../utils/whatsNewState';
import { givePro } from './helpers/givePro';
import { utcMonth } from '../utils/invoiceUtils';

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
  markWhatsNewSeen();   // for whichever version this build is, so the modal never sits over the screen
}
const turnFree = () => localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({
  pro: false, source: null, status: null, proUntil: null, usedThisMonth: 0, month: null, fetchedAt: '2026-10-16T12:00:00.000Z',
}));

// The element is on screen, and so are the effects of the commit that drew it. React runs a commit's effects
// a moment AFTER painting it (later still on a busy machine), so a test that acted at once could be talking to
// a shell that had not yet attached its listeners.
const found = async (container, selector) => {
  const el = await waitFor(() => {
    const found = container.querySelector(selector);
    expect(found).not.toBeNull();
    return found;
  }, { timeout: 5000 });
  await act(async () => {});
  return el;
};

// A routine re-render of AppInner that the app really has: a newer build is out (useVersionCheck dispatches
// this from its 30 s poll), which shows the Update banner. Waiting for the banner proves the re-render happened:
// a re-render that was silently lost would let every "nothing changed" assertion after it pass for nothing.
async function reRender() {
  // Both invoice screens are loaded already, so a wrong swap between them would show at once: React keeps
  // hiding the old screen (it stays in the DOM) while a lazy screen it has not loaded yet is on its way in.
  await Promise.all([import('../components/invoice/EasyInvoice'), import('../components/invoice/NewInvoice')]);
  act(() => { window.dispatchEvent(new Event(EVENTS.VERSION_UPDATE)); });
  expect(await screen.findByText('Update available')).toBeInTheDocument();
  await act(async () => { for (let i = 0; i < 5; i += 1) await new Promise(r => setTimeout(r, 0)); });
}

beforeEach(() => {
  localStorage.clear();
  signedIn();
  authControl.getSessionState = null;
  authControl.listener = null;
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
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));              // the driver opens ☰: the shell re-renders
    const menu = screen.getByRole('navigation', { name: 'Main' });                    // the ☰ drawer's list
    expect(menu.closest('[style*="translateX(0"]')).not.toBeNull();                  // and it really opened

    expect(tabs()).toEqual(['route', 'stores', 'reports']);                           // TopNav did not grow a Home tab
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

describe('the app hosts the Upgrade and limit sheets', () => {
  // Every Upgrade button only dispatches an event (plan.js openUpgrade / openFreeLimit); UpgradeHost, mounted once
  // in App() beside the sync banner, opens the sheet. Without that mount every one of those buttons would do nothing.
  it('openUpgrade() and openFreeLimit() each open their sheet over the app', async () => {
    const { container } = render(<App />);
    await found(container, '[data-qs-tab="route"]');
    // Only the sheets this test opens are named: a one-time plan note (PlanNotices) may be a dialog too.
    expect(screen.queryByRole('dialog', { name: PLAN_COPY.normalModeTitle })).toBeNull();
    expect(screen.queryByRole('dialog', { name: PLAN_COPY.limitTitle })).toBeNull();

    act(() => { openUpgrade(PLAN_COPY.normalModeTitle); });
    const upgrade = screen.getByRole('dialog', { name: PLAN_COPY.normalModeTitle });
    expect(within(upgrade).getByText(PLAN_COPY.comingSoon)).toBeInTheDocument();
    fireEvent.click(within(upgrade).getByRole('button', { name: PLAN_COPY.ok }));
    expect(screen.queryByRole('dialog', { name: PLAN_COPY.normalModeTitle })).toBeNull();

    act(() => { openFreeLimit(); });
    expect(screen.getByRole('dialog', { name: PLAN_COPY.limitTitle })).toBeInTheDocument();
  });

  it('with a one-time plan note on screen (its own dialog), the sheets are still found by name', async () => {
    localStorage.setItem(STORAGE_KEYS.PLAN_NOTICE, JSON.stringify('moved'));
    const { container } = render(<App />);
    await found(container, '[data-qs-tab="route"]');
    expect(screen.getByRole('dialog', { name: PLAN_COPY.planNoticeLabel })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: PLAN_COPY.upgradeTitle })).toBeNull();

    act(() => { openUpgrade(); });

    expect(screen.getByRole('dialog', { name: PLAN_COPY.upgradeTitle })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: PLAN_COPY.planNoticeLabel })).toBeInTheDocument();
  });

  it('there is one host: an Upgrade request draws one sheet, not one per mount', async () => {
    const { container } = render(<App />);
    await found(container, '[data-qs-tab="route"]');

    act(() => { openUpgrade(); });

    expect(screen.getAllByRole('dialog', { name: PLAN_COPY.upgradeTitle })).toHaveLength(1);
  });

  it('a role switch rebuilds the shell, but the host stays and still answers', async () => {
    localStorage.clear();
    signedIn('store_owner');
    const { container } = render(<App />);
    await found(container, '[data-qs-tab="so-home"]');
    fireEvent.click(screen.getByRole('button', { name: 'Driver' }));
    await found(container, '[data-qs-tab="route"]');

    act(() => { openUpgrade(); });

    expect(screen.getAllByRole('dialog', { name: PLAN_COPY.upgradeTitle })).toHaveLength(1);
  });

  // The sync banner (an upload held for the free limit) sits above the whole app, so its Upgrade button is on
  // screen before the signed-in shell exists, and while the password-recovery and sign-in screens are up.
  describe('the sync banner\'s Upgrade button', () => {
    const holdAnUpload = () => localStorage.setItem(STORAGE_KEYS.SYNC_HELD, JSON.stringify([
      { id: 'h7', type: 'save_invoice', payload: { invoice: { number: 7 } }, ts: 1, retries: 0, heldUtcMonth: utcMonth() },
    ]));
    const signedOut = async () => ({ session: null, offline: false });

    it.each([
      ['Loading screen', () => { authControl.getSessionState = () => new Promise(() => {}); }, () => screen.findByText('Loading…')],
      ['sign-in screen', () => { authControl.getSessionState = signedOut; }, () => screen.findByText('Sign up with email')],
      ['password-recovery screen', () => { authControl.getSessionState = signedOut; }, async () => {
        await screen.findByText('Sign up with email');
        act(() => { authControl.listener('PASSWORD_RECOVERY', { user: { id: 'driver-1' } }); });
        await screen.findByText('Choose a new password');
      }],
    ])('opens the Upgrade sheet on the %s', async (_screen, setUp, reachScreen) => {
      holdAnUpload();
      setUp();
      render(<App />);
      await reachScreen();
      expect(document.querySelector('[data-qs-tab]')).toBeNull();            // the signed-in shell is not on screen

      fireEvent.click(screen.getByRole('button', { name: PLAN_COPY.upgrade }));

      const sheet = screen.getByRole('dialog', { name: PLAN_COPY.upgradeTitle });
      expect(within(sheet).getByText(PLAN_COPY.comingSoon)).toBeInTheDocument();
      expect(screen.getAllByRole('dialog', { name: PLAN_COPY.upgradeTitle })).toHaveLength(1);
    });
  });
});
