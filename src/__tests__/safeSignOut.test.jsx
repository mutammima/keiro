/**
 * safeSignOut.test.jsx
 *
 * Signing out wipes every account-scoped `inv_*` key on the device (so the
 * next account doesn't inherit the last one's data). That includes the sync
 * queue: a change made offline and not yet uploaded was deleted without a
 * word. For a guest, EVERYTHING lives only on the device. useSafeSignOut is the
 * one path all sign-out buttons take: it tries to upload first, and asks
 * before deleting anything that hasn't reached the cloud.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/auth', () => ({ signOut: vi.fn(async () => ({ error: null })) }));
vi.mock('../utils/syncQueue', () => ({
  processSyncQueue: vi.fn(async () => {}),
  getUnsyncedCount: vi.fn(() => 0),
  getHeldSyncs: vi.fn(() => []),
}));
vi.mock('../utils/guestMode', () => ({
  isGuest: vi.fn(() => false),
  guestEntryCount: vi.fn(() => 0),
  promptAccount: vi.fn(),
}));

import { signOut } from '../services/auth';
import { processSyncQueue, getUnsyncedCount, getHeldSyncs } from '../utils/syncQueue';
import { isGuest, guestEntryCount, promptAccount } from '../utils/guestMode';
import { useSafeSignOut } from '../hooks/useSafeSignOut';

function SignOutButton({ onSignedOut }) {
  const { requestSignOut, signOutPrompt } = useSafeSignOut({ onSignedOut });
  return (
    <>
      <button onClick={requestSignOut}>Sign Out</button>
      {signOutPrompt}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations; one test makes the upload succeed.
  processSyncQueue.mockImplementation(async () => {});
  getUnsyncedCount.mockReturnValue(0);
  getHeldSyncs.mockReturnValue([]);
  isGuest.mockReturnValue(false);
  guestEntryCount.mockReturnValue(0);
});

describe('useSafeSignOut', () => {
  it('signs straight out when everything is already in the cloud', async () => {
    const onSignedOut = vi.fn();
    render(<SignOutButton onSignedOut={onSignedOut} />);

    fireEvent.click(screen.getByText('Sign Out'));

    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('tries to upload pending changes before deciding anything', async () => {
    processSyncQueue.mockImplementation(async () => { getUnsyncedCount.mockReturnValue(0); });
    getUnsyncedCount.mockReturnValue(3);
    const onSignedOut = vi.fn();
    render(<SignOutButton onSignedOut={onSignedOut} />);

    fireEvent.click(screen.getByText('Sign Out'));

    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
    expect(processSyncQueue).toHaveBeenCalled();
  });

  it('asks before deleting changes that still have not reached the cloud', async () => {
    getUnsyncedCount.mockReturnValue(3);
    const onSignedOut = vi.fn();
    render(<SignOutButton onSignedOut={onSignedOut} />);

    fireEvent.click(screen.getByText('Sign Out'));

    expect(await screen.findByText(/3 changes haven't been saved/)).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Stay signed in'));
    await waitFor(() => expect(screen.queryByText(/haven't been saved/)).not.toBeInTheDocument());
    expect(signOut).not.toHaveBeenCalled();
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  // Uploads held for the free plan's limit don't wait for a signal: they go up
  // once the driver is on Pro, or next month. "Stay signed in" must say so.
  it('keeps the usual wording when none of the changes are held', async () => {
    getUnsyncedCount.mockReturnValue(3);
    render(<SignOutButton onSignedOut={vi.fn()} />);

    fireEvent.click(screen.getByText('Sign Out'));

    const body = await screen.findByText(/3 changes haven't been saved/);
    expect(body).toHaveTextContent("Stay signed in and they'll upload when you're back online.");
    expect(body).not.toHaveTextContent('Pro');
  });

  it('says held changes upload once on Pro or next month, when all of them are held', async () => {
    getUnsyncedCount.mockReturnValue(2);
    getHeldSyncs.mockReturnValue([{ id: 'h1' }, { id: 'h2' }]);
    render(<SignOutButton onSignedOut={vi.fn()} />);

    fireEvent.click(screen.getByText('Sign Out'));

    const body = await screen.findByText(/2 changes haven't been saved/);
    expect(body).toHaveTextContent("Stay signed in: they'll upload once you're on Pro, or next month.");
    expect(body).not.toHaveTextContent('back online');
  });

  it.each([
    [1, 'the 1 invoice waiting for Pro'],
    [2, 'the 2 invoices waiting for Pro'],
  ])('with %i of 3 changes held, names the wait for Pro next to the usual one', async (held, phrase) => {
    getUnsyncedCount.mockReturnValue(3);
    getHeldSyncs.mockReturnValue(Array.from({ length: held }, (_, i) => ({ id: `h${i}` })));
    render(<SignOutButton onSignedOut={vi.fn()} />);

    fireEvent.click(screen.getByText('Sign Out'));

    const body = await screen.findByText(/3 changes haven't been saved/);
    expect(body).toHaveTextContent(`Stay signed in and they'll upload when you're back online (${phrase}: once you're on Pro, or next month).`);
  });

  it('signs out after an explicit "Sign out anyway"', async () => {
    getUnsyncedCount.mockReturnValue(1);
    const onSignedOut = vi.fn();
    render(<SignOutButton onSignedOut={onSignedOut} />);

    fireEvent.click(screen.getByText('Sign Out'));
    expect(await screen.findByText(/1 change hasn't been saved/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sign out anyway'));

    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('warns a guest that their entries exist only on this phone, and offers an account instead', async () => {
    isGuest.mockReturnValue(true);
    guestEntryCount.mockReturnValue(4);
    render(<SignOutButton onSignedOut={vi.fn()} />);

    fireEvent.click(screen.getByText('Sign Out'));

    expect(await screen.findByText(/only on this phone/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Create an account'));
    expect(promptAccount).toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
