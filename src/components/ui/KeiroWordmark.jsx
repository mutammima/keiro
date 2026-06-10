/**
 * KeiroWordmark — reusable branded wordmark.
 *
 * Renders "Ke i̊ rō" where:
 *   · the 'i' is the accent colour (dot stands out as the accent element)
 *   · the 'o' is text colour with an accent-coloured macron bar above it
 *   · 'Ke' and 'r' are the standard text colour
 *
 * All sizing is em-relative so it scales with any font-size passed via style.
 */

import { ACCENT } from '../../theme';

/**
 * MacronO — renders a text-coloured 'o' with an accent-coloured macron
 * (the horizontal bar) floating above it, like the ō in Keirō.
 */
function MacronO({ textColor }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ color: textColor }}>o</span>
      <span style={{
        position: 'absolute',
        top: '-0.17em',
        left: '10%',
        width: '80%',
        height: '0.07em',
        background: ACCENT,
        borderRadius: '0.04em',
        display: 'block',
        pointerEvents: 'none',
      }} />
    </span>
  );
}

export default function KeiroWordmark({ style = {}, C }) {
  const base = {
    fontWeight: 900,
    letterSpacing: '-1.5px',
    lineHeight: 1.2,
    fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
    ...style,
  };

  const textColor = C?.text ?? '#fff';

  return (
    <span style={base}>
      <span style={{ color: textColor }}>Ke</span>
      <span style={{ color: ACCENT }}>i</span>
      <span style={{ color: textColor }}>r</span>
      <MacronO textColor={textColor} />
    </span>
  );
}
