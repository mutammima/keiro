/**
 * DriverReports — Tab 3 ("Reports") for the Driver role.
 * Combines the two existing analytics surfaces behind a segmented control:
 *   • Analytics  → <Reports embedded/>   (Today / Week / Month / Year)
 *   • End of Day → <EndOfDay embedded/>  (driver day summary)
 * Both child pages render in `embedded` mode (their own headers hidden) so this
 * tab owns a single header row.
 *
 * Both are lazy()-loaded HERE as well as in App.jsx. That is deliberate, not a
 * duplicate: this tab is eagerly imported (it is one of the four driver tabs),
 * so a static import of Reports/EndOfDay pulled both back into the entry chunk
 * and silently cancelled App.jsx's lazy() split (Rollup warns about exactly
 * this). Keeping the import dynamic on both sides is what actually produces
 * separate chunks — and it means End of Day is never downloaded unless the
 * user taps that segment.
 */

import { useState, lazy, Suspense } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK } from '../../theme';

const Reports  = lazy(() => import('../Reports'));
const EndOfDay = lazy(() => import('../EndOfDay'));

const SEGMENTS = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'endofday',  label: 'End of Day' },
];

export default function DriverReports({ onNav }) {
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
        <div style={{ display: 'flex', background: dark ? '#1a1a1a' : '#e0e0e0', borderRadius: 12, padding: 3, gap: 3, maxWidth: 'var(--content-max)', margin: '0 auto' }}>
          {SEGMENTS.map(({ id, label }) => {
            const active = seg === id;
            return (
              <button
                key={id}
                data-tip={id === 'endofday' ? 'reports-eod' : undefined}
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
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
            <span aria-hidden style={{ width: 30, height: 30, borderRadius: '50%', border: `3px solid ${C.cardBorder}`, borderTopColor: '#4A7BF7', animation: 'tut-spin 0.8s linear infinite' }} />
          </div>
        }>
          {seg === 'analytics'
            ? <Reports embedded onNav={onNav} />
            : <EndOfDay embedded onNav={onNav} />}
        </Suspense>
      </div>
    </div>
  );
}
