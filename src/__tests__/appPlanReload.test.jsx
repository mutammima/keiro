/**
 * appPlanReload.test.jsx
 *
 * App-level guard for WHEN the reload a plan change asks for may happen. A plan
 * answer that flips the mode (Pro started or ended) reloads the app (PlanRunner),
 * never under a half-made invoice (useSafeReload). "Under an invoice" has to
 * cover the screen Make invoice opens next, the share / print screen
 * ('invoice-view'): the hold used to end the moment Make invoice was tapped, so
 * the reload landed on the driver while he was sharing the invoice, and could cut
 * off a connected order's fire-and-forget "delivered" update.
 *
 * Same fake backend as appShellMode.test.jsx (every call answers "no data"; no
 * Supabase .env needed), with two changes: the plan call is controllable, and the
 * two invoice screens are stand-ins, because the shell's page is what is under
 * test, not how an invoice gets made. location.reload is replaced (jsdom can't
 * stub it any other way), so the reload can be counted.
 *
 * The "Update available" banner uses the same hold: its "finish your invoice first" wording
 * has to cover the share / print screen too, not only the form.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const { fakeClient, fakeModule, getMyPlan } = vi.hoisted(() => {
  const NO_DATA = { data: null, error: { message: 'backend is faked in this test' } };
  const chain = () => new Proxy(() => {}, {
    get: (_target, prop) => (prop === 'then' ? (resolve) => resolve(NO_DATA) : chain()),
    apply: () => chain(),
  });
  const fakeModule = (known = {}) => new Proxy(known, {
    has: () => true,
    get: (target, prop) => {
      if (prop in target) return target[prop];
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return async () => NO_DATA;
    },
  });
  return { fakeClient: chain(), fakeModule, getMyPlan: vi.fn() };
});

vi.mock('../services/supabase', () => ({ supabase: fakeClient }));
vi.mock('../services/db', () => fakeModule({ getMyPlan }));
vi.mock('../services/migration', () => fakeModule());
vi.mock('../services/auth', () => fakeModule({
  getSessionState: async () => ({ session: { user: { id: 'driver-1' } }, offline: false }),
  onAuthStateChange: () => () => {},
}));

// The two screens of the flow, reduced to the calls the shell cares about.
vi.mock('../components/invoice/EasyInvoice', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ onGenerated }) => createElement('button', { type: 'button', onClick: () => onGenerated({ number: 1001, items: [] }) }, 'Make invoice (stand-in)'),
  };
});
vi.mock('../components/invoice/InvoiceView', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ onBack, onNewInvoice }) => createElement('div', null,
      createElement('span', null, 'Share or print (stand-in)'),
      createElement('button', { type: 'button', onClick: onBack }, 'Back (stand-in)'),
      createElement('button', { type: 'button', onClick: onNewInvoice }, 'New invoice (stand-in)')),
  };
});

import App from '../App.jsx';
import { STORAGE_KEYS, EVENTS } from '../utils/constants';

// jsdom has no ResizeObserver, which the swipe strip measures with.
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

function signedIn() {
  const set = (k, v) => localStorage.setItem(k, v);
  set(STORAGE_KEYS.USER_ROLE, JSON.stringify('driver'));
  set('inv_onboarding_done', 'true');
  set(STORAGE_KEYS.ONBOARDING_DONE, 'true');
  set(STORAGE_KEYS.TOUR_SEEN_FULL, '1');
  set(STORAGE_KEYS.TOUR_SEEN_EASY, '1');
  set(`${STORAGE_KEYS.WHATS_NEW_SEEN_PREFIX}5.9`, '1');
}

const found = (container, selector) => waitFor(() => {
  const el = container.querySelector(selector);
  expect(el).not.toBeNull();
  return el;
}, { timeout: 5000 });
const settle = async () => { await act(async () => { for (let i = 0; i < 8; i += 1) await new Promise(r => setTimeout(r, 0)); }); };

const PRO_ANSWER = { data: { pro: true, source: 'manual', status: 'active', pro_until: null, interval: null, cancels: false, used_this_month: 0, month: '2026-10', free_limit: 20 }, error: null };

let reload;
/** A shell built in Easy Mode (no plan answer yet), whose plan answer arrives later and says Pro. */
async function easyShellWithAPlanAnswerComing() {
  let answerNow;
  getMyPlan.mockReturnValue(new Promise(resolve => { answerNow = resolve; }));
  const view = render(<App />);
  await found(view.container, '[data-qs="new-invoice"]');
  const cached = new Promise(resolve => window.addEventListener(EVENTS.PLAN_CHANGE, resolve, { once: true }));
  return {
    ...view,
    startInvoice: () => fireEvent.click(view.container.querySelector('[data-qs="new-invoice"]')),
    // Pro is cached and PlanRunner asks for the reload (a mode change); await it, then let the asking finish.
    proAnswerArrives: async () => { answerNow(PRO_ANSWER); await cached; await settle(); },
  };
}

