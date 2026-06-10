/**
 * KeiroWordmark — reusable branded wordmark.
 *
 * Renders "Keiro" in the app's heavy display font with the dot of the 'i'
 * standing out in the accent color. Pass `style` to control font-size,
 * letter-spacing, etc. for each context.
 */

import { ACCENT } from '../../theme';

export default function KeiroWordmark({ style = {}, C }) {
  const base = {
    fontWeight: 900,
    letterSpacing: '-1.5px',
    lineHeight: 1,
    fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
    ...style,
  };

  const textColor = C?.text ?? '#fff';

  return (
    <span style={base}>
      <span style={{ color: textColor }}>Ke</span>
      <span style={{ color: ACCENT, position: 'relative' }}>i</span>
      <span style={{ color: textColor }}>ro</span>
    </span>
  );
}
