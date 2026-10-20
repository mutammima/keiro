/**
 * The app shell and the plan: free drivers are in Easy Mode, the plan is
 * re-read at launch and on foreground, a mode change reloads, and the
 * one-time notes show once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../services/db', () => ({ getMyPlan: vi.fn() }));

import * as db from '../services/db';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { STORAGE_KEYS, EVENTS, PLAN_COPY } from '../utils/constants';
import { easyModeFor } from '../utils/easyMode';
import PlanRunner from '../components/plan/PlanRunner';
import PlanNotices from '../components/plan/PlanNotices';
import PlanSheet, { PrimaryBtn, TextBtn } from '../components/plan/PlanSheet';
import { useSafeReload } from '../hooks/useSafeReload';
import { givePro } from './helpers/givePro';

const answer = (o = {}) => ({ data: { pro: false, source: null, status: null, pro_until: null, interval: null, cancels: false, used_this_month: 0, month: '2026-10', free_limit: 20, ...o }, error: null });

// A few macrotask turns: getMyPlan is reached only after a lazy import and a couple of awaits, so a test that
// expects it NOT to be called must wait this out first, or it passes whatever the code does.
const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise(r => setTimeout(r, 0)); };
const setVisibility = (value) => Object.defineProperty(document, 'visibilityState', { value, configurable: true });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(db.getMyPlan).mockReset();
});
afterEach(() => setVisibility('visible'));

describe('easyModeFor', () => {
  it('a signed-in free driver is always in Easy Mode', () => {
    expect(easyModeFor('driver')).toBe(true);
  });
  it('a Pro driver follows the switch', () => {
    givePro();
    expect(easyModeFor('driver')).toBe(false);
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    expect(easyModeFor('driver')).toBe(true);
  });
  it('guests keep normal mode; store owners never get Easy Mode', () => {
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    expect(easyModeFor('driver')).toBe(false);
    expect(easyModeFor('store_owner')).toBe(false);
  });
});

describe('PlanRunner', () => {
  it('re-reads the plan at launch and reloads when the mode changes (Pro, switch off)', async () => {
    db.getMyPlan.mockResolvedValue(answer({ pro: true, source: 'manual' }));
    const onModeChange = vi.fn();
    render(<PlanRunner role="driver" easyMode onModeChange={onModeChange} />);
    await waitFor(() => expect(onModeChange).toHaveBeenCalledTimes(1));
  });
  it('does not reload when the mode stays the same', async () => {
    db.getMyPlan.mockResolvedValue(answer());
    const onModeChange = vi.fn();
    render(<PlanRunner role="driver" easyMode onModeChange={onModeChange} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(1));
    expect(onModeChange).not.toHaveBeenCalled();
  });
  it('re-reads on coming back to the foreground', async () => {
    db.getMyPlan.mockResolvedValue(answer());
    render(<PlanRunner role="driver" easyMode onModeChange={vi.fn()} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(2));
  });
  it('a guest never asks', async () => {
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    render(<PlanRunner role="driver" easyMode={false} onModeChange={vi.fn()} />);
    await settle();
    expect(db.getMyPlan).not.toHaveBeenCalled();
  });
  it('a store owner never asks', async () => {
    render(<PlanRunner role="store_owner" easyMode={false} onModeChange={vi.fn()} />);
    await settle();
    expect(db.getMyPlan).not.toHaveBeenCalled();
  });
});

describe('PlanNotices', () => {
  it('shows the "moved to Easy Mode" note once, and OK clears it', () => {
    localStorage.setItem(STORAGE_KEYS.PLAN_NOTICE, JSON.stringify('moved'));
    render(<ThemeProvider><PlanNotices /></ThemeProvider>);
    expect(screen.getByText(PLAN_COPY.movedNote)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByText(PLAN_COPY.movedNote)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PLAN_NOTICE)).toBeNull();
  });
  it('shows the "Pro ended" note', () => {
    localStorage.setItem(STORAGE_KEYS.PLAN_NOTICE, JSON.stringify('ended'));
    render(<ThemeProvider><PlanNotices /></ThemeProvider>);
    expect(screen.getByText(PLAN_COPY.endedNote)).toBeInTheDocument();
  });
});

describe('easyModeFor: edges', () => {
  it('a Pro plan that has run out (past the offline grace) puts the driver back in Easy Mode', () => {
    localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({
      pro: true, source: 'manual', status: 'active', proUntil: '2020-01-01T00:00:00.000Z', fetchedAt: '2020-01-01T00:00:00.000Z',
    }));
    expect(easyModeFor('driver')).toBe(true);
  });
  it('a guest keeps the Easy Mode switch they chose', () => {
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    expect(easyModeFor('driver')).toBe(true);
  });
});

describe('PlanRunner: when it must not reload', () => {
  it('a failed read never reloads, even when the cached plan says the mode should change', async () => {
    givePro();   // the cache says Pro (normal mode) while this shell was built in Easy Mode
    db.getMyPlan.mockResolvedValue({ data: null, error: new Error('no session') });
    const onModeChange = vi.fn();
    render(<PlanRunner role="driver" easyMode onModeChange={onModeChange} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(1));
    await settle();
    expect(onModeChange).not.toHaveBeenCalled();
  });
  it('an answer that lands after the app is gone changes nothing', async () => {
    let answerNow;
    db.getMyPlan.mockReturnValue(new Promise(resolve => { answerNow = resolve; }));
    const onModeChange = vi.fn();
    const { unmount } = render(<PlanRunner role="driver" easyMode onModeChange={onModeChange} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(1));
    unmount();
    const announced = new Promise(resolve => window.addEventListener(EVENTS.PLAN_CHANGE, resolve, { once: true }));
    answerNow(answer({ pro: true, source: 'manual' }));
    await announced;   // the cache now says Pro: a mounted runner would reload here
    await settle();
    expect(onModeChange).not.toHaveBeenCalled();
  });
  it('does not ask while the app is in the background, nor after it is gone', async () => {
    db.getMyPlan.mockResolvedValue(answer());
    const { unmount } = render(<PlanRunner role="driver" easyMode onModeChange={vi.fn()} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(1));
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(db.getMyPlan).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    unmount();
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(db.getMyPlan).toHaveBeenCalledTimes(1);
  });
});

describe('PlanRunner: a driver whose first answer never came', () => {
  // A launch on a weak signal ends with no plan answer: the driver is Free and in Easy Mode until one arrives, and a
  // Pro driver (the owner's dad) must not have to restart the app to get Pro. The signal coming back asks again.
  const goOnline = () => window.dispatchEvent(new Event('online'));
  const NO_ANSWER = { data: null, error: new Error('timed out') };
  const setPlan = (p) => localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify(p));

  it('asks again when the signal returns, and reloads if the answer changes the mode', async () => {
    db.getMyPlan.mockResolvedValueOnce(NO_ANSWER).mockResolvedValue(answer({ pro: true, source: 'manual' }));
    const onModeChange = vi.fn();
    render(<PlanRunner role="driver" easyMode onModeChange={onModeChange} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(1));
    await settle();
    expect(onModeChange).not.toHaveBeenCalled();
    goOnline();
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onModeChange).toHaveBeenCalledTimes(1));
  });
  it('asks at every return of the signal until an answer lands, then no more', async () => {
    db.getMyPlan.mockResolvedValueOnce(NO_ANSWER).mockResolvedValueOnce(NO_ANSWER).mockResolvedValue(answer());
    render(<PlanRunner role="driver" easyMode onModeChange={vi.fn()} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(1));
    await settle();
    goOnline();
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(2));
    await settle();
    goOnline();
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(3));   // this one lands
    await settle();
    goOnline();
    await settle();
    expect(db.getMyPlan).toHaveBeenCalledTimes(3);
  });
  it('does not ask when the signal returns if the phone already has a plan answer', async () => {
    setPlan({ pro: false, source: null, status: null, proUntil: null, usedThisMonth: 0, month: '2026-10', fetchedAt: '2026-10-16T12:00:00.000Z' });
    db.getMyPlan.mockResolvedValue(NO_ANSWER);   // the launch read fails, but the cached answer stands
    render(<PlanRunner role="driver" easyMode onModeChange={vi.fn()} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(1));
    await settle();
    goOnline();
    await settle();
    expect(db.getMyPlan).toHaveBeenCalledTimes(1);
  });
  it('a guest and a store owner do not ask when the signal returns either', async () => {
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    const guest = render(<PlanRunner role="driver" easyMode={false} onModeChange={vi.fn()} />);
    goOnline();
    await settle();
    guest.unmount();
    localStorage.removeItem(STORAGE_KEYS.GUEST_MODE);
    render(<PlanRunner role="store_owner" easyMode={false} onModeChange={vi.fn()} />);
    goOnline();
    await settle();
    expect(db.getMyPlan).not.toHaveBeenCalled();
  });
  it('stops listening once the app is gone', async () => {
    db.getMyPlan.mockResolvedValue(NO_ANSWER);
    const { unmount } = render(<PlanRunner role="driver" easyMode onModeChange={vi.fn()} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(1));
    await settle();
    unmount();
    goOnline();
    await settle();
    expect(db.getMyPlan).toHaveBeenCalledTimes(1);
  });
});

describe('PlanRunner: the mode the shell was built with', () => {
  // AppInner decides `easyMode` once per mount and a running shell changes mode only by reload, so the prop
  // PlanRunner gets should never change. It still captures the mode at mount, so even a changed prop (a future
  // shell that re-decided it) can't make "the mode changed" look like "nothing changed".
  it.each([
    { name: 'Pro starts while the shell is in Easy Mode', built: true, later: false, setup: () => {}, plan: { pro: true, source: 'manual' } },
    { name: 'Pro ends while the shell is in normal mode', built: false, later: true, setup: givePro, plan: {} },
  ])('still reloads when $name, even if the prop changes before the answer lands', async ({ built, later, setup, plan }) => {
    setup();
    let answerNow;
    db.getMyPlan.mockReturnValue(new Promise(resolve => { answerNow = resolve; }));
    const onModeChange = vi.fn();
    const { rerender } = render(<PlanRunner role="driver" easyMode={built} onModeChange={onModeChange} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(1));
    rerender(<PlanRunner role="driver" easyMode={later} onModeChange={onModeChange} />);
    answerNow(answer(plan));
    await waitFor(() => expect(onModeChange).toHaveBeenCalledTimes(1));
    expect(db.getMyPlan).toHaveBeenCalledTimes(1);   // and changing the prop did not ask the server again
  });
  // Loop safety. The reload a mode change asks for rebuilds the shell from the cache that answer wrote, so the
  // fresh shell is built in the NEW mode; the same answer coming again (launch, foreground) must not ask for a
  // second reload, or the app would reload for ever.
  it.each([
    { name: 'Pro starting', builtFirst: true, setup: () => {}, plan: { pro: true, source: 'manual' } },
    { name: 'Pro ending', builtFirst: false, setup: givePro, plan: {} },
  ])('after the reload for $name, a fresh mount on the same cached plan does not ask to reload again', async ({ builtFirst, setup, plan }) => {
    setup();
    db.getMyPlan.mockResolvedValue(answer(plan));
    const firstShell = vi.fn();
    const before = render(<PlanRunner role="driver" easyMode={builtFirst} onModeChange={firstShell} />);
    await waitFor(() => expect(firstShell).toHaveBeenCalledTimes(1));
    before.unmount();                                 // the page reloads

    const rebuilt = easyModeFor('driver');            // the new shell reads the cache the answer wrote
    expect(rebuilt).toBe(!builtFirst);
    const secondShell = vi.fn();
    render(<PlanRunner role="driver" easyMode={rebuilt} onModeChange={secondShell} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(2));
    await settle();
    expect(secondShell).not.toHaveBeenCalled();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));   // and coming back to the foreground does not either
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(3));
    await settle();
    expect(secondShell).not.toHaveBeenCalled();
  });
  it('a re-render with the same props neither asks again nor reloads', async () => {
    db.getMyPlan.mockResolvedValue(answer());
    const onModeChange = vi.fn();
    const { rerender } = render(<PlanRunner role="driver" easyMode onModeChange={onModeChange} />);
    await waitFor(() => expect(db.getMyPlan).toHaveBeenCalledTimes(1));
    rerender(<PlanRunner role="driver" easyMode onModeChange={onModeChange} />);
    await settle();
    expect(db.getMyPlan).toHaveBeenCalledTimes(1);
    expect(onModeChange).not.toHaveBeenCalled();
  });
});

describe('PlanRunner behind useSafeReload (how the shell wires it)', () => {
  // The shell's reload goes through PlanRunner's onModeChange and nowhere else; useSafeReload holds it while
  // an invoice is being made, so a half-scanned invoice is never thrown away by a plan change.
  function Shell({ makingInvoice, reload }) {
    const onModeChange = useSafeReload(makingInvoice, reload);
    return <PlanRunner role="driver" easyMode onModeChange={onModeChange} />;
  }
  const proAnswerCached = () => new Promise(resolve => window.addEventListener(EVENTS.PLAN_CHANGE, resolve, { once: true }));

  it('a mode change that arrives during an invoice reloads only after that screen closes', async () => {
    db.getMyPlan.mockResolvedValue(answer({ pro: true, source: 'manual' }));
    const reload = vi.fn();
    const cached = proAnswerCached();
    const { rerender } = render(<Shell makingInvoice reload={reload} />);
    await cached;
    await settle();   // PlanRunner has seen the new mode and asked for a reload
    expect(reload).not.toHaveBeenCalled();
    rerender(<Shell makingInvoice={false} reload={reload} />);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('and reloads at once when no invoice is being made', async () => {
    db.getMyPlan.mockResolvedValue(answer({ pro: true, source: 'manual' }));
    const reload = vi.fn();
    render(<Shell makingInvoice={false} reload={reload} />);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});

describe('plan sheets take their names from PLAN_COPY', () => {
  // Swap the copy for sentinels: a name typed into a component would not change.
  function withCopy(swapped, check) {
    const saved = Object.fromEntries(Object.keys(swapped).map(k => [k, PLAN_COPY[k]]));
    Object.assign(PLAN_COPY, swapped);
    try { check(); } finally { Object.assign(PLAN_COPY, saved); }
  }
  it('PlanSheet falls back to PLAN_COPY.upgradeTitle', () => {
    withCopy({ upgradeTitle: 'Title!' }, () => {
      render(<ThemeProvider><PlanSheet open><p>x</p></PlanSheet></ThemeProvider>);
      expect(screen.getByRole('dialog', { name: 'Title!' })).toBeInTheDocument();
    });
  });
  it('the one-time note is named PLAN_COPY.planNoticeLabel', () => {
    localStorage.setItem(STORAGE_KEYS.PLAN_NOTICE, JSON.stringify('moved'));
    withCopy({ planNoticeLabel: 'Note!' }, () => {
      render(<ThemeProvider><PlanNotices /></ThemeProvider>);
      expect(screen.getByRole('dialog', { name: 'Note!' })).toBeInTheDocument();
    });
  });
  it('and the names themselves are unchanged', () => {
    expect(PLAN_COPY.upgradeTitle).toBe('Keiro Pro');
    expect(PLAN_COPY.planNoticeLabel).toBe('Your plan');
  });
});

describe('PlanNotices: edges', () => {
  it('shows nothing without a note, or with one it does not know', () => {
    const { unmount } = render(<ThemeProvider><PlanNotices /></ThemeProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    localStorage.setItem(STORAGE_KEYS.PLAN_NOTICE, JSON.stringify('surprise'));
    render(<ThemeProvider><PlanNotices /></ThemeProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('shows a note the plan writes while the app is open, when it announces it', () => {
    render(<ThemeProvider><PlanNotices /></ThemeProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      localStorage.setItem(STORAGE_KEYS.PLAN_NOTICE, JSON.stringify('ended'));
      window.dispatchEvent(new CustomEvent(EVENTS.PLAN_CHANGE));
    });
    expect(screen.getByText(PLAN_COPY.endedNote)).toBeInTheDocument();
  });
  // The note is the only explanation of a change to the driver's app (Easy Mode, or Pro ending), and OK clears it for
  // good. A stray tap beside it, with a thumb or a truck's bump, must not dismiss it unread.
  it.each([
    ['moved', PLAN_COPY.movedNote],
    ['ended', PLAN_COPY.endedNote],
  ])('a tap outside the "%s" note does nothing: only OK clears it', (notice, words) => {
    localStorage.setItem(STORAGE_KEYS.PLAN_NOTICE, JSON.stringify(notice));
    render(<ThemeProvider><PlanNotices /></ThemeProvider>);
    fireEvent.click(screen.getByRole('dialog').parentElement);   // the dimmed backdrop
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(words)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAN_NOTICE))).toBe(notice);   // and it is still to be shown
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PLAN_NOTICE)).toBeNull();
  });
});

describe('PlanSheet', () => {
  it('is a dialog portaled to the page, above the nav, the drawer, the offline banner and the tour', () => {
    const { container } = render(<ThemeProvider><PlanSheet open title="Keiro Pro"><p>hello</p></PlanSheet></ThemeProvider>);
    const dialog = screen.getByRole('dialog', { name: 'Keiro Pro' });
    const backdrop = dialog.parentElement;
    expect(container).not.toContainElement(dialog);   // portaled: no overflow:hidden ancestor can clip it on iOS
    expect(backdrop.parentElement).toBe(document.body);
    // One stacking context holds TopNav (1000), the sliding drawer (1600), the bottom offline banner (8000) and the
    // Quick Start tour (tap-blocking dim panels 9000, ring 9001, tooltip 9002, Skip 9003): a note under any of them
    // can't be tapped. The sign-out prompt (9500) and ConfirmDialog (9600) must still sit above the sheet.
    const z = Number(backdrop.style.zIndex);
    expect(z).toBeGreaterThan(9003);
    expect(z).toBeLessThan(9500);
  });
  it('is named by its label, else its title, else Keiro Pro', () => {
    const { unmount } = render(<ThemeProvider><PlanSheet open label="Your plan" title="Ignored"><p>x</p></PlanSheet></ThemeProvider>);
    expect(screen.getByRole('dialog', { name: 'Your plan' })).toBeInTheDocument();
    unmount();
    render(<ThemeProvider><PlanSheet open><p>x</p></PlanSheet></ThemeProvider>);
    expect(screen.getByRole('dialog', { name: 'Keiro Pro' })).toBeInTheDocument();
  });
  it('closes from the backdrop, not from a tap inside the sheet', () => {
    const onClose = vi.fn();
    render(<ThemeProvider><PlanSheet open onClose={onClose}><p>inside</p></PlanSheet></ThemeProvider>);
    fireEvent.click(screen.getByText('inside'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog').parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('scrolls instead of growing past the screen, and keeps its buttons their size', () => {
    render(<ThemeProvider><PlanSheet open title="Keiro Pro"><p>x</p><PrimaryBtn onClick={vi.fn()}>Go</PrimaryBtn></PlanSheet></ThemeProvider>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.maxHeight).toBe('85vh');
    expect(dialog.style.overflowY).toBe('auto');
    // In a column flex box that scrolls, a fixed-height button would be squashed (50px to 20px, seen in
    // Chromium) before the sheet scrolled, unless it refuses to shrink.
    expect(screen.getByRole('button', { name: 'Go' }).style.flexShrink).toBe('0');
    expect(screen.getByText('Keiro Pro').style.flexShrink).toBe('0');
  });
  it('its buttons meet the 44px minimum tap target', () => {
    render(<ThemeProvider><PlanSheet open><PrimaryBtn onClick={vi.fn()}>Go</PrimaryBtn><TextBtn onClick={vi.fn()}>Not now</TextBtn></PlanSheet></ThemeProvider>);
    const text = screen.getByRole('button', { name: 'Not now' });
    expect(text.style.minHeight).toBe('44px');
    expect(text.style.flexShrink).toBe('0');
    expect(parseInt(screen.getByRole('button', { name: 'Go' }).style.height, 10)).toBeGreaterThanOrEqual(44);
  });
  it('renders nothing while closed', () => {
    render(<ThemeProvider><PlanSheet open={false}><p>inside</p></PlanSheet></ThemeProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('inside')).toBeNull();
  });
});
