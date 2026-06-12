/**
 * DriverReports — Tab 3 ("Reports") for the Driver role.
 * Combines the two existing analytics surfaces behind a segmented control:
 *   • Analytics  → <Reports embedded/>   (Today / Week / Month / Year)
 *   • End of Day → <EndOfDay embedded/>  (driver day summary)
 * Both child pages render in `embedded` mode (their own headers hidden) so this
 * tab owns a single header row.
 */

import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK } from '../../theme';
import Reports from '../Reports';
import EndOfDay from '../EndOfDay';

const SEGMENTS = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'endofday',  label: 'End of Day' },
];

export default function DriverReports({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [seg, setSeg] = useState('analytics');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg }}>

      {/* Segmented control header */}
      <div style={{
        padding: '12px 16px 10px',
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', background: dark ? '#1a1a1a' : '#e0e0e0', borderRadius: 12, padding: 3, gap: 3, maxWidth: 480, margin: '0 auto' }}>
          {SEGMENTS.map(({ id, label }) => {
            const active = seg === id;
            return (
              <button
                key={id}
                onClick={() => setSeg(id)}
                style={{
                  flex: 1, height: 36, border: 'none', borderRadius: 9,
                  background: active ? (dark ? '#2e2e2e' : '#fff') : 'transparent',
                  color: active ? C.text : C.textMuted,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  transition: 'background 0.15s ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active segment — Analytics scrolls in this wrapper; End of Day manages its own scroll */}
      <div style={{ flex: 1, minHeight: 0, overflowY: seg === 'analytics' ? 'auto' : 'hidden' }}>
        {seg === 'analytics'
          ? <Reports embedded onNav={onNav} />
          : <EndOfDay embedded onNav={onNav} />}
      </div>
    </div>
  );
}
