/**
 * planSheetBand.test.jsx
 *
 * The plan sheets (Upgrade, the free limit, the one-time notes) are portaled to
 * <body>, so they stack against everything else in the app by z-index alone.
 * They must sit ABOVE the Quick Start tour (or a note under its dim panels can't
 * be tapped) and BELOW the sign-out prompt and ConfirmDialog (which must stay
 * answerable while a sheet is open). This reads the neighbours' real z-indexes
 * from the components themselves, so moving either side breaks this test
 * instead of silently overlapping.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/auth', () => ({ signOut: vi.fn(async () => ({ error: null })) }));
vi.mock('../utils/syncQueue', () => ({
  processSyncQueue: vi.fn(async () => {}),
  getUnsyncedCount: vi.fn(() => 2),   // two changes not saved: signing out asks first
  getHeldSyncs: vi.fn(() => []),
}));
vi.mock('../utils/guestMode', () => ({
  isGuest: vi.fn(() => false),
  guestEntryCount: vi.fn(() => 0),
  promptAccount: vi.fn(),
}));

import { ThemeProvider } from '../context/ThemeContext.jsx';
import PlanSheet from '../components/plan/PlanSheet';
import Spotlight from '../components/tutorial/Spotlight';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useSafeSignOut } from '../hooks/useSafeSignOut';

/** The highest inline z-index among the elements `node` holds, node included. */
function topZ(node) {
  return Math.max(...[node, ...node.querySelectorAll('*')].map((el) => Number(el.style?.zIndex) || 0));
}
/** The z-index of the portaled layer whose dialog is `dialog` (its backdrop). */
const backdropZ = (dialog) => Number(dialog.parentElement.style.zIndex);

function SignOut() {
  const { requestSignOut, signOutPrompt } = useSafeSignOut({ onSignedOut: () => {} });
  return <><button onClick={requestSignOut}>Sign out</button>{signOutPrompt}</>;
}

describe('the plan sheet\'s place in the stack', () => {
  it('is above every layer of the tour and below the sign-out prompt and ConfirmDialog', async () => {
    // The tour: the real Spotlight (dim panels, ring, tooltip, Skip and step count), portaled to <body>.
    render(<ThemeProvider><button data-x>target</button><Spotlight targetSelector="[data-x]" onNext={() => {}} title="Step" desc="Words" stepNumber={1} total={7} canSkip onSkip={() => {}} dark={false} accent="#4A7BF7" /></ThemeProvider>);
    const tourTop = topZ(document.body);
    expect(tourTop).toBeGreaterThan(0);                                   // the tour really rendered its layers

    render(<ThemeProvider><SignOut /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const signOut = backdropZ(await screen.findByRole('alertdialog'));

    render(<ThemeProvider><ConfirmDialog open title="Discard?" cancelLabel="Keep" confirmLabel="Discard" onCancel={() => {}} onConfirm={() => {}}>Sure?</ConfirmDialog></ThemeProvider>);
    const confirm = backdropZ(await screen.findByRole('dialog', { name: 'Discard?' }));

    render(<ThemeProvider><PlanSheet open title="Keiro Pro"><p>hello</p></PlanSheet></ThemeProvider>);
    const sheet = backdropZ(await waitFor(() => screen.getByRole('dialog', { name: 'Keiro Pro' })));

    expect(sheet).toBeGreaterThan(tourTop);
    expect(sheet).toBeLessThan(signOut);
    expect(sheet).toBeLessThan(confirm);
  });
});
