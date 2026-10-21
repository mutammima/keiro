/**
 * privacyPolicy.test.jsx
 *
 * Shared product names show other drivers something a driver typed, so the
 * in-app privacy policy must say so — exactly what is shared (a name, once two
 * accounts agree) and what never is — and list the barcode lookups.
 *
 * It also says what Keiro keeps for the plan, still says the app takes no
 * payments, and the terms describe the free plan for drivers (Pro is coming
 * soon). PRIVACY.md and TERMS.md carry the same sentences.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { FREE_INVOICES_PER_MONTH } from '../utils/constants';

vi.mock('../components/navigation/AppFooter', () => ({ default: () => null }));

import Legal from '../pages/Legal.jsx';

// The words the owner reads, in the app and in the two .md files. The Terms say the
// limit as a number, so it is built from the constant here: changing the limit fails
// these tests until the Terms (and their date) are changed on purpose.
const PLAN_KEPT = "For your plan, Keiro keeps whether you're on Free or Pro (and until when) and how many invoices you made each month.";
const PLANS_TERMS = `Keiro has a free plan for drivers: Easy Mode and ${FREE_INVOICES_PER_MONTH} new invoices a month. Keiro Pro (unlimited invoices, the full app and signing on the phone) is coming soon; when payments are available, the price will be shown in the app before you pay. What each plan includes may change; we will tell you in the app before a change affects you.`;

describe('privacy policy', () => {
  it('says what shared product names expose, and what they never do', () => {
    render(<ThemeProvider><Legal section="privacy" onOpenDrawer={vi.fn()} onNav={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText(/the names of products in your catalog — including names you give a barcode — can be suggested to other signed-in Keiro users/i)).toBeInTheDocument();
    expect(screen.getByText(/once at least two other accounts have used the same name/i)).toBeInTheDocument();
    expect(screen.getByText(/your prices, quantities, stores, and which account saved it are never shared/i)).toBeInTheDocument();
    expect(screen.getByText(/invoices you send to a connected store are visible to that store's account\. nothing else you keep is exposed this way/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing else you keep is exposed to other users/i)).toBeNull();
  });

  it('lists the barcode lookups', () => {
    render(<ThemeProvider><Legal section="privacy" onOpenDrawer={vi.fn()} onNav={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText(/its number \(only the number\) is sent to Open Food Facts and, through our server, to UPCitemdb/i)).toBeInTheDocument();
  });

  it('storage section points to the product-name exception', () => {
    render(<ThemeProvider><Legal section="privacy" onOpenDrawer={vi.fn()} onNav={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText(/so no other account can read them, except as described under What other users can see/i)).toBeInTheDocument();
    expect(screen.queryByText(/the one exception/i)).toBeNull();
  });

  it('says what Keiro keeps for the plan, and still that the app takes no payments', () => {
    render(<ThemeProvider><Legal section="privacy" onOpenDrawer={vi.fn()} onNav={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText((content) => content.includes(PLAN_KEPT))).toBeInTheDocument();
    expect(screen.getByText(/the app does not process payments/)).toBeInTheDocument();
  });

  it('the terms describe the free plan for drivers and say Pro is coming soon', () => {
    render(<ThemeProvider><Legal section="terms" onOpenDrawer={vi.fn()} onNav={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText(new RegExp(`Keiro has a free plan for drivers: Easy Mode and ${FREE_INVOICES_PER_MONTH} new invoices a month`))).toBeInTheDocument();
    expect(screen.getByText(/Keiro Pro .* is coming soon/)).toBeInTheDocument();
    expect(screen.getByText(PLANS_TERMS)).toBeInTheDocument(); // the whole Plans paragraph, word for word
  });
});

// PRIVACY.md and TERMS.md are the same documents as the in-app pages; a wrapped
// line in the markdown is still the same sentence.
// eslint-disable-next-line no-undef -- Node global; vitest runs from the repo root
const markdown = (name) => readFileSync(resolve(process.cwd(), name), 'utf8').replace(/\s+/g, ' ');

// Every count of invoices per month a text states ("20 new invoices a month", "5 free invoices each month"...).
const limitsStated = (text) => [...text.matchAll(/\b(\d+) (?:new |free )?invoices (?:a|each|per|every) month/gi)].map((m) => Number(m[1]));

describe('the free limit the policy texts state', () => {
  it('TERMS.md says the number FREE_INVOICES_PER_MONTH is, and any number PRIVACY.md states is the same', () => {
    expect(limitsStated(markdown('TERMS.md'))).toEqual([FREE_INVOICES_PER_MONTH]);   // stated once, and it is the constant's
    for (const number of limitsStated(markdown('PRIVACY.md'))) expect(number).toBe(FREE_INVOICES_PER_MONTH);
  });
  it('the in-app Terms and Privacy say that number too', () => {
    for (const section of ['terms', 'privacy']) {
      const { container, unmount } = render(<ThemeProvider><Legal section={section} onOpenDrawer={vi.fn()} onNav={vi.fn()} /></ThemeProvider>);
      for (const number of limitsStated(container.textContent)) expect(number, section).toBe(FREE_INVOICES_PER_MONTH);
      if (section === 'terms') expect(limitsStated(container.textContent)).toEqual([FREE_INVOICES_PER_MONTH]);
      unmount();
    }
  });
  it('the check can see a number: it reads the wording the texts use', () => {
    expect(limitsStated('Easy Mode and 20 new invoices a month.')).toEqual([20]);
    expect(limitsStated('5 free invoices each month, then 25 invoices per month')).toEqual([5, 25]);
    expect(limitsStated('how many invoices you made each month')).toEqual([]);
  });
});

describe('PRIVACY.md and TERMS.md', () => {
  it('say what the app says about the plan', () => {
    const privacy = markdown('PRIVACY.md');
    expect(privacy).toContain('The App does not process payments.');
    expect(privacy).toContain(PLAN_KEPT);
    const terms = markdown('TERMS.md');
    expect(terms).toMatch(/## \d+\. Plans Keiro has a free plan/); // its own numbered section
    expect(terms).toContain(PLANS_TERMS);
  });
});
