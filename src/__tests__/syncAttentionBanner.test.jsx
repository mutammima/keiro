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

  it('goes away once nothing is set aside', () => {
    getFailedSyncs.mockReturnValue([{ id: 'a' }]);
    render(<SyncAttentionBanner />);
    getFailedSyncs.mockReturnValue([]);
    announce();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
