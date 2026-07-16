/**
 * quickStartTutorial.test.jsx
 *
 * Covers the single 7-step QuickStart onboarding tour
 * (src/components/tutorial/QuickStart.jsx) — the entire onboarding system
 * after the multi-layer tips/checklist/demo runner was deleted (see CLAUDE.md
 * "Onboarding / Tutorial System"). A regression here is invisible until a
 * brand-new user hits it, so this locks down: step count/order, tap-required
 * vs. Next-button advancement, the navTo side effect, Skip, and the finale
 * calling onComplete.
 *
 * Tap-required steps advance via Spotlight's document-level capture click
 * listener matching the step's CSS selector (see Spotlight.jsx) — so the test
 * renders plain buttons carrying the same data-* attributes the real nav/UI
 * elements carry, and clicks those.
 *
 * Environment: jsdom.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import QuickStart from '../components/tutorial/QuickStart.jsx';

// Fake app chrome: only the tap-required steps' targets need to actually
// exist in the DOM (Next-button steps advance regardless of whether their
// selector resolves — see useElementRect's "missing after ~1.5s" fallback,
// not exercised here).
function FakeAppChrome() {
  return (
    <div>
      <button data-qs-tab="route">Route</button>
      <button data-qs="new-invoice">+ New</button>
      <button data-tutorial="invoice-generate">Generate</button>
      <button data-qs-tab="stores">Stores</button>
      <button data-qs-tab="reports">Reports</button>
      <button data-qs-tab="so-orders">Orders</button>
      <button data-qs="new-request">+ New Request</button>
      <button data-qs-tab="so-invoices">Invoices</button>
      <button data-qs-tab="so-drivers">Drivers</button>
      <button data-qs-tab="so-home">Home</button>
    </div>
  );
}

function renderQuickStart(role = 'driver') {
  const onNav = vi.fn();
  const onComplete = vi.fn();
  const onSkip = vi.fn();
  render(
    <ThemeProvider>
      <FakeAppChrome />
      <QuickStart role={role} onNav={onNav} onComplete={onComplete} onSkip={onSkip} />
    </ThemeProvider>
  );
  return { onNav, onComplete, onSkip };
}

function clickNext() {
  fireEvent.click(screen.getByText('Next'));
}

describe('QuickStart — driver tour (7 steps)', () => {
  it('walks all 7 steps in order, mixing tap-required and Next-button advancement, then completes', () => {
    const { onNav, onComplete } = renderQuickStart('driver');

    // Step 1/7 — tap-required (Route tab)
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
    expect(screen.getByText('This is where you work')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Route' }));

    // Step 2/7 — tap-required (+ New)
    expect(screen.getByText('Step 2 of 7')).toBeInTheDocument();
    expect(screen.getByText('Create your first invoice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));

    // Step 3/7 — Next-button (product name autofill tip)
    expect(screen.getByText('Step 3 of 7')).toBeInTheDocument();
    expect(screen.getByText('Add items fast')).toBeInTheDocument();
    clickNext();

    // Step 4/7 — Next-button, carries navTo: 'route'
    expect(screen.getByText('Step 4 of 7')).toBeInTheDocument();
    expect(screen.getByText('Share it however works')).toBeInTheDocument();
    clickNext();
    expect(onNav).toHaveBeenCalledWith('route');

    // Step 5/7 — Next-button (invoice history tip)
    expect(screen.getByText('Step 5 of 7')).toBeInTheDocument();
    clickNext();

    // Step 6/7 — tap-required (Stores tab)
    expect(screen.getByText('Step 6 of 7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stores' }));

    // Step 7/7 — tap-required (Reports tab)
    expect(screen.getByText('Step 7 of 7')).toBeInTheDocument();
    expect(screen.getByText('Track your revenue')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));

    // Finale — success screen with confetti + Done button.
    expect(screen.getByText(/You.re ready!/)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('Skip is available on step 1 and calls onSkip immediately without advancing', () => {
    const { onSkip } = renderQuickStart('driver');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('a tap on an unrelated element does not advance the step', () => {
    renderQuickStart('driver');
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
    // Wrong target for step 1 (Route) — tapping it must not advance.
    fireEvent.click(screen.getByRole('button', { name: 'Stores' }));
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
  });
});

describe('QuickStart — store owner tour (7 steps)', () => {
  it('starts on the Orders step and uses the store-owner success copy', () => {
    renderQuickStart('store_owner');
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
    expect(screen.getByText('This is where you order')).toBeInTheDocument();
  });

  it('walks to the finale via its own step selectors', () => {
    const { onComplete } = renderQuickStart('store_owner');

    fireEvent.click(screen.getByRole('button', { name: 'Orders' }));       // 1 tap
    fireEvent.click(screen.getByRole('button', { name: '+ New Request' })); // 2 tap
    clickNext();                                                            // 3 next (assign driver)
    clickNext();                                                            // 4 next (track orders)
    fireEvent.click(screen.getByRole('button', { name: 'Invoices' }));      // 5 tap
    fireEvent.click(screen.getByRole('button', { name: 'Drivers' }));       // 6 tap
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));          // 7 tap

    expect(screen.getByText(/You.re ready!/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
