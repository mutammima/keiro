/**
 * useElementRect — tracks the live viewport rect of a target element by CSS
 * selector, scrolling it into view once on first resolve.
 *
 * A ~60fps setTimeout loop keeps the rect glued to the element through
 * scrolling and page-transition animations, so a spotlight or tip stays locked
 * on its target. The loop only runs while `active` is true (i.e. while a
 * spotlight/tip is on screen), so its cost is bounded.
 *
 * setTimeout, not requestAnimationFrame: rAF is suspended by the browser
 * whenever the document isn't visible/focused (Page Visibility API), which a
 * one-shot-then-stuck measurement can hit mid-transition — e.g. a tab
 * momentarily loses focus, or (inside the Capacitor wrapper) a keyboard
 * show/hide or permission dialog. setTimeout keeps firing regardless, so a
 * step that starts a beat late still settles on the correct rect.
 *
 * Returns { rect, missing, settled }:
 *   rect    — { top,left,width,height,bottom,right } | null
 *   missing — true once the element has failed to resolve for ~1.5s, so callers
 *             can give up gracefully instead of hanging on a tip that can't anchor.
 *   settled — true once the element exists and has held still for SETTLE_MS, and
 *             at least MIN_WAIT_MS after the selector changed (or MAX_WAIT_MS at the
 *             latest, for a target that never stops moving). A tour step waits for
 *             it, so a card never points at a screen that is still sliding in or
 *             loading (spec docs/specs/2026-10-26-easy-mode-feel.md). It stays true
 *             for that selector once set; the rect keeps following the element.
 */

import { useEffect, useState } from 'react';

const TICK_MS = 16; // ~60fps
const GIVE_UP_TICKS = Math.round(1500 / TICK_MS); // ~1.5s
const SETTLE_MS   = 350;  // the target must hold still this long…
const MIN_WAIT_MS = 600;  // …and no sooner than this after the step changed…
const MAX_WAIT_MS = 2500; // …but a target that keeps moving shows by this time anyway

export function useElementRect(selector, { active = true, scrollIntoView = true } = {}) {
  const [rect, setRect]       = useState(null);
  const [missing, setMissing] = useState(false);
  // The selector it settled for, not a boolean: on the render where the selector
  // changes (before this effect resets anything) the new step must not count as
  // settled on the previous target's say-so.
  const [settledFor, setSettledFor] = useState(null);

  useEffect(() => {
    // The synchronous reset below is deliberate: it clears the rect to null the
    // instant the spotlight goes inactive or its target changes, so a stale rect
    // from the previous target can't flash before the poll loop re-measures.
    // Moving it to cleanup would instead null the rect on every selector change
    // and flicker the spotlight mid page-transition. The loop's own setState is
    // async (in a setTimeout), which the rule does not flag.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!active || !selector) { setRect(null); setMissing(false); setSettledFor(null); return; }

    let timer = 0;
    let tries = 0;
    let scrolled = false;
    let cancelled = false;
    const started = Date.now();
    let still = null;    // the element's last measured box, and since when it has held it
    let stillSince = 0;
    let isSettled = false;
    setMissing(false);

    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(selector);
      if (el) {
        tries = 0;
        if (scrollIntoView && !scrolled) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          scrolled = true;
        }
        const r = el.getBoundingClientRect();
        const now = Date.now();
        if (!still || still.top !== r.top || still.left !== r.left || still.width !== r.width || still.height !== r.height) {
          still = r;
          stillSince = now;
        }
        if (!isSettled && ((now - stillSince >= SETTLE_MS && now - started >= MIN_WAIT_MS) || now - started >= MAX_WAIT_MS)) {
          isSettled = true;
          setSettledFor(selector);
        }
        setRect(prev => {
          if (prev && prev.top === r.top && prev.left === r.left &&
              prev.width === r.width && prev.height === r.height) {
            return prev; // unchanged — skip re-render
          }
          return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
        });
      } else {
        tries += 1;
        if (tries === GIVE_UP_TICKS) setMissing(true);
      }
      timer = setTimeout(tick, TICK_MS);
    };

    timer = setTimeout(tick, TICK_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [selector, active, scrollIntoView]);

  return { rect, missing, settled: active && settledFor === selector };
}
