/**
 * FeatureTip — a single one-time contextual hint (Layer 2).
 *
 * Non-blocking by design: a soft highlight ring marks the target (pointer-events
 * none) and a small card points at it with a "Got it" button. The rest of the
 * screen stays fully interactive, so a tip never stops the user finishing what
 * they were doing.
 *
 * If the target can't be found within ~1.5s the tip dismisses WITHOUT marking
 * itself seen, so it can fire again the next time the feature is on screen.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { useElementRect } from '../../hooks/useElementRect';
import TutorialTooltip from './TutorialTooltip';

// Above the app's modals (z 9000) so a tip can point at content inside one
// (e.g. the invite link in InviteModal). Tips never run during the Quick Start
// spotlight, so there's no contention with that 9000 layer.
const Z = 9500;

export default function FeatureTip({ tip, onDismiss }) {
  const { dark, accent } = useTheme();
  const { rect, missing } = useElementRect(tip.selector, { active: true });

  // Every tab panel is mounted at once (a horizontal strip), so an anchor on a
  // NON-visible tab still resolves a rect — just translated off-screen. Showing
  // the tip then pins it to empty space on the wrong screen. Treat that like a
  // missing anchor: dismiss quietly so it re-fires when that tab is actually up.
  const offScreen = !!rect && (rect.right <= 0 || rect.left >= window.innerWidth);

  // Give up quietly if the anchor never appears / isn't on the visible screen
  // (don't burn the seen flag — it can fire again next time it's in view).
  useEffect(() => {
    if (missing || offScreen) onDismiss(false);
  }, [missing, offScreen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rect || offScreen) return null; // wait for the anchor (or the timeout above)

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
      <button
        data-tutorial-ui="tip-got-it"
        onClick={() => onDismiss(true)}
        style={{ height: 38, padding: '0 20px', borderRadius: 11, border: 'none', background: accent, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
      >
        Got it
      </button>
    </div>
  );

  return createPortal(
    <>
      {/* Highlight ring — visual only, never intercepts taps */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          left: rect.left - 6, top: rect.top - 6,
          width: rect.width + 12, height: rect.height + 12,
          border: `2px solid ${accent}`, borderRadius: 12,
          zIndex: Z, pointerEvents: 'none',
          '--tut-glow': `${accent}66`,
          animation: 'tut-pulse 1.6s ease-in-out infinite',
        }}
      />
      <TutorialTooltip rect={rect} dark={dark} accent={accent} footer={footer} z={Z + 1}>
        {tip.text}
      </TutorialTooltip>
    </>,
    document.body
  );
}
