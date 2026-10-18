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
import PlanSheet from '../components/plan/PlanSheet';
import { givePro } from './helpers/givePro';

const answer = (o = {}) => ({ data: { pro: false, source: null, status: null, pro_until: null, interval: null, cancels: false, used_this_month: 0, month: '2026-10', free_limit: 20, ...o }, error: null });

const settle = () => new Promise(r => setTimeout(r, 0));   // one macrotask: every pending promise step has run
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
  it('guests and store owners never ask', () => {
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    render(<PlanRunner role="driver" easyMode={false} onModeChange={vi.fn()} />);
    localStorage.removeItem(STORAGE_KEYS.GUEST_MODE);
    render(<PlanRunner role="store_owner" easyMode={false} onModeChange={vi.fn()} />);
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
  it('a tap outside the note clears it for good, like OK', () => {
    localStorage.setItem(STORAGE_KEYS.PLAN_NOTICE, JSON.stringify('moved'));
    render(<ThemeProvider><PlanNotices /></ThemeProvider>);
    fireEvent.click(screen.getByRole('dialog').parentElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PLAN_NOTICE)).toBeNull();
  });
});

describe('PlanSheet', () => {
  it('is a dialog portaled to the page, above the nav, the drawer and the offline banner', () => {
    const { container } = render(<ThemeProvider><PlanSheet open title="Keiro Pro"><p>hello</p></PlanSheet></ThemeProvider>);
    const dialog = screen.getByRole('dialog', { name: 'Keiro Pro' });
    const backdrop = dialog.parentElement;
    expect(container).not.toContainElement(dialog);   // portaled: no overflow:hidden ancestor can clip it on iOS
    expect(backdrop.parentElement).toBe(document.body);
    // TopNav 1000, the drawer 1600 and the bottom offline banner 8000 all sit in the same stacking context.
    expect(Number(backdrop.style.zIndex)).toBeGreaterThan(8000);
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
  it('renders nothing while closed', () => {
    render(<ThemeProvider><PlanSheet open={false}><p>inside</p></PlanSheet></ThemeProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('inside')).toBeNull();
  });
});
