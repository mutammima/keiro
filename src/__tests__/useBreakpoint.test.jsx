/**
 * useBreakpoint.test.jsx
 *
 * Regression cover for the responsive-layout hook (PR #174, fixed in the
 * follow-up review pass).
 *
 * THE BUG THIS LOCKS DOWN: the hook read `window.matchMedia(...)` directly in
 * getSnapshot. jsdom does not implement matchMedia, so any component using the
 * hook threw the moment it mounted under test. The whole suite still passed
 * only because nothing happened to mount one yet — a trap armed for whoever
 * next wrote a test touching App, NavDrawer or a tab page.
 *
 * getServerSnapshot did NOT cover this: React only calls it when hydrating
 * server-rendered markup, never on an ordinary client render.
 *
 * The fix is a guard inside the hook rather than a matchMedia polyfill in
 * setup.js, deliberately — a polyfill would paper over the same failure in
 * real environments that lack matchMedia (older embedded webviews), which is
 * exactly where a mobile-first fallback matters.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBreakpoint, BP } from '../hooks/useBreakpoint';

const realMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

/** Install a matchMedia that reports `width` against `(min-width: Npx)`. */
function stubMatchMediaAt(width) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query) => {
      const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
      return {
        matches: width >= min,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      };
    },
  });
}

afterEach(() => {
  if (realMatchMedia) Object.defineProperty(window, 'matchMedia', realMatchMedia);
  else delete window.matchMedia;
});

describe('useBreakpoint', () => {
  it('does not throw when matchMedia is missing, and falls back to phone', () => {
    // jsdom's own default state — no polyfill, matching a bare test env.
    delete window.matchMedia;
    expect(window.matchMedia).toBeUndefined();

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe(BP.PHONE);
  });

  it('reports the tier matching the viewport width', () => {
    for (const [width, expected] of [
      [375,  BP.PHONE],    // phone
      [767,  BP.PHONE],    // just below the tablet edge
      [768,  BP.TABLET],   // tablet edge, inclusive
      [1099, BP.TABLET],   // just below the desktop edge
      [1100, BP.DESKTOP],  // desktop edge, inclusive
      [1440, BP.DESKTOP],
    ]) {
      stubMatchMediaAt(width);
      const { result, unmount } = renderHook(() => useBreakpoint());
      expect(result.current, `width ${width}`).toBe(expected);
      unmount();
    }
  });
});
