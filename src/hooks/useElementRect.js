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
 * Returns { rect, missing }:
 *   rect    — { top,left,width,height,bottom,right } | null
 *   missing — true once the element has failed to resolve for ~1.5s, so callers
 *             can give up gracefully instead of hanging on a tip that can't anchor.
 */

import { useEffect, useState } from 'react';

const TICK_MS = 16; // ~60fps
const GIVE_UP_TICKS = Math.round(1500 / TICK_MS); // ~1.5s

export function useElementRect(selector, { active = true, scrollIntoView = true } = {}) {
  const [rect, setRect]       = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!active || !selector) { setRect(null); setMissing(false); return; }

    let timer = 0;
    let tries = 0;
    let scrolled = false;
    let cancelled = false;
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

  return { rect, missing };
}
