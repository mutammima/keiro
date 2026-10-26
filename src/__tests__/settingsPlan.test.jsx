/**
 * settingsPlan.test.jsx — the Settings PAGE carries the Plan section for a signed-in driver (and not for anyone
 * else). planSettings.test.jsx renders PlanSetting alone, so deleting it from pages/Settings.jsx used to stay green.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// CI has no .env: the real client throws on import. Settings only asks it for the session.
vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
      storageKey: 'sb-test-auth-token',
    },
  },
}));

import Settings from '../pages/Settings';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { STORAGE_KEYS, PLAN_COPY } from '../utils/constants';
import { givePro } from './helpers/givePro';

const openSettings = () => render(
  <ThemeProvider>
    <Settings onOpenDrawer={() => {}} onNav={() => {}} onClose={() => {}} onSwitchRole={() => {}} onReplayTutorial={() => {}} />
  </ThemeProvider>,
);
const asRole = (role) => localStorage.setItem(STORAGE_KEYS.USER_ROLE, JSON.stringify(role));
// The section's header button: its title, then the fold arrow.
const planSection = () => screen.queryByRole('button', { name: new RegExp(`^${PLAN_COPY.planSectionTitle}\\b`) });

beforeEach(() => { localStorage.clear(); });

describe('the Settings page: Plan', () => {
  it('a free signed-in driver sees the Plan section: Free, the month\'s count, Upgrade', () => {
    asRole('driver');
    openSettings();
    expect(planSection()).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.freeLabel)).toBeInTheDocument();
    expect(screen.getByText(/of 20 invoices used this month · resets/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: PLAN_COPY.upgrade })).toBeInTheDocument();
  });

  it('a Pro driver sees it too, with no Upgrade', () => {
    asRole('driver');
    givePro();
    openSettings();
    expect(planSection()).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.proFreeLabel)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: PLAN_COPY.upgrade })).toBeNull();
  });

  it('the Plan section comes before the Easy Mode switch it explains', () => {
    asRole('driver');
    openSettings();
    const easy = screen.getByRole('button', { name: PLAN_COPY.easySwitchLabel });
    expect(planSection().compareDocumentPosition(easy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a store owner has neither the Plan section nor the Easy Mode switch', () => {
    asRole('store_owner');
    openSettings();
    expect(planSection()).toBeNull();
    expect(screen.queryByRole('button', { name: PLAN_COPY.easySwitchLabel })).toBeNull();
  });

  it('a guest has no Plan section (guests have their own cap, not the plan\'s)', () => {
    asRole('driver');
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    openSettings();
    expect(planSection()).toBeNull();
  });
});
