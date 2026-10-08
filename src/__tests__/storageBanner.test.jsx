/**
 * storageBanner.test.jsx
 *
 * A save that could not happen must be visible until a later one succeeds,
 * and a guest near the limit is asked to create an account.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../utils/storageRoom', () => ({
  isStorageFull: vi.fn(() => false),
  checkStorageOnLaunch: vi.fn(() => 'ok'),
}));
vi.mock('../utils/guestMode', () => ({ promptAccount: vi.fn() }));

import StorageBanner from '../components/ui/StorageBanner';
import { checkStorageOnLaunch } from '../utils/storageRoom';
import { promptAccount } from '../utils/guestMode';
import { EVENTS } from '../utils/constants';

describe('StorageBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkStorageOnLaunch.mockReturnValue('ok');
  });

  it('shows nothing while storage is fine', () => {
    render(<StorageBanner />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('appears when a save fails for lack of space and goes when one succeeds', () => {
    render(<StorageBanner />);
    act(() => { window.dispatchEvent(new CustomEvent(EVENTS.STORAGE_FULL)); });
    expect(screen.getByRole('status')).toHaveTextContent("Not saved on this phone: Keiro's storage here is full.");
    act(() => { window.dispatchEvent(new CustomEvent(EVENTS.STORAGE_OK)); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('asks a guest near the limit to create an account', () => {
    checkStorageOnLaunch.mockReturnValue('guest-near-full');
    render(<StorageBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('Create a free account');
    fireEvent.click(screen.getByText('Create account'));
    expect(promptAccount).toHaveBeenCalledTimes(1);
  });

  it('"Later" hides the guest notice', () => {
    checkStorageOnLaunch.mockReturnValue('guest-near-full');
    render(<StorageBanner />);
    fireEvent.click(screen.getByText('Later'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
