/**
 * TourCard — the Easy tour's card (spec docs/specs/2026-10-26-easy-mode-feel.md §2).
 *
 * One big card in a fixed place instead of a small bubble that follows its target
 * around: docked at the bottom of the screen, or at the top when the thing it
 * points at is in the lower half (the bottom tab bar). 20 pt title, 18 pt text,
 * 56 pt Back and Next on every step, and "Skip tour" inside the card rather than
 * up by the clock. It fades in only once the step is `ready` (the screen has
 * stopped moving); until then it is laid out but hidden.
 *
 * Does NOT portal itself — Spotlight owns the portal.
 */

import { useEffect, useRef } from 'react';

export default function TourCard({ rect, ready, dark, accent, title, desc, stepNumber, total, onBack, onNext, onSkip, z }) {
  const vh = window.innerHeight;
  // Which half the visible part of the target is in. A long list runs past the
  // screen, so only the part on screen counts.
  const shownTop = rect ? Math.max(0, rect.top) : 0;
  const shownBottom = rect ? Math.min(vh, rect.bottom) : 0;
  const top = !!rect && (shownTop + shownBottom) / 2 > vh / 2;

  // Move focus into the card when it appears, so VoiceOver reads the step.
  // (Spotlight is remounted per step, so `ready` turns true once per step.)
  const titleRef = useRef(null);
  useEffect(() => {
    if (ready) titleRef.current?.focus({ preventScroll: true });
  }, [ready]);

  const fg = dark ? '#fff' : '#111';
  const sub = dark ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.72)';
  const muted = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)';

  return (
    <div
      data-tutorial-ui="tooltip"
      className="tut-card"
      role="dialog"
      aria-label={title}
      style={{
        ...s.card,
        ...(top ? { top: 'calc(env(safe-area-inset-top, 0px) + 12px)' } : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }),
        zIndex: z,
        background: dark ? '#1d1d22' : '#fff',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
        visibility: ready ? 'visible' : 'hidden',
        animation: ready ? `${top ? 'tut-card-down' : 'tut-card-up'} 0.45s cubic-bezier(0.22,1,0.36,1) both` : 'none',
      }}
    >
      <div style={s.topRow}>
        <span style={{ ...s.count, color: muted }}>Step {stepNumber} of {total}</span>
        <button data-tutorial-ui="skip" type="button" onClick={onSkip} style={{ ...s.skip, color: muted }}>Skip tour</button>
      </div>
      <div ref={titleRef} tabIndex={-1} style={{ ...s.title, color: fg }}>{title}</div>
      <div style={{ ...s.desc, color: sub }}>{desc}</div>
      <div style={s.buttons}>
        {onBack && (
          <button
            data-tutorial-ui="spotlight-back"
            type="button"
            onClick={onBack}
            style={{ ...s.btn, flex: 1, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: fg }}
          >
            Back
          </button>
        )}
        <button
          data-tutorial-ui="spotlight-next"
          type="button"
          onClick={onNext}
          style={{ ...s.btn, flex: 2, background: accent, color: '#fff' }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

const s = {
  card: {
    position: 'fixed', left: 0, right: 0, margin: '0 auto',
    width: 'calc(100% - 24px)', maxWidth: 480, boxSizing: 'border-box',
    borderRadius: 22, padding: '16px 18px 18px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
  },
  topRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, minHeight: 44 },
  count: { fontSize: 15, fontWeight: 700 },
  skip: {
    minHeight: 44, padding: '0 4px 0 12px', marginRight: -4,
    background: 'none', border: 'none', fontSize: 16, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  title: { fontSize: 20, fontWeight: 800, lineHeight: 1.25, marginBottom: 8, outline: 'none' },
  desc: { fontSize: 18, lineHeight: 1.45, marginBottom: 18 },
  buttons: { display: 'flex', gap: 10 },
  btn: {
    height: 56, borderRadius: 16, border: 'none',
    fontSize: 18, fontWeight: 700, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
};
