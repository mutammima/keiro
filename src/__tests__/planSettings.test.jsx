import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PlanSetting from '../components/settings/PlanSetting';
import EasyModeSetting from '../components/settings/EasyModeSetting';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { LIGHT } from '../theme';
import { STORAGE_KEYS, EVENTS, PLAN_COPY } from '../utils/constants';
import { givePro } from './helpers/givePro';
import { signOut } from '../services/auth';
import { isEasyMode } from '../utils/easyMode';

// signOut() is the real one; only the Supabase client under it is a stand-in (CI has no .env).
vi.mock('../services/supabase', () => ({
  supabase: { auth: { signOut: vi.fn(async () => ({ error: null })), storageKey: 'sb-test-auth-token' } },
}));

// EasyModeSetting reaches the Supabase client through storage.js -> db.js, which throws without a
// configured URL (CI has no .env). Same stand-in as easyModeMenu.test.jsx: lsSet JSON-encodes into localStorage.
vi.mock('../utils/storage', () => ({
  lsSet: vi.fn((key, value) => { localStorage.setItem(key, JSON.stringify(value)); return true; }),
}));

const setPlan = (p) => localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify(p));
// A fresh answer from the server lands: the cache changes and plan.js announces it.
const planArrives = (p) => act(() => {
  setPlan(p);
  window.dispatchEvent(new CustomEvent(EVENTS.PLAN_CHANGE));
});
const wrap = (el) => render(<ThemeProvider>{el}</ThemeProvider>);
// The Toggle is drawn on by sliding its knob right (it has no other visible state).
const switchIsDrawnOn = () => screen.getByRole('button', { name: PLAN_COPY.easySwitchLabel }).firstChild.style.transform === 'translateX(18px)';
beforeEach(() => { localStorage.clear(); });

