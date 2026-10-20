/**
 * tourModes.test.jsx
 *
 * One driver tour per mode. The Easy tour teaches the scan-first invoice;
 * switching modes plays that mode's tour once (per device), and anyone who
 * already finished the original one-time tour has seen the full one. Store
 * owners always get their own tour.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import QuickStart from '../components/tutorial/QuickStart.jsx';
import { isTourSeen, markTourSeen, pendingModeTour, tourStartPage } from '../utils/tutorialProgress';
import { STORAGE_KEYS } from '../utils/constants';
import { givePro } from './helpers/givePro';

function FakeAppChrome() {
  return (
    <div>
      <button data-qs="new-invoice">+ New</button>
      <button data-qs-tab="stores">Stores</button>
      <button data-qs-tab="reports">Reports</button>
      <button data-qs-tab="so-orders">Orders</button>
    </div>
  );
}

function renderTour(role, mode) {
  const onNav = vi.fn();
  const onComplete = vi.fn();
  render(
    <ThemeProvider>
      <FakeAppChrome />
      <QuickStart role={role} mode={mode} onNav={onNav} onComplete={onComplete} onSkip={vi.fn()} />
    </ThemeProvider>
  );
  return { onNav, onComplete };
}

// The Easy tour start to finish: + New, four Next steps, then the Stores and Reports tabs.
function walkEasyTour() {
  fireEvent.click(screen.getByRole('button', { name: '+ New' }));
  fireEvent.click(screen.getByText('Next'));
  fireEvent.click(screen.getByText('Next'));
  fireEvent.click(screen.getByText('Next'));
  fireEvent.click(screen.getByText('Next'));
  fireEvent.click(screen.getByRole('button', { name: 'Stores' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
}

beforeEach(() => localStorage.clear());

describe('seen flags', () => {
  it('each mode is seen separately', () => {
    expect(isTourSeen('easy')).toBe(false);
    markTourSeen('easy');
    expect(isTourSeen('easy')).toBe(true);
    expect(isTourSeen('full')).toBe(false);
  });

  it('finishing the original one-time tour counts as having seen the full tour', () => {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
    expect(isTourSeen('full')).toBe(true);
    expect(isTourSeen('easy')).toBe(false);
  });

  it('a driver gets a mode’s tour until it is seen; store owners never do', () => {
    expect(pendingModeTour('driver', 'easy')).toBe(true);
    markTourSeen('easy');
    expect(pendingModeTour('driver', 'easy')).toBe(false);
    expect(pendingModeTour('store_owner', 'easy')).toBe(false);
  });
});

describe('Easy tour', () => {
  it('walks the scan-first invoice in 7 steps, then points to Settings and Products', () => {
    const { onNav, onComplete } = renderTour('driver', 'easy');

    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
    expect(screen.getByText('Start an invoice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));

    expect(screen.getByText('Step 2 of 7')).toBeInTheDocument();
    expect(screen.getByText('Start typing a store and pick it. Or leave it blank and write it on the paper.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Step 3 of 7')).toBeInTheDocument();
    expect(screen.getByText(/Scan each item\. Check the name, quantity and price, then tap Add/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Step 4 of 7')).toBeInTheDocument();
    expect(screen.getByText(/Anything you left empty prints as a blank line/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    expect(onNav).toHaveBeenCalledWith('route');

    expect(screen.getByText('Step 5 of 7')).toBeInTheDocument();
    expect(screen.getByText(/Tap ⋯ on one to mark it Paid/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Step 6 of 7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stores' }));
    expect(screen.getByText('Step 7 of 7')).toBeInTheDocument();
    expect(screen.getByText(/End of Day, at the top, shows what you collected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));

    expect(screen.getByText(/Products, in the same menu, lets you fix a remembered name or price/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('a store owner gets the owner tour even with mode="easy"', () => {
    renderTour('store_owner', 'easy');
    expect(screen.getByText('This is where you order')).toBeInTheDocument();
  });

  it('on Free, the last step says how many free invoices there are; on Pro it does not', () => {
    renderTour('driver', 'easy');
    walkEasyTour();
    expect(screen.getByText(/You get 20 free invoices a month\. Settings → Plan shows how many are left\./)).toBeInTheDocument();
    cleanup();
    givePro();
    renderTour('driver', 'easy');
    walkEasyTour();
    expect(screen.queryByText(/You get 20 free invoices a month/)).toBeNull();
  });

  it('the sentence is added to the usual finish text, not in place of it', () => {
    renderTour('driver', 'easy');
    walkEasyTour();
    expect(screen.getByText(/Products, in the same menu, lets you fix a remembered name or price\. You get 20 free invoices a month/)).toBeInTheDocument();
  });

  it('a guest has the 5-entry cap rather than the free plan, so the tour does not mention 20 free invoices', () => {
    localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true');
    renderTour('driver', 'easy');
    walkEasyTour();
    expect(screen.getByText(/Products, in the same menu, lets you fix a remembered name or price/)).toBeInTheDocument();
    expect(screen.queryByText(/free invoices a month/)).toBeNull();
  });
});

describe('full tour copy matches the app', () => {
  it('uses the real button names, the ⋯ menu, and puts End of Day in Reports', () => {
    render(
      <ThemeProvider>
        <button data-qs-tab="route">Route</button>
        <FakeAppChrome />
        <QuickStart role="driver" mode="full" onNav={vi.fn()} onComplete={vi.fn()} onSkip={vi.fn()} />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Route' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(screen.getByText('Type a product name (it suggests ones you’ve used) or tap the camera to scan its barcode. Keiro remembers the name and your price for next time.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('When you’re done, tap Generate Invoice. Then Share (WhatsApp, text, print…) or Download PDF.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Your invoices appear here, newest first. Tap ⋯ on one to mark it Paid, send a reminder, share it again, or edit it.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Every store you invoice appears here with what it owes. Tap one for its full balance. With an account, Invite links a store so its orders reach you directly.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stores' }));
    expect(screen.getByText('Home shows today and the last 7 days; Reports breaks revenue down by Today, Week, Month or Year. End of Day, at the top of Reports, shows the cash and card you collected.')).toBeInTheDocument();
  });

  it('its finish text does not mention the free plan, even on Free (only the Easy tour does)', () => {
    render(
      <ThemeProvider>
        <button data-qs-tab="route">Route</button>
        <FakeAppChrome />
        <QuickStart role="driver" mode="full" onNav={vi.fn()} onComplete={vi.fn()} onSkip={vi.fn()} />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Route' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByRole('button', { name: 'Stores' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
    expect(screen.getByText(/back up your data there anytime/)).toBeInTheDocument();
    expect(screen.queryByText(/free invoices a month/)).toBeNull();
  });
});

describe('replaying a tour', () => {
  it('the Easy tour starts on Route (its first step is + New there); others start where they are', () => {
    expect(tourStartPage('driver', 'easy')).toBe('route');
    expect(tourStartPage('driver', 'full')).toBeNull();
    expect(tourStartPage('store_owner', 'easy')).toBeNull();
  });
});
