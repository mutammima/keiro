/**
 * calmTour.test.jsx — the slower Easy tour (docs/specs/2026-10-26-easy-mode-feel.md §2).
 *
 * Every tour waits for the screen before a step shows; the Easy tour's card has Back,
 * Next on every step (pressing the highlighted button for the user on a "tap" step),
 * Skip inside it, and docks away from what it points at.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import QuickStart from '../components/tutorial/QuickStart.jsx';

function renderTour({ mode = 'easy', role = 'driver', onNew = vi.fn(), chrome } = {}) {
  const onNav = vi.fn();
  const onSkip = vi.fn();
  render(
    <ThemeProvider>
      {chrome ?? (
        <div>
          <button data-qs-tab="route">Route</button>
          <button data-qs="new-invoice" onClick={onNew}>+ New</button>
          <button data-qs-tab="stores">Stores</button>
          <button data-qs-tab="reports">Reports</button>
          <div data-qs="easy-store" /><div data-qs="easy-scan" /><div data-qs="easy-make" /><div data-tip="route-history" />
        </div>
      )}
      <QuickStart role={role} mode={mode} onNav={onNav} onComplete={vi.fn()} onSkip={onSkip} />
    </ThemeProvider>
  );
  return { onNav, onSkip, onNew };
}

const card = () => document.querySelector('[data-tutorial-ui="tooltip"]');
const wait = (ms) => act(() => { vi.advanceTimersByTime(ms); });
// By text: until a step is ready its card is hidden, and a hidden button has no accessible name.
const next = () => fireEvent.click(screen.getByText('Next'));
const back = () => fireEvent.click(screen.getByText('Back'));

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('every tour waits for the screen', () => {
  it('the card stays hidden until its target has held still, then fades in', () => {
    renderTour();
    expect(card().style.visibility).toBe('hidden');
    wait(400);
    expect(card().style.visibility).toBe('hidden');             // still: but too soon after the step began
    wait(400);
    expect(card().style.visibility).toBe('visible');
    expect(card().style.animation).toMatch(/tut-card-up/);
  });

  it('a target that keeps moving shows by 2.5 s anyway', () => {
    let y = 0;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => {
      y += 1;
      return { top: y, left: 0, width: 50, height: 20, bottom: y + 20, right: 50, x: 0, y };
    });
    renderTour();
    wait(1500);
    expect(card().style.visibility).toBe('hidden');
    wait(1200);
    expect(card().style.visibility).toBe('visible');
    spy.mockRestore();
  });

  it('a target that never appears still gets its card, so the tour cannot hang', () => {
    renderTour({ chrome: <div /> });
    expect(card().style.visibility).toBe('hidden');
    wait(1700);
    expect(card().style.visibility).toBe('visible');
  });

  it('the full tour waits too', () => {
    renderTour({ mode: 'full' });
    expect(card().style.visibility).toBe('hidden');
    wait(800);
    expect(card().style.visibility).toBe('visible');
  });
});

describe('the Easy tour card', () => {
  it('has Skip tour inside it, and no Back on the first step', () => {
    const { onSkip } = renderTour();
    wait(800);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('Next on a "tap" step presses the button for you', () => {
    const { onNew } = renderTour();
    wait(800);
    next();
    expect(onNew).toHaveBeenCalledTimes(1);                      // + New really ran (it opens the invoice screen)
    expect(screen.getByText('Step 2 of 7')).toBeInTheDocument();
  });

  it('Back returns to the step before, and to its screen', () => {
    const { onNav } = renderTour();
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));     // step 1 → 2 (opens the invoice)
    next();                                                             // 2 → 3, same screen
    back();
    expect(screen.getByText('Step 2 of 7')).toBeInTheDocument();
    expect(onNav).not.toHaveBeenCalled();                               // 3 and 2 are both on the invoice screen
    back();
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
    expect(onNav).toHaveBeenLastCalledWith('route');                    // 1 is on Route: the invoice screen closes

    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    next(); next(); next();                                             // to step 5, on Route
    expect(screen.getByText('Step 5 of 7')).toBeInTheDocument();
    back();
    expect(screen.getByText('Step 4 of 7')).toBeInTheDocument();
    expect(onNav).toHaveBeenLastCalledWith('invoice');                  // 4 is on the invoice screen: it opens again
  });

  it('each step waits again after Back or Next', () => {
    renderTour();
    wait(800);
    expect(card().style.visibility).toBe('visible');
    next();
    expect(card().style.visibility).toBe('hidden');
    wait(800);
    expect(card().style.visibility).toBe('visible');
  });

  it('docks at the bottom, or at the top when what it points at is in the lower half', () => {
    const tabsAtBottom = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const low = this.matches?.('[data-qs-tab]');
      const top = low ? window.innerHeight - 60 : 100;
      return { top, left: 0, width: 80, height: 50, bottom: top + 50, right: 80, x: 0, y: top };
    });
    renderTour();
    wait(800);
    expect(card().style.bottom).not.toBe('');                    // + New is up top: the card sits low
    expect(card().style.top).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    next(); next(); next(); next();                               // to step 6, the Stores tab at the bottom
    expect(screen.getByText('Step 6 of 7')).toBeInTheDocument();
    wait(800);
    expect(card().style.top).not.toBe('');
    expect(card().style.bottom).toBe('');
    tabsAtBottom.mockRestore();
  });

  it('the full tour keeps its small card: no Back, Skip up top', () => {
    renderTour({ mode: 'full' });
    fireEvent.click(screen.getByRole('button', { name: 'Route' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    wait(800);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip tour' })).toBeNull();
  });
});
