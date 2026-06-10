/**
 * KeiroWordmark — reusable branded wordmark.
 *
 * "Ke" + custom 'i' glyph (checkmark body + accent-coloured dot) + "ro"
 * All sizing is em-relative so it scales with any font-size passed via style.
 */

import { ACCENT } from '../../theme';

/**
 * CheckI — renders the 'i' as a checkmark stem with a blue dot on top.
 * Uses an inline SVG for the checkmark body so the stroke weight
 * matches the 900-weight surrounding letters.
 */
function CheckI({ textColor }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '0.42em',
      height: '0.95em',
      verticalAlign: '-0.03em',   // nudge down to sit on the baseline
      position: 'relative',
    }}>

      {/* Accent-coloured dot — only the dot is blue */}
      <span style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '0.17em',
        height: '0.17em',
        borderRadius: '50%',
        background: ACCENT,
        display: 'block',
      }} />

      {/* Checkmark body occupying the x-height zone */}
      <svg
        viewBox="0 0 10 18"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: '72%',           // ~x-height proportion
        }}
        fill="none"
      >
        <path
          d="M1 9 L4.5 15 L9 2"
          stroke={textColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

    </span>
  );
}

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
      <CheckI textColor={textColor} />
      <span style={{ color: textColor }}>ro</span>
    </span>
  );
}
