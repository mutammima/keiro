/**
 * KeiroWordmark — reusable branded wordmark.
 *
 * Renders "Ke i̊rō" where:
 *   · 'Ke' is the standard text colour
 *   · 'iro' has a single continuous accent-coloured bar floating above all
 *     three letters — connecting the dot of the 'i' through to the macron
 *     of the 'ō' in one unified stroke
 *   · all letter bodies are the standard text colour
 *
 * All sizing is em-relative so it scales with any font-size passed via style.
 */

import { ACCENT } from '../../theme';

/**
 * IroWithBar — renders "iro" with a single accent-coloured bar spanning
 * the full width of all three letters, floating just above them.
 */
function IroWithBar({ textColor }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {/* Single continuous bar across i + r + o */}
      <span style={{
        position: 'absolute',
        top: '-0.17em',
        left: 0,
        right: 0,
        height: '0.08em',
        background: ACCENT,
        borderRadius: '0.04em',
        display: 'block',
        pointerEvents: 'none',
      }} />
      <span style={{ color: textColor }}>iro</span>
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
      <IroWithBar textColor={textColor} />
    </span>
  );
}