beforeEach(() => {
  localStorage.clear();
  signedIn();
  getMyPlan.mockReset();
  reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
});
afterEach(() => vi.unstubAllGlobals());

describe('the reload a plan change asks for waits through the whole invoice flow', () => {
  it('on a screen with no invoice open, it reloads at once', async () => {
    const shell = await easyShellWithAPlanAnswerComing();
    await shell.proAnswerArrives();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('while the invoice is being made it waits; Make invoice opens the share screen, where it still waits; leaving that screen reloads', async () => {
    const shell = await easyShellWithAPlanAnswerComing();
    shell.startInvoice();
    const make = await screen.findByRole('button', { name: 'Make invoice (stand-in)' });       // on the invoice form
    await shell.proAnswerArrives();
    expect(reload).not.toHaveBeenCalled();                                                     // held: a half-made invoice

    fireEvent.click(make);                                                                     // Make invoice: the share / print screen
    expect(await screen.findByText('Share or print (stand-in)')).toBeInTheDocument();
    await settle();
    expect(reload).not.toHaveBeenCalled();                                                     // still held: he is sharing it

    fireEvent.click(screen.getByRole('button', { name: 'Back (stand-in)' }));                 // leaves the share screen
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('...whichever way he leaves the share screen (New invoice, too), and it reloads once', async () => {
    const shell = await easyShellWithAPlanAnswerComing();
    shell.startInvoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Make invoice (stand-in)' }));
    await screen.findByText('Share or print (stand-in)');
    await shell.proAnswerArrives();                                                            // the answer lands ON the share screen
    expect(reload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'New invoice (stand-in)' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('the "Update available" banner uses the same hold', () => {
  const FINISH_FIRST = /Finish your invoice first/;
  const IDLE_TEXT = /Reload to get the latest features and fixes/;
  const updateReady = () => act(() => { window.dispatchEvent(new Event(EVENTS.VERSION_UPDATE)); });

  it('on a screen with no invoice open it just offers the update', async () => {
    await easyShellWithAPlanAnswerComing();
    updateReady();
    expect(await screen.findByText(IDLE_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(FINISH_FIRST)).toBeNull();
  });

  it('on the invoice form it says to finish the invoice first', async () => {
    const shell = await easyShellWithAPlanAnswerComing();
    shell.startInvoice();
    await screen.findByRole('button', { name: 'Make invoice (stand-in)' });
    updateReady();
    expect(await screen.findByText(FINISH_FIRST)).toBeInTheDocument();
  });

  it('and so it does on the share / print screen, where a reload would cut the share short', async () => {
    const shell = await easyShellWithAPlanAnswerComing();
    shell.startInvoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Make invoice (stand-in)' }));
    await screen.findByText('Share or print (stand-in)');
    updateReady();
    expect(await screen.findByText(FINISH_FIRST)).toBeInTheDocument();
    expect(screen.queryByText(IDLE_TEXT)).toBeNull();
  });
});
