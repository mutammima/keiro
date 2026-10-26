/**
 * legalFreeLimit.test.jsx — the in-app Terms say the free limit from FREE_INVOICES_PER_MONTH, not from a number typed
 * into Legal.jsx. The constant is made 25 here; a Terms page that still says 20 is a page the next change of the
 * limit would leave behind. (privacyPolicy.test.jsx pins the real 20 against TERMS.md and PRIVACY.md.)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';

vi.mock('../utils/constants', async (importOriginal) => ({
  ...(await importOriginal()),
  FREE_INVOICES_PER_MONTH: 25,
}));
vi.mock('../components/navigation/AppFooter', () => ({ default: () => null }));

import Legal from '../pages/Legal.jsx';

describe('the in-app Terms\' free limit', () => {
  it('is the constant\'s number', () => {
    render(<ThemeProvider><Legal section="terms" onOpenDrawer={vi.fn()} onNav={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText(/Keiro has a free plan for drivers: Easy Mode and 25 new invoices a month\./)).toBeInTheDocument();
    expect(screen.queryByText(/\b20 new invoices/)).toBeNull();
  });
});
