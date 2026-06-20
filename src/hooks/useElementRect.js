/**
 * useElementRect — tracks the live viewport rect of a target element by CSS
 * selector, scrolling it into view once on first resolve.
 *
 * A requestAnimationFrame loop keeps the rect glued to the element through
 * scrolling and the tab-strip slide animation, so a spotlight or tip stays
 * locked on its target. The loop only runs while `active` is true (i.e. while a
 * spotlight/tip is on screen), so its cost is bounded.
 *
 * Returns { rect, missing }:
 *   rect    — { top,left,width,height,bottom,right } | null
 *   missing — true once the element has failed to resolve for ~1.5s, so callers
 *             can give up gracefully instead of hanging on a tip that can't anchor.
 */

import { useEffect, useState } from 'react';

const GIVE_UP_FRAMES = 90; // ~1.5s at 60fps

export function useElementRect(selector, { active = true, scrollIntoView = true } = {}) {
  const [rect, setRect]       = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!active || !selector) { setRect(null); setMissing(false); return; }

    let raf = 0;
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
        if (tries === GIVE_UP_FRAMES) setMissing(true);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [selector, active, scrollIntoView]);

  return { rect, missing };
}
