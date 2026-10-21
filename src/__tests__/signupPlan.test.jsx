/**
 * signupPlan.test.jsx
 *
 * The sign-up plan screen shows Free, and Pro as "Coming soon": payments are
 * not built yet (owner decision 2026-10-17), so Pro can't be picked. Store
 * owners skip the screen, and nothing writes the old `inv_plan` value any more.
 * Every word on the screen is PLAN_COPY's (constants.js).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { DARK, LIGHT, tintOf } from '../theme';
import { PLAN_COPY, PRO_PRICE, STORAGE_KEYS } from '../utils/constants';

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

const show = (onStart, C = DARK) => render(<ThemeProvider><PlanScreen onBack={vi.fn()} onStart={onStart} loading={false} C={C} /></ThemeProvider>);
// The sign-up price keeps non-breaking spaces; the default matcher folds them into plain ones, so text is compared as it is.
const keepSpaces = (text) => text;

describe('sign-up plan screen', () => {
  it('shows Free, and Pro as coming soon; Start free goes ahead', () => {
    const onStart = vi.fn();
    show(onStart);
    expect(screen.getByText(PLAN_COPY.signupTitle)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.signupSubtitle)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.freeLabel)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.proLabel)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.freePrice)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.signupPriceLine, { normalizer: keepSpaces })).toBeInTheDocument();
    for (const bullet of [...PLAN_COPY.freeBullets, ...PLAN_COPY.proBullets]) expect(screen.getByText(bullet)).toBeInTheDocument();
    expect(screen.getByText(PLAN_COPY.comingSoonBadge)).toBeInTheDocument();
    expect(screen.queryByText(/Business|\$12/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: PLAN_COPY.startFree }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
  it('Pro can\'t be picked yet: tapping its card starts nothing, and the card is not a button', () => {
    const onStart = vi.fn();
    show(onStart);
    expect(screen.getByText(PLAN_COPY.proLabel).closest('button')).toBeNull();
    // Tap everything on the Pro card: its name, price, badge and bullets.
    for (const text of [PLAN_COPY.proLabel, PLAN_COPY.signupPriceLine, PLAN_COPY.comingSoonBadge, ...PLAN_COPY.proBullets]) {
      fireEvent.click(screen.getByText(text, { normalizer: keepSpaces }));
    }
    expect(onStart).not.toHaveBeenCalled();
    // The only buttons on the screen are Back and Start free.
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: PLAN_COPY.startFree })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue to Pro/ })).toBeNull();
    // The spy does hear Start free (so "not called" above means something), with no arguments.
    fireEvent.click(screen.getByRole('button', { name: PLAN_COPY.startFree }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith();
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
      freeLabel: 'Gratis!', proLabel: 'Premium!', freePrice: 'Zero!', signupPriceLine: 'Price!',
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

// Colour maths for the contrast checks below (WCAG 2.x relative luminance).
function rgbOf(cssColor) {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cssColor);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const hex = cssColor.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
const luminance = (cssColor) => {
  const [r, g, b] = rgbOf(cssColor).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

describe('tintOf', () => {
  it('turns a hex colour into rgba() at the given strength', () => {
    expect(tintOf('#4A7BF7', 0.06)).toBe('rgba(74, 123, 247, 0.06)');
    expect(tintOf('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(tintOf('  #8b5cf6 ', 0.1)).toBe('rgba(139, 92, 246, 0.1)');
  });
  it('gives no tint (never an invalid colour) for anything else', () => {
    for (const bad of ['var(--accent)', 'red', '#12', '#1234567', '', undefined, null]) expect(tintOf(bad, 0.06), String(bad)).toBe('transparent');
  });
});

describe('the sign-up plan cards', () => {
  beforeEach(() => { localStorage.clear(); });
  const card = (name) => screen.getByRole('group', { name });

  it('each card is named by a heading, and the "coming soon" pill comes after the name', () => {
    show(vi.fn());
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([PLAN_COPY.freeLabel, PLAN_COPY.proLabel]);
    expect(screen.getByRole('heading', { level: 2, name: PLAN_COPY.signupTitle })).toBeInTheDocument();
    const name = screen.getByRole('heading', { level: 3, name: PLAN_COPY.proLabel });
    const pill = screen.getByText(PLAN_COPY.comingSoonBadge);
    expect(card(PLAN_COPY.proLabel)).toContainElement(pill);
    expect(name.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // It still sits in the card's top right corner (its place does not depend on where it is in the DOM).
    expect(pill.style.position).toBe('absolute');
    expect(pill.style.top).toBe('14px');
    expect(pill.style.right).toBe('14px');
  });

  it('the bullet lists keep their list role (list-style: none drops it in WebKit)', () => {
    const { container } = show(vi.fn());
    const lists = [...container.querySelectorAll('ul')];
    expect(lists).toHaveLength(2);
    for (const ul of lists) expect(ul).toHaveAttribute('role', 'list');
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(within(card(PLAN_COPY.freeLabel)).getAllByRole('listitem')).toHaveLength(PLAN_COPY.freeBullets.length);
    expect(within(card(PLAN_COPY.proLabel)).getAllByRole('listitem')).toHaveLength(PLAN_COPY.proBullets.length);
  });

  // `${ACCENT}10` is "var(--accent)10", which no browser reads: the declaration is dropped and the card had no tint.
  it('the Free card is tinted with a colour a browser can read: the accent, as rgba()', () => {
    show(vi.fn());
    const free = card(PLAN_COPY.freeLabel);
    expect(free.style.backgroundColor).toBe('rgba(74, 123, 247, 0.06)');      // the default accent, #4A7BF7
    expect(free.style.background).not.toContain('var(');
    expect(card(PLAN_COPY.proLabel).style.backgroundColor).not.toMatch(/^rgba\(74, 123, 247/);   // Pro is not tinted
  });
  it('...and follows the accent the driver has chosen', () => {
    localStorage.setItem(STORAGE_KEYS.ACCENT_COLOR, '#8B5CF6');
    show(vi.fn());
    expect(card(PLAN_COPY.freeLabel).style.backgroundColor).toBe('rgba(139, 92, 246, 0.06)');
  });
  it('...and falls back to no tint, not an invalid one, if the stored accent is not a colour', () => {
    localStorage.setItem(STORAGE_KEYS.ACCENT_COLOR, 'not-a-colour');
    show(vi.fn());
    expect(card(PLAN_COPY.freeLabel).style.background).not.toContain('var(');
    expect(card(PLAN_COPY.freeLabel).style.backgroundColor).not.toContain('NaN');
  });

  it('the Pro price keeps "$49.99 a year" together and balances its lines', () => {
    show(vi.fn());
    const price = screen.getByText(PLAN_COPY.signupPriceLine, { normalizer: keepSpaces });
    expect(price.textContent).toContain(`${PRO_PRICE.year}\u00a0a\u00a0year`);
    expect(price.textContent).toContain(`${PRO_PRICE.month}\u00a0a\u00a0month`);
    expect(price.style.textWrap).toBe('balance');
  });
  it('the sign-up price line is the Upgrade sheet\'s, with only its spaces made non-breaking', () => {
    expect(PLAN_COPY.signupPriceLine).not.toBe(PLAN_COPY.priceLine);
    expect(PLAN_COPY.signupPriceLine.replace(/\u00a0/g, ' ')).toBe(PLAN_COPY.priceLine);
  });

  describe.each([['light', LIGHT], ['dark', DARK]])('Pro, "not yet", in %s mode', (_, C) => {
    it('is not dimmed: the card has no opacity', () => {
      show(vi.fn(), C);
      for (const name of [PLAN_COPY.freeLabel, PLAN_COPY.proLabel]) {
        expect(['', '1']).toContain(card(name).style.opacity);
      }
    });
    it('its price, bullets and pill read at 4.5:1 or better', () => {
      show(vi.fn(), C);
      const pro = card(PLAN_COPY.proLabel);
      const price = within(pro).getByText(PLAN_COPY.signupPriceLine, { normalizer: keepSpaces });
      expect(contrast(price.style.color, C.card)).toBeGreaterThanOrEqual(4.5);
      for (const bullet of PLAN_COPY.proBullets) {
        expect(contrast(within(pro).getByText(bullet).parentElement.style.color, C.card), bullet).toBeGreaterThanOrEqual(4.5);
      }
      const pill = within(pro).getByText(PLAN_COPY.comingSoonBadge);
      expect(contrast(pill.style.color, pill.style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    });
    it('still reads as not available: no accent border or tint, a muted price, the pill, nothing to press', () => {
      show(vi.fn(), C);
      const pro = card(PLAN_COPY.proLabel);
      const free = card(PLAN_COPY.freeLabel);
      expect(pro.style.border).not.toContain('var(--accent)');
      expect(pro.style.backgroundColor).not.toContain('rgba');
      expect(free.style.border).toContain('var(--accent)');
      const proPrice = within(pro).getByText(PLAN_COPY.signupPriceLine, { normalizer: keepSpaces });
      const freePrice = within(free).getByText(PLAN_COPY.freePrice);
      expect(proPrice.style.color).not.toBe(freePrice.style.color);
      expect(within(pro).getByText(PLAN_COPY.comingSoonBadge)).toBeInTheDocument();
      expect(within(pro).queryByRole('button')).toBeNull();
    });
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

  // profiles.plan is `text not null default 'basic'` (supabase-profiles.sql, supabase-schema.sql) and nothing reads it:
  // the real plan is my_plan(). Sending 'basic' would only restate the default, and look like it meant something.
  it.each(['driver', 'store_owner'])('the profile saved for a %s does not carry the unused plan column', async (role) => {
    saveProfile.mockClear();
    await fillProfileAs(role);
    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const row = saveProfile.mock.calls[0][0];
    expect(row).toMatchObject({ id: 'u1', role });          // it is the profile row
    expect(Object.keys(row)).not.toContain('plan');
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
