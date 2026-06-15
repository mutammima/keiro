/**
 * Spotlight — the blocking highlight used by the Quick Start.
 *
 * Dims the whole screen EXCEPT a hole cut around the target element, using four
 * panels (top/bottom/left/right of the target rect). The panels capture taps and
 * scrolling, so the only thing the user can interact with is the highlighted
 * element showing through the hole. A document-level capture listener detects the
 * tap on the target (by selector, geometry-independent) and advances the step,
 * while letting the element's own click run so the app actually navigates.
 *
 * Portaled to document.body per the codebase's iOS containing-block rule.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useElementRect } from './useElementRect';
import TutorialTooltip from './TutorialTooltip';

const Z = 9000;
const PAD = 8;       // breathing room around the highlighted element
const DIM = 'rgba(0,0,0,0.66)';

function Panel({ style }) {
  const block = e => { e.stopPropagation(); };
  const blockTouch = e => { e.preventDefault(); e.stopPropagation(); };
  return (
    <div
      onClick={block}
      onMouseDown={block}
      onTouchStart={block}
      onTouchMove={blockTouch}
      style={{ position: 'fixed', background: DIM, zIndex: Z, touchAction: 'none', ...style }}
    />
  );
}

export default function Spotlight({ targetSelector, onTargetTap, title, desc, stepNumber, total, canSkip, onSkip, dark, accent }) {
  const { rect } = useElementRect(targetSelector, { active: true });

  // Advance when the real target is tapped. Capture phase so we see it even
  // though the panels sit above; we do NOT preventDefault, so the element's own
  // onClick (navigation) still fires.
  useEffect(() => {
    if (!targetSelector) return;
    function onClick(e) {
      if (e.target.closest?.(targetSelector)) onTargetTap?.();
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [targetSelector, onTargetTap]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const header = (
    <div style={{ fontSize: 16, fontWeight: 800, color: dark ? '#fff' : '#111', marginBottom: 6, lineHeight: 1.25 }}>
      {title}
    </div>
  );

  return createPortal(
    <>
      {/* Dim — full screen until the target resolves, then a hole around it */}
      {!rect ? (
        <Panel style={{ inset: 0 }} />
      ) : (
        <>
          <Panel style={{ left: 0, top: 0, width: '100%', height: Math.max(0, rect.top - PAD) }} />
          <Panel style={{ left: 0, top: rect.bottom + PAD, width: '100%', height: Math.max(0, vh - rect.bottom - PAD) }} />
          <Panel style={{ left: 0, top: Math.max(0, rect.top - PAD), width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 }} />
          <Panel style={{ left: rect.right + PAD, top: Math.max(0, rect.top - PAD), width: Math.max(0, vw - rect.right - PAD), height: rect.height + PAD * 2 }} />
          {/* Highlight ring around the hole (pointer-events none so the tap passes through) */}
          <div
            aria-hidden
            style={{
              position: 'fixed',
              left: rect.left - PAD, top: rect.top - PAD,
              width: rect.width + PAD * 2, height: rect.height + PAD * 2,
              border: `2px solid ${accent}`, borderRadius: 12,
              zIndex: Z + 1, pointerEvents: 'none',
              '--tut-glow': `${accent}73`,
              animation: 'tut-pulse 1.6s ease-in-out infinite',
            }}
          />
        </>
      )}

      {/* Top chrome — Skip (left) + progress (right) */}
      <div style={{ position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', left: 0, right: 0, zIndex: Z + 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', pointerEvents: 'none' }}>
        {canSkip ? (
          <button
            data-tutorial-ui="skip"
            onClick={onSkip}
            style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', backdropFilter: 'blur(6px)' }}
          >
            Skip
          </button>
        ) : <span />}
        <span style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
          Step {stepNumber} of {total}
        </span>
      </div>

      <TutorialTooltip rect={rect} dark={dark} accent={accent} header={header} z={Z + 2}>
        {desc}
      </TutorialTooltip>
    </>,
    document.body
  );
}
