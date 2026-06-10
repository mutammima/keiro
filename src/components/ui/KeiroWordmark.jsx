/**
 * KeiroWordmark — reusable branded wordmark.
 *
 * Renders "Keiro" where the 'i' is accent-coloured (the dot stands out)
 * and all other letters are the standard text colour.
 *
 * All sizing is em-relative so it scales with any font-size passed via style.
 */

import { ACCENT } from '../../theme';

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
      <span style={{ color: textColor }}>ro</span>
    </span>
  );
}
