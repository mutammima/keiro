// @vitest-environment jsdom
/**
 * Easy Mode's swipe back (useEdgeSwipeBack): a sideways drag that starts at the left edge
 * presses the open page's own "‹ Back"; anything else leaves the page alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack';

function Shell({ onBack, enabled = true, withBack = true }) {
  const ref = useRef(null);
  useEdgeSwipeBack(ref, { enabled });
  return (
    <div ref={ref}>
      <div data-scroll-container="overlay">
        {withBack && <button data-back onClick={onBack}>Back</button>}
        <p>A page</p>
      </div>
    </div>
  );
}

// jsdom has no Touch constructor, so the touch list is attached by hand.
let clock = 0;
function touch(el, type, x, y = 300) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
  Object.defineProperty(e, 'timeStamp', { value: (clock += 16) });
  el.dispatchEvent(e);
  return e;
}
function swipe(el, xs, y = 300) {
  touch(el, 'touchstart', xs[0], y);
  for (const x of xs.slice(1)) touch(el, 'touchmove', x, y);
  touch(el, 'touchend', xs[xs.length - 1], y);
}

beforeEach(() => { vi.useFakeTimers(); Object.defineProperty(window, 'innerWidth', { value: 402, configurable: true }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('swipe from the left edge goes back', () => {
  it('a long drag from the edge presses the page\'s Back', () => {
    const onBack = vi.fn();
    const { container } = render(<Shell onBack={onBack} />);
    const page = container.querySelector('[data-scroll-container="overlay"]');
    swipe(page, [6, 30, 80, 160, 220]);
    expect(page.style.transform).toBe('translateX(402px)');           // slides off first
    vi.advanceTimersByTime(250);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('and a page that is still there afterwards (it asked first) slides back into place', () => {
    const { container } = render(<Shell onBack={() => {}} />);
    const page = container.querySelector('[data-scroll-container="overlay"]');
    swipe(page, [6, 30, 80, 160, 220]);
    vi.advanceTimersByTime(1000);
    expect(page.style.transform).toBe('');
  });

  it('a short, slow drag springs back without going back', () => {
    const onBack = vi.fn();
    const { container } = render(<Shell onBack={onBack} />);
    const page = container.querySelector('[data-scroll-container="overlay"]');
    touch(page, 'touchstart', 6);
    touch(page, 'touchmove', 20);
    touch(page, 'touchmove', 50);
    clock += 400;                                                     // a pause before letting go
    touch(page, 'touchmove', 52);
    touch(page, 'touchend', 52);
    vi.advanceTimersByTime(1000);
    expect(onBack).not.toHaveBeenCalled();
    expect(page.style.transform).toBe('');
  });

  it('a quick flick goes back even if short', () => {
    const onBack = vi.fn();
    const { container } = render(<Shell onBack={onBack} />);
    const page = container.querySelector('[data-scroll-container="overlay"]');
    swipe(page, [6, 30, 70]);                                         // 40 px in 16 ms
    vi.advanceTimersByTime(250);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a drag that starts away from the edge does nothing', () => {
    const onBack = vi.fn();
    const { container } = render(<Shell onBack={onBack} />);
    const page = container.querySelector('[data-scroll-container="overlay"]');
    swipe(page, [60, 100, 200, 300]);
    vi.advanceTimersByTime(1000);
    expect(onBack).not.toHaveBeenCalled();
    expect(page.style.transform).toBe('');
  });

  it('a vertical scroll from the edge is left to the page', () => {
    const onBack = vi.fn();
    const { container } = render(<Shell onBack={onBack} />);
    const page = container.querySelector('[data-scroll-container="overlay"]');
    touch(page, 'touchstart', 6, 300);
    const move = touch(page, 'touchmove', 14, 200);
    touch(page, 'touchmove', 20, 100);
    touch(page, 'touchend', 20, 100);
    vi.advanceTimersByTime(1000);
    expect(move.defaultPrevented).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('is off outside Easy Mode, and on a page with no Back', () => {
    const onBack = vi.fn();
    const off = render(<Shell onBack={onBack} enabled={false} />);
    swipe(off.container.querySelector('[data-scroll-container="overlay"]'), [6, 30, 80, 160, 220]);
    cleanup();
    const none = render(<Shell onBack={onBack} withBack={false} />);
    const page = none.container.querySelector('[data-scroll-container="overlay"]');
    swipe(page, [6, 30, 80, 160, 220]);
    vi.advanceTimersByTime(1000);
    expect(onBack).not.toHaveBeenCalled();
    expect(page.style.transform).toBe('');
  });
});
