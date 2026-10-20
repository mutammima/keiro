/**
 * signupPlan.test.jsx
 *
 * The sign-up plan screen shows Free, and Pro as "Coming soon": payments are
 * not built yet (owner decision 2026-10-17), so Pro can't be picked. Store
 * owners skip the screen, and nothing writes the old `inv_plan` value any more.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { DARK } from '../theme';

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
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('20 invoices a month')).toBeInTheDocument();
    expect(screen.getByText('$4.99 a month or $49.99 a year')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.queryByText(/Business|\$12/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start free' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
  it('Pro can\'t be picked yet', () => {
    show(vi.fn());
    fireEvent.click(screen.getByText('Pro'));
    expect(screen.getByRole('button', { name: 'Start free' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue to Pro/ })).toBeNull();
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
    expect(await screen.findByText('Your plan')).toBeInTheDocument();
    expect(onAuthed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start free' }));
    expect(onAuthed).toHaveBeenCalledTimes(1);
    expect(onAuthed).toHaveBeenCalledWith(user);
    expect(localStorage.getItem('inv_onboarding_done')).toBe('true');
    expect(localStorage.getItem('inv_plan')).toBeNull();
  });

  it('a store owner skips the plan screen: the profile goes straight into the app', async () => {
    await fillProfileAs('store_owner');
    await waitFor(() => expect(onAuthed).toHaveBeenCalledWith(user));
    expect(onAuthed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Your plan')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start free' })).toBeNull();
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
