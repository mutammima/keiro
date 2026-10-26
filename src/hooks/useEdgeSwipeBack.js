/**
 * useEdgeSwipeBack — the iPhone's "swipe from the left edge to go back", for the
 * pages that open over the tabs (Easy Mode; spec docs/specs/2026-10-26-easy-mode-feel.md).
 *
 * A touch that starts within EDGE_PX of the left edge and moves mostly sideways
 * drags the open page with the finger. Let go past a third of the screen, or
 * flick, and it presses that page's own "‹ Back" ([data-back], BackButton), so a
 * page that asks first (the Easy invoice with items on it) still asks; if the page
 * is still there after the press, it slides back into place. Anything else
 * (a tap, a vertical scroll, a short drag) leaves the page where it was.
 *
 * Plain DOM listeners on the shell rather than React's, for two reasons: touchmove
 * must be non-passive so preventDefault() stops the page scrolling under the drag
 * (React's is passive), and the capture phase lets a horizontal edge drag stop
 * there instead of also reaching a row's own swipe handler inside the page.
 */

import { useEffect } from 'react';

const EDGE_PX = 24;        // the strip along the left edge a back swipe must start in
const COMMIT_RATIO = 0.33; // let go past a third of the width to go back
const FLICK_PX_MS = 0.5;   // or move this fast (px per ms) at the end of a drag
const OUT_MS = 200;
const RETURN_MS = 260;

export function useEdgeSwipeBack(shellRef, { enabled }) {
  useEffect(() => {
    const shell = shellRef.current;
    if (!enabled || !shell) return;

    let drag = null; // { el, x0, y0, axis, dx, lastX, lastT, speed }
    let timers = [];
    const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

    const slide = (el, x, ms) => {
      el.style.transition = `transform ${ms}ms cubic-bezier(0.22,1,0.36,1)`;
      el.style.transform = `translateX(${x}px)`;
    };
    // The page's own entrance animation (fill-mode both) would override an inline
    // transform, so it is switched off for good once a drag starts; it has already
    // finished by then, and turning it back on would replay it.
    const rest = (el) => { el.style.transition = ''; el.style.transform = ''; el.style.boxShadow = ''; };

    function onStart(e) {
      if (e.touches.length !== 1) { drag = null; return; }
      const t = e.touches[0];
      if (t.clientX > EDGE_PX) return;
      const el = shell.querySelector('[data-scroll-container="overlay"]');
      if (!el || !el.querySelector('[data-back]')) return;
      drag = { el, x0: t.clientX, y0: t.clientY, axis: null, dx: 0, lastX: t.clientX, lastT: e.timeStamp, speed: 0 };
    }

    function onMove(e) {
      if (!drag) return;
      const t = e.touches[0];
      const dx = t.clientX - drag.x0;
      const dy = t.clientY - drag.y0;
      if (drag.axis === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dx <= 0 || Math.abs(dx) < Math.abs(dy) * 1.2) { drag = null; return; } // a scroll, not a back swipe
        drag.axis = 'h';
        drag.el.style.animation = 'none';
        drag.el.style.transition = 'none';
        drag.el.style.boxShadow = '-10px 0 30px rgba(0,0,0,0.35)';
      }
      e.preventDefault();
      e.stopPropagation();
      const dt = e.timeStamp - drag.lastT;
      if (dt > 0) drag.speed = (t.clientX - drag.lastX) / dt;
      drag.lastX = t.clientX;
      drag.lastT = e.timeStamp;
      drag.dx = Math.max(0, dx);
      drag.el.style.transform = `translateX(${drag.dx}px)`;
    }

    function onEnd(e) {
      const d = drag;
      drag = null;
      if (!d || d.axis !== 'h') return;
      const { el } = d;
      const width = el.clientWidth || window.innerWidth;
      const goBack = e.type === 'touchend' &&
        (d.dx > width * COMMIT_RATIO || (d.dx > 40 && d.speed > FLICK_PX_MS));
      if (!goBack) {
        slide(el, 0, RETURN_MS);
        later(() => rest(el), RETURN_MS);
        return;
      }
      slide(el, width, OUT_MS);
      later(() => {
        el.querySelector('[data-back]')?.click();
        // Still on screen: the page asked first (or has no way out) — bring it back.
        later(() => {
          if (!el.isConnected) return;
          slide(el, 0, RETURN_MS);
          later(() => rest(el), RETURN_MS);
        }, 60);
      }, OUT_MS);
    }

    const capture = { capture: true };
    const activeCapture = { capture: true, passive: false };
    shell.addEventListener('touchstart', onStart, capture);
    shell.addEventListener('touchmove', onMove, activeCapture);
    shell.addEventListener('touchend', onEnd, capture);
    shell.addEventListener('touchcancel', onEnd, capture);
    return () => {
      shell.removeEventListener('touchstart', onStart, capture);
      shell.removeEventListener('touchmove', onMove, activeCapture);
      shell.removeEventListener('touchend', onEnd, capture);
      shell.removeEventListener('touchcancel', onEnd, capture);
      timers.forEach(clearTimeout);
      timers = [];
    };
  }, [shellRef, enabled]);
}
