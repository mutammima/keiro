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
}));
vi.mock('../utils/guestMode', () => ({
  isGuest: vi.fn(() => false),
  guestEntryCount: vi.fn(() => 0),
  promptAccount: vi.fn(),
}));

import { signOut } from '../services/auth';
import { processSyncQueue, getUnsyncedCount } from '../utils/syncQueue';
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
