/**
 * syncAttentionBanner.test.jsx
 *
 * Changes the server rejected MAX_RETRIES times are set aside, never deleted.
 * The banner is how the user learns about them, and "Try again" is how they
 * get another chance — it must stay up until the list is empty.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../utils/syncQueue', () => ({
  SYNC_ATTENTION_EVENT: 'inv-sync-attention',
  getFailedSyncs: vi.fn(() => []),
  retryFailedSyncs: vi.fn(),
  processSyncQueue: vi.fn(async () => {}),
}));

import { getFailedSyncs, retryFailedSyncs, processSyncQueue } from '../utils/syncQueue';
import SyncAttentionBanner from '../components/ui/SyncAttentionBanner';

const announce = () => act(() => { window.dispatchEvent(new CustomEvent('inv-sync-attention')); });

beforeEach(() => {
  vi.clearAllMocks();
  getFailedSyncs.mockReturnValue([]);
});

describe('SyncAttentionBanner', () => {
  it('shows nothing while every change is saved or still queued', () => {
    render(<SyncAttentionBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('appears when a change is set aside, and says how many', () => {
    render(<SyncAttentionBanner />);
    getFailedSyncs.mockReturnValue([{ id: 'a' }, { id: 'b' }]);
    announce();

    expect(screen.getByRole('status')).toHaveTextContent("2 changes couldn't be saved");
  });

  it('"Try again" requeues them and starts an upload', () => {
    getFailedSyncs.mockReturnValue([{ id: 'a' }]);
    render(<SyncAttentionBanner />);

    fireEvent.click(screen.getByText('Try again'));

    expect(retryFailedSyncs).toHaveBeenCalled();
    expect(processSyncQueue).toHaveBeenCalled();
  });

  it('stays beneath bottom sheets, dialogs and the drawer, so it never covers their buttons', () => {
    // Sheets start at z-index 200 (Log Payment, Settings), EditItemModal is
    // 3000, the drawer 1500. The banner used to sit at 8500, on top of all of
    // them, over their inputs and Save/Add Payment buttons.
    getFailedSyncs.mockReturnValue([{ id: 'a' }]);
    render(<SyncAttentionBanner />);

    expect(Number(screen.getByRole('status').style.zIndex)).toBeLessThan(200);
  });

  it('"Later" hides it until another change is set aside', () => {
    getFailedSyncs.mockReturnValue([{ id: 'a' }]);
    render(<SyncAttentionBanner />);

    fireEvent.click(screen.getByText('Later'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    getFailedSyncs.mockReturnValue([{ id: 'a' }, { id: 'b' }]);
    announce();
    expect(screen.getByRole('status')).toHaveTextContent("2 changes couldn't be saved");
  });

  it('comes back after "Later" if the list empties and a change is set aside again', () => {
    getFailedSyncs.mockReturnValue([{ id: 'a' }]);
    render(<SyncAttentionBanner />);
    fireEvent.click(screen.getByText('Later'));

    getFailedSyncs.mockReturnValue([]);
    announce();
    getFailedSyncs.mockReturnValue([{ id: 'a' }]);
    announce();

    expect(screen.getByRole('status')).toHaveTextContent("1 change couldn't be saved");
  });

  it('goes away once nothing is set aside', () => {
    getFailedSyncs.mockReturnValue([{ id: 'a' }]);
    render(<SyncAttentionBanner />);
    getFailedSyncs.mockReturnValue([]);
    announce();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
