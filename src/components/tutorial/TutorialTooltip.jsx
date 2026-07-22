/**
 * TutorialTooltip — a small card pointing at a target rect, used by the Quick
 * Start spotlight.
 *
 * Positioning rules (safe down to a 320–375px screen):
 *   • Width clamps to min(viewport − 24, 340).
 *   • Prefers placing BELOW the target; flips ABOVE when there isn't room — so it
 *     never covers the element it points at.
 *   • Horizontally centers on the target, then clamps to stay fully on screen.
 *   • A caret points back at the target from the chosen side.
 *
 * The card measures its own height after first paint (useLayoutEffect) and stays
 * invisible for that one frame to avoid a position flash.
 *
 * Does NOT portal itself — the parent (Spotlight) owns the portal.
 */

import { useLayoutEffect, useRef, useState } from 'react';

const MARGIN = 12; // min gap from screen edge
const GAP    = 12; // gap between target and card

export default function TutorialTooltip({ rect, dark, children, footer, header, z = 1, compact = false }) {
  const cardRef = useRef(null);
  const [size, setSize] = useState(null); // { w, h } measured after paint

  useLayoutEffect(() => {
    if (cardRef.current) {
      const { offsetWidth, offsetHeight } = cardRef.current;
      setSize(prev => (prev && prev.w === offsetWidth && prev.h === offsetHeight ? prev : { w: offsetWidth, h: offsetHeight }));
    }
  });

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(vw - MARGIN * 2, compact ? 290 : 340);

  // Horizontal: center on target (or screen), clamp on-screen.
  const targetCx = rect ? rect.left + rect.width / 2 : vw / 2;
  let left = targetCx - width / 2;
  left = Math.max(MARGIN, Math.min(vw - width - MARGIN, left));

  // Vertical: prefer below the target, flip above when it won't fit.
  const h = size?.h ?? 160;
  let top;
  let placement; // every branch below assigns this before it is read
  if (!rect) {
    top = Math.max(MARGIN, vh / 2 - h / 2); // centered when there's no anchor
    placement = 'none';
  } else {
    const belowTop = rect.bottom + GAP;
    if (belowTop + h <= vh - MARGIN) {
      top = belowTop;
      placement = 'below';
    } else {
      top = rect.top - GAP - h;
      placement = 'above';
      if (top < MARGIN) {
        // Neither side fits cleanly — clamp and drop the caret.
        top = Math.max(MARGIN, Math.min(vh - h - MARGIN, rect.bottom + GAP));
        placement = 'clamped';
      }
    }
  }

  // Caret horizontal offset (relative to the card), clamped within its width.
  const caretLeft = Math.max(16, Math.min(width - 16, targetCx - left));
  const bg = dark ? '#1d1d22' : '#ffffff';

  return (
    <div
      ref={cardRef}
      data-tutorial-ui="tooltip"
      style={{
        position: 'fixed',
        top, left, width,
        zIndex: z,
        background: bg,
        borderRadius: compact ? 14 : 18,
        padding: compact ? '12px 14px 11px' : '16px 18px 14px',
        boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        visibility: size ? 'visible' : 'hidden',
        animation: 'tut-fadein 0.32s ease both',
        boxSizing: 'border-box',
      }}
    >
      {(placement === 'below' || placement === 'above') && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: caretLeft - 7,
            [placement === 'below' ? 'top' : 'bottom']: -7,
            width: 14, height: 14, background: bg,
            transform: 'rotate(45deg)',
            borderLeft:   placement === 'below' ? `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` : 'none',
            borderTop:    placement === 'below' ? `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` : 'none',
            borderRight:  placement === 'above' ? `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` : 'none',
            borderBottom: placement === 'above' ? `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` : 'none',
          }}
        />
      )}
      {header}
      <div style={{ fontSize: compact ? 13 : 14, lineHeight: compact ? 1.45 : 1.55, color: dark ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.72)' }}>
        {children}
      </div>
      {footer}
    </div>
  );
}
