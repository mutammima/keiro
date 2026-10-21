/**
 * useSafeReload.test.jsx
 *
 * A reload the app asks for itself (a plan change that flips the mode) never
 * lands under a half-made invoice: it waits, and happens when that screen
 * closes. `reload` is a parameter because jsdom can't stub location.reload.
 * No module is mocked here.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSafeReload } from '../hooks/useSafeReload';

function setup(busy) {
  const reload = vi.fn();
  const hook = renderHook(({ busy: b }) => useSafeReload(b, reload), { initialProps: { busy } });
  return { reload, ...hook };
}

describe('useSafeReload', () => {
  it('reloads at once when no invoice is being made', () => {
    const { reload, result } = setup(false);
    act(() => result.current());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('while an invoice is being made it only remembers, and reloads when that screen closes', () => {
    const { reload, result, rerender } = setup(true);
    act(() => result.current());
    expect(reload).not.toHaveBeenCalled();
    rerender({ busy: true });                 // still on the invoice screen
    expect(reload).not.toHaveBeenCalled();
    rerender({ busy: false });                // the screen closed
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('holds the reload for an invoice opened after launch, not only for one already open', () => {
    const { reload, result, rerender } = setup(false);
    rerender({ busy: true });                 // the driver taps + New
    act(() => result.current());              // the plan changes under the half-made invoice
    expect(reload).not.toHaveBeenCalled();
    rerender({ busy: false });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('asking again while it waits still reloads only once', () => {
    const { reload, result, rerender } = setup(true);
    act(() => { result.current(); result.current(); });
    rerender({ busy: false });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('forgets the request once it has reloaded: the next invoice does not reload again', () => {
    const { reload, result, rerender } = setup(true);
    act(() => result.current());
    rerender({ busy: false });
    rerender({ busy: true });
    rerender({ busy: false });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all when no reload was asked for', () => {
    const { reload, rerender } = setup(true);
    rerender({ busy: false });
    rerender({ busy: true });
    rerender({ busy: false });
    expect(reload).not.toHaveBeenCalled();
  });

  it('is the same function on every render (PlanRunner has it as an effect dependency)', () => {
    const { result, rerender } = setup(false);
    const first = result.current;
    rerender({ busy: true });
    rerender({ busy: false });
    expect(result.current).toBe(first);
  });
});
