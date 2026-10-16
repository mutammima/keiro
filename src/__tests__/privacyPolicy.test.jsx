/**
 * privacyPolicy.test.jsx
 *
 * Shared product names show other drivers something a driver typed, so the
 * in-app privacy policy must say so — exactly what is shared (a name, once two
 * accounts agree) and what never is — and list the barcode lookups.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';

vi.mock('../components/navigation/AppFooter', () => ({ default: () => null }));

import Legal from '../pages/Legal.jsx';

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
});
