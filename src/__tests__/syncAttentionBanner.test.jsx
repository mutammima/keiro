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
  getHeldSyncs: vi.fn(() => []),
  retryFailedSyncs: vi.fn(),
  processSyncQueue: vi.fn(async () => {}),
}));

import { getFailedSyncs, getHeldSyncs, retryFailedSyncs, processSyncQueue } from '../utils/syncQueue';
import SyncAttentionBanner from '../components/ui/SyncAttentionBanner';

const announce = () => act(() => { window.dispatchEvent(new CustomEvent('inv-sync-attention')); });

beforeEach(() => {
  vi.clearAllMocks();
  getFailedSyncs.mockReturnValue([]);
  getHeldSyncs.mockReturnValue([]);
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

  it('"Later" is forgotten down to the current count: after some are saved, one new failure shows it again', () => {
    getFailedSyncs.mockReturnValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    render(<SyncAttentionBanner />);
    fireEvent.click(screen.getByText('Later'));

    getFailedSyncs.mockReturnValue([{ id: 'a' }, { id: 'b' }]); // one was saved (Try again from elsewhere): still hidden
    announce();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    getFailedSyncs.mockReturnValue([{ id: 'a' }, { id: 'b' }, { id: 'd' }]); // a new one fails: 3 again, but not the 3 that was dismissed
    announce();
    expect(screen.getByRole('status')).toHaveTextContent("3 changes couldn't be saved");
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

describe('SyncAttentionBanner at phone width', () => {
  // With a failed AND a held line the sentence is long: beside three buttons it got a ~58px column and ran to
  // 8 lines at 390px (11 at 375px). When both show, the bar wraps: the text takes the whole first row (the
  // warning sign leads it) and the buttons sit on their own row. One line alone keeps its single row.
  const FAILED = [{ id: 'a' }];
  const HELD = [{ id: 'h' }];
  const textOf = () => screen.getByText(/invoice|change/, { selector: 'span' });

  it('both lines: the bar wraps, the text takes the full row, the buttons follow it on their own row', () => {
    getFailedSyncs.mockReturnValue(FAILED);
    getHeldSyncs.mockReturnValue(HELD);
    render(<SyncAttentionBanner />);
    const bar = screen.getByRole('status');
    const text = textOf();
    expect(bar.style.flexWrap).toBe('wrap');
    expect(text.style.flexBasis).toBe('100%');
    expect(text).toHaveTextContent("1 change couldn't be saved · 1 invoice will upload");
    expect(text.contains(screen.getByText('⚠'))).toBe(true); // the sign leads the text instead of costing it a column
    const buttons = screen.getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual(['Later', 'Try again', 'Upgrade']);
    for (const b of buttons) {
      expect(text.contains(b)).toBe(false);
      expect(text.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(b.style.minHeight).toBe('44px');
    }
    expect(buttons[0].style.marginLeft).toBe('auto'); // the row of buttons sits at the right
  });

  it('one line alone: one row as before, the text beside the sign and the buttons', () => {
    for (const [failed, held] of [[FAILED, []], [[], HELD]]) {
      getFailedSyncs.mockReturnValue(failed);
      getHeldSyncs.mockReturnValue(held);
      const { unmount } = render(<SyncAttentionBanner />);
      const bar = screen.getByRole('status');
      const text = textOf();
      expect(bar.style.flexWrap).toBe('');
      expect(text.style.flexBasis).not.toBe('100%');
      expect(text.style.flexGrow).toBe('1');
      expect(text.contains(screen.getByText('⚠'))).toBe(false);
      expect(screen.getAllByRole('button')[0].style.marginLeft).toBe('');
      unmount();
    }
  });
});

describe('SyncAttentionBanner: set-aside, held, and both', () => {
  const failed = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${i}` }));
  const held = (n) => Array.from({ length: n }, (_, i) => ({ id: `h${i}` }));
  const show = (f, h) => { getFailedSyncs.mockReturnValue(failed(f)); getHeldSyncs.mockReturnValue(held(h)); };
  const labels = () => screen.getAllByRole('button').map(b => b.textContent);
  const sentence = () => screen.getByText(/invoice|change/, { selector: 'span' }).textContent.replace('⚠', '').trim(); // the text, not the buttons
  const WILL_UPLOAD = (n) => new RegExp(`^${n} invoice${n === 1 ? '' : 's'} will upload [A-Z][a-z]{2} \\d{1,2}, or with Pro$`);

  it('set-aside only: Try again, never Upgrade (upgrading cannot save what the server rejected)', () => {
    show(2, 0);
    render(<SyncAttentionBanner />);
    expect(labels()).toEqual(['Later', 'Try again']);
    expect(screen.queryByRole('button', { name: 'Upgrade' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('will upload');
  });

  it('held only: Upgrade, never Try again', () => {
    show(0, 2);
    render(<SyncAttentionBanner />);
    expect(labels()).toEqual(['Later', 'Upgrade']);
    expect(screen.getByRole('status')).not.toHaveTextContent("couldn't be saved");
  });

  it('set-aside and held together: one sentence with both, and all three buttons', () => {
    show(2, 3);
    render(<SyncAttentionBanner />);
    const [firstHalf, secondHalf] = sentence().split(' · ');
    expect(firstHalf).toBe("2 changes couldn't be saved");
    expect(secondHalf).toMatch(WILL_UPLOAD(3));
    expect(labels()).toEqual(['Later', 'Try again', 'Upgrade']);
  });

  it('one is singular and several are plural, on both halves', () => {
    show(1, 1);
    const { unmount } = render(<SyncAttentionBanner />);
    const [a, b] = sentence().split(' · ');
    expect(a).toBe("1 change couldn't be saved");
    expect(b).toMatch(WILL_UPLOAD(1));
    unmount();
    show(0, 1);
    render(<SyncAttentionBanner />);
    expect(sentence()).toMatch(WILL_UPLOAD(1));
  });

  it('"Later" counts both lists: more of either brings it back, the same number does not', () => {
    show(1, 1);
    render(<SyncAttentionBanner />);
    fireEvent.click(screen.getByText('Later'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    show(1, 1); announce(); // the same two
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    show(1, 2); announce(); // another invoice held
    expect(screen.getByRole('status')).toHaveTextContent("1 change couldn't be saved");
  });

  it('"Later" is not lifted by a failure moving to held: the total did not rise', () => {
    show(2, 0);
    render(<SyncAttentionBanner />);
    fireEvent.click(screen.getByText('Later'));
    show(1, 1); announce(); // one of the two was held for the limit instead: still two things waiting
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    show(1, 2); announce(); // and a third
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
