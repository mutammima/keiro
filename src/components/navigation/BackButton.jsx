/**
 * BackButton — "‹ Back", the way out of a page opened over the tabs.
 *
 * The word is written out and the button is at least 44×44 pt: a bare ← glyph
 * (36×32 pt, right under the Dynamic Island) was missed on a 6.3" iPhone. It
 * carries data-back so the left-edge swipe (App.jsx) presses this same button,
 * and a page's own leave logic (the Easy invoice asks before discarding items)
 * runs either way.
 */

import { ACCENT } from '../../theme';

export default function BackButton({ onClick, label = 'Back', color = ACCENT, style }) {
  return (
    <button type="button" data-back onClick={onClick} aria-label={label} style={{ ...s.btn, color, ...style }}>
      <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">
        <polyline points="10,2 2,10 10,18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

const s = {
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    minWidth: 44, minHeight: 44, padding: '0 12px 0 4px', marginLeft: -4,
    background: 'none', border: 'none', fontSize: 17, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0,
  },
};
