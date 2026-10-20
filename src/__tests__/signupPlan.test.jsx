/**
 * signupPlan.test.jsx
 *
 * The sign-up plan screen shows Free, and Pro as "Coming soon": payments are
 * not built yet (owner decision 2026-10-17), so Pro can't be picked. Store
 * owners skip the screen, and nothing writes the old `inv_plan` value any more.
 * Every word on the screen is PLAN_COPY's (constants.js).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { DARK } from '../theme';
import { PLAN_COPY } from '../utils/constants';

// The real auth module imports the real Supabase client, which throws at
// import without a URL — CI has no .env. The client isn't used here.
vi.mock('../services/supabase', () => ({ supabase: { auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })) } } }));

// The flow reads and saves the profile through these; each test says what they answer.
vi.mock('../services/auth', async (importActual) => ({
  ...(await importActual()),
  fetchProfile: vi.fn(),
  saveProfile: vi.fn(),
}));

import { fetchProfile, saveProfile } from '../services/auth';
import OnboardingFlow, { PlanScreen } from '../components/auth/OnboardingFlow';

const show = (onStart) => render(<ThemeProvider><PlanScreen onBack={vi.fn()} onStart={onStart} loading={false} C={DARK} /></ThemeProvider>);

describe('sign-up plan screen', () => {
  it('shows Free, and Pro as coming soon; Start free goes ahead', () => {
    const onStart = vi.fn();
    show(onStart);
    expect(screen.getByText(PLAN_COPY.signupTitle)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.signupSubtitle)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.freeLabel)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.proLabel)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.freePrice)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.priceLine)).toBeInTheDocument();
    for (const bullet of [...PLAN_COPY.freeBullets, ...PLAN_COPY.proBullets]) expect(screen.getByText(bullet)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.comingSoonBadge)).toBeInTheDocument();
    expect(screen.queryByText(/Business|\$12/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: PLAN_COPY.startFree }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
  it('Pro can\'t be picked yet', () => {
    show(vi.fn());
    fireEvent.click(screen.getByText(PLAN_COPY.proLabel));
    expect(screen.getByRole('button', { name: PLAN_COPY.startFree })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue to Pro/ })).toBeNull();
  });
});

describe('the sign-up plan screen takes every word from PLAN_COPY', () => {
  // Swap the copy for sentinels: a word typed into the component would not change.
  function withCopy(swapped, check) {
    const saved = Object.fromEntries(Object.keys(swapped).map(k => [k, PLAN_COPY[k]]));
    Object.assign(PLAN_COPY, swapped);
    try { check(); } finally { Object.assign(PLAN_COPY, saved); }
  }

  it('the heading, the line under it, both cards, the badge and the button', () => {
    withCopy({
      signupTitle: 'Title!', signupSubtitle: 'Subtitle!',
      freeLabel: 'Gratis!', proLabel: 'Premium!', freePrice: 'Zero!', priceLine: 'Price!',
      freeBullets: ['Free one!', 'Free two!'], proBullets: ['Pro one!', 'Pro two!'],
      comingSoonBadge: 'Badge!', startFree: 'Go free!',
    }, () => {
      show(vi.fn());
      for (const text of ['Title!', 'Subtitle!', 'Gratis!', 'Premium!', 'Zero!', 'Price!', 'Free one!', 'Free two!', 'Pro one!', 'Pro two!', 'Badge!']) {
        expect(screen.getByText(text)).toBeInTheDocument();
      }
      expect(screen.getByRole('button', { name: 'Go free!' })).toBeInTheDocument();
    });
  });

  it('and the real words are unchanged', () => {
    expect(PLAN_COPY.signupTitle).toBe('Your plan');
    expect(PLAN_COPY.signupSubtitle).toBe('Start free. Pro is coming soon.');
    expect(PLAN_COPY.freeLabel).toBe('Free');
    expect(PLAN_COPY.proLabel).toBe('Pro');
    expect(PLAN_COPY.freePrice).toBe('$0');
    expect(PLAN_COPY.priceLine).toBe('$4.99 a month or $49.99 a year');
    expect(PLAN_COPY.freeBullets).toEqual(['Easy Mode: scan items, print or share invoices', '20 invoices a month', 'Store balances and reports']);
    expect(PLAN_COPY.proBullets).toEqual(['Unlimited invoices', 'Normal mode and the full invoice form', 'Sign invoices on the phone']);
    expect(PLAN_COPY.comingSoonBadge).toBe('Coming soon');
    expect(PLAN_COPY.startFree).toBe('Start free');
  });
});

describe('the sign-up flow around the plan screen', () => {
  const user = { id: 'u1', email: 'alex@example.com', user_metadata: { full_name: 'Alex Rivera' } };
  let onAuthed;

  beforeEach(() => {
    localStorage.clear();
    onAuthed = vi.fn();
    fetchProfile.mockResolvedValue({ profile: null, error: null }); // a new account: no profile yet
    saveProfile.mockResolvedValue({ profile: null, error: null });
  });

  const openFlow = () => render(<ThemeProvider><OnboardingFlow session={{ user }} onAuthed={onAuthed} onGuest={vi.fn()} /></ThemeProvider>);

  // A new account lands on "About you" with its name filled in; pick the role and continue.
  async function fillProfileAs(role) {
    openFlow();
    await screen.findByText('About you');
    fireEvent.click(screen.getByText(role === 'store_owner' ? 'Store Owner' : 'Driver'));
    if (role === 'store_owner') fireEvent.change(screen.getByPlaceholderText('Your store name'), { target: { value: 'Corner Shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  }

  it('a driver gets the plan screen after the profile, and Start free enters the app', async () => {
    await fillProfileAs('driver');
    expect(await screen.findByText(PLAN_COPY.signupTitle)).toBeInTheDocument();
    expect(onAuthed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: PLAN_COPY.startFree }));
    expect(onAuthed).toHaveBeenCalledTimes(1);
    expect(onAuthed).toHaveBeenCalledWith(user);
    expect(localStorage.getItem('inv_onboarding_done')).toBe('true');
    expect(localStorage.getItem('inv_plan')).toBeNull();
  });

  it('a store owner skips the plan screen: the profile goes straight into the app', async () => {
    await fillProfileAs('store_owner');
    await waitFor(() => expect(onAuthed).toHaveBeenCalledWith(user));
    expect(onAuthed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(PLAN_COPY.signupTitle)).toBeNull();
    expect(screen.queryByRole('button', { name: PLAN_COPY.startFree })).toBeNull();
    expect(localStorage.getItem('inv_onboarding_done')).toBe('true');
    expect(localStorage.getItem('inv_plan')).toBeNull();
  });

  it('an account that already has a profile goes straight in, and the old inv_plan is not written', async () => {
    fetchProfile.mockResolvedValue({ profile: { id: 'u1', role: 'driver', plan: 'basic', business_name: 'Corner Shop' }, error: null });
    openFlow();
    await waitFor(() => expect(onAuthed).toHaveBeenCalledWith(user));
    expect(localStorage.getItem('inv_onboarding_done')).toBe('true');
    expect(localStorage.getItem('inv_plan')).toBeNull();
  });
});