describe('Settings → Plan', () => {
  it('Free: the month\'s count and Upgrade', () => {
    const opened = vi.fn();
    window.addEventListener(EVENTS.OPEN_UPGRADE, opened);
    wrap(<PlanSetting role="driver" C={LIGHT} />);
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText(/of 20 invoices used this month · resets/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTS.OPEN_UPGRADE, opened);
  });
  it('the Upgrade button meets the 44px minimum tap target', () => {
    wrap(<PlanSetting role="driver" C={LIGHT} />);
    expect(screen.getByRole('button', { name: 'Upgrade' }).style.minHeight).toBe('44px');
  });
  it('the owner\'s switch with an end date: Pro until that day, no button', () => {
    // Noon on Dec 1 of the phone's own calendar (a UTC literal would read Dec 2 east of UTC+12).
    setPlan({ pro: true, source: 'manual', proUntil: new Date(2099, 11, 1, 12).toISOString() });
    wrap(<PlanSetting role="driver" C={LIGHT} />);
    expect(screen.getByText('Pro until Dec 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });
  it('the owner\'s switch: Pro (free), no button', () => {
    setPlan({ pro: true, source: 'manual', proUntil: null });
    wrap(<PlanSetting role="driver" C={LIGHT} />);
    expect(screen.getByText('Pro (free)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });
  it('store owners and guests have no Plan row', () => {
    wrap(<PlanSetting role="store_owner" C={LIGHT} />);
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    wrap(<PlanSetting role="driver" C={LIGHT} />);
    expect(screen.queryByText('Free')).toBeNull();
  });
  it('Upgrade opens the plain Upgrade sheet: no title, and never the click event', () => {
    const opened = vi.fn();
    window.addEventListener(EVENTS.OPEN_UPGRADE, opened);
    wrap(<PlanSetting role="driver" C={LIGHT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(opened.mock.calls[0][0].detail.title).toBeUndefined();
    window.removeEventListener(EVENTS.OPEN_UPGRADE, opened);
  });
  it('follows the plan when the server\'s answer lands while Settings is open', () => {
    wrap(<PlanSetting role="driver" C={LIGHT} />);
    expect(screen.getByText('Free')).toBeInTheDocument();
    planArrives({ pro: true, source: 'manual', proUntil: null });
    expect(screen.getByText('Pro (free)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });
});

describe('the Easy Mode switch on Free', () => {
  it('is locked on: tapping it opens the Upgrade sheet titled "Normal mode is part of Pro"', () => {
    const opened = vi.fn();
    window.addEventListener(EVENTS.OPEN_UPGRADE, opened);
    const onChange = vi.fn();
    wrap(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={onChange} />);
    expect(screen.getByLabelText(PLAN_COPY.proLockLabel)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: PLAN_COPY.easySwitchLabel }));
    expect(opened.mock.calls[0][0].detail.title).toBe(PLAN_COPY.normalModeTitle);
    expect(onChange).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBeNull();
    window.removeEventListener(EVENTS.OPEN_UPGRADE, opened);
  });
  it('is drawn on even before the flag is stored: a free driver is in Easy Mode whatever it says', () => {
    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBeNull();
    wrap(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={vi.fn()} />);
    expect(switchIsDrawnOn()).toBe(true);
  });
  it('the lock lifts when a Pro answer lands while Settings is open', () => {
    wrap(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={vi.fn()} />);
    expect(screen.getByLabelText(PLAN_COPY.proLockLabel)).toBeInTheDocument();
    planArrives({ pro: true, source: 'manual', proUntil: null });
    expect(screen.queryByLabelText(PLAN_COPY.proLockLabel)).toBeNull();
    expect(switchIsDrawnOn()).toBe(false); // Pro with the flag off: the switch shows what it says
  });
});

describe('the Easy Mode switch where the plan does not lock it', () => {
  it('Pro: no lock, and the switch works as today', () => {
    givePro();
    const opened = vi.fn();
    window.addEventListener(EVENTS.OPEN_UPGRADE, opened);
    const onChange = vi.fn();
    wrap(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={onChange} />);
    expect(screen.queryByLabelText(PLAN_COPY.proLockLabel)).toBeNull();
    expect(switchIsDrawnOn()).toBe(false); // shows the stored flag, which is not set
    fireEvent.click(screen.getByRole('button', { name: PLAN_COPY.easySwitchLabel }));
    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBe('true');
    expect(onChange).toHaveBeenCalledWith(true);
    expect(opened).not.toHaveBeenCalled();
    window.removeEventListener(EVENTS.OPEN_UPGRADE, opened);
  });
  // The plan moved him into Easy Mode (EASY_BY_PLAN) and he later went Pro. Using the switch is his own
  // choice from then on, so sign-out must not undo it.
  it('using the switch makes the mode his choice: the plan\'s marker goes, and signing out keeps the mode', async () => {
    givePro();
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    localStorage.setItem(STORAGE_KEYS.EASY_BY_PLAN, 'true');
    const settings = () => wrap(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={vi.fn()} />);
    const first = settings();
    fireEvent.click(screen.getByRole('button', { name: PLAN_COPY.easySwitchLabel }));   // off
    expect(localStorage.getItem(STORAGE_KEYS.EASY_BY_PLAN)).toBeNull();
    first.unmount();
    settings();   // the real switch reloads the app; this is the next visit to Settings
    fireEvent.click(screen.getByRole('button', { name: PLAN_COPY.easySwitchLabel }));   // and on again
    expect(localStorage.getItem(STORAGE_KEYS.EASY_BY_PLAN)).toBeNull();
    expect(isEasyMode()).toBe(true);

    await signOut();

    expect(isEasyMode()).toBe(true);
  });
  it('...and a tap the free lock refuses is no choice: the marker stays', () => {
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    localStorage.setItem(STORAGE_KEYS.EASY_BY_PLAN, 'true');
    wrap(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: PLAN_COPY.easySwitchLabel }));
    expect(localStorage.getItem(STORAGE_KEYS.EASY_BY_PLAN)).toBe('true');
  });
  it('a guest keeps the switch: only signed-in free drivers are locked', () => {
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    const opened = vi.fn();
    window.addEventListener(EVENTS.OPEN_UPGRADE, opened);
    const onChange = vi.fn();
    wrap(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={onChange} />);
    expect(screen.queryByLabelText(PLAN_COPY.proLockLabel)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: PLAN_COPY.easySwitchLabel }));
    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBe('true');
    expect(onChange).toHaveBeenCalledWith(true);
    expect(opened).not.toHaveBeenCalled();
    window.removeEventListener(EVENTS.OPEN_UPGRADE, opened);
  });
});

describe('the Settings rows take their words from PLAN_COPY', () => {
  // Swap the copy for sentinels: a name typed into a component would not change.
  function withCopy(swapped, check) {
    const saved = Object.fromEntries(Object.keys(swapped).map(k => [k, PLAN_COPY[k]]));
    Object.assign(PLAN_COPY, swapped);
    try { check(); } finally { Object.assign(PLAN_COPY, saved); }
  }

  it('the lock beside the Easy Mode switch, and the switch itself, are named from PLAN_COPY', () => {
    withCopy({ proLockLabel: 'Lock!', easySwitchLabel: 'Switch!' }, () => {
      wrap(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={vi.fn()} />);
      expect(screen.getByLabelText('Lock!')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Switch!' })).toBeInTheDocument();
    });
  });

  it('the Plan section is titled from PLAN_COPY', () => {
    withCopy({ planSectionTitle: 'Section!' }, () => {
      wrap(<PlanSetting role="driver" C={LIGHT} />);
      expect(screen.getByText('Section!')).toBeInTheDocument();
    });
  });

  it('and the real words are unchanged', () => {
    expect(PLAN_COPY.proLockLabel).toBe('Part of Pro');
    expect(PLAN_COPY.easySwitchLabel).toBe('Easy Mode switch');
    expect(PLAN_COPY.planSectionTitle).toBe('Plan');
  });
});
