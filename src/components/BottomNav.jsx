/**
 * BottomNav — slim fixed bottom bar, total height hard-locked to 40px
 * (plus safe-area on notched phones). Override all browser minimums.
 */

import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

const TABS = [
  { id: 'invoice',  label: 'New',      icon: '＋' },
  { id: 'history',  label: 'Invoices', icon: '≡'  },
  { id: 'products', label: 'Products', icon: '◈'  },
];

const ROW_H = 38; // px — the visible button row height

export default function BottomNav({ currentPage, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const activeIdx = TABS.findIndex(t =>
    currentPage === t.id || (t.id === 'invoice' && currentPage === 'invoice-view')
  );

  return (
    <>
      {/* Inject style to nuke any browser min-height on our buttons */}
      <style>{`
        .invoicego-nav-btn {
          -webkit-appearance: none;
          appearance: none;
          min-height: 0 !important;
          min-width: 0 !important;
          height: ${ROW_H}px !important;
        }
      `}</style>

      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        height: `calc(${ROW_H}px + env(safe-area-inset-bottom))`,
        background: dark ? 'rgba(10,10,10,0.96)' : 'rgba(240,237,232,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${C.divider}`,
        zIndex: 1000,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}>
        {/* Sliding active pill */}
        {activeIdx !== -1 && (
          <div style={{
            position: 'absolute',
            top: 5,
            left: `calc(${activeIdx} * 33.333% + 6%)`,
            width: '21.333%',
            height: ROW_H - 10,
            background: dark ? 'rgba(74,123,247,0.13)' : 'rgba(74,123,247,0.09)',
            borderRadius: 7,
            transition: 'left 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
            pointerEvents: 'none',
          }} />
        )}

        {/* Button row — explicit height, no padding */}
        <div style={{
          display: 'flex',
          height: ROW_H,
          flexShrink: 0,
        }}>
          {TABS.map((tab, idx) => {
            const active = activeIdx === idx;
            return (
              <button
                key={tab.id}
                className="invoicego-nav-btn"
                onClick={() => onNav(tab.id)}
                style={{
                  flex: 1,
                  height: ROW_H,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  padding: 0,
                  margin: 0,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                  boxSizing: 'border-box',
                }}
              >
                <span style={{
                  fontSize: 13,
                  color: active ? ACCENT : C.textMuted,
                  lineHeight: 1,
                  transition: 'color 0.2s',
                  userSelect: 'none',
                }}>
                  {tab.icon}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  color: active ? ACCENT : C.textMuted,
                  letterSpacing: '0.01em',
                  transition: 'color 0.2s',
                  userSelect: 'none',
                }}>
                  {tab.label}
                </span>
                {/* Active dot */}
                <div style={{
                  position: 'absolute',
                  bottom: 3,
                  width: 3, height: 3,
                  borderRadius: 2,
                  background: ACCENT,
                  opacity: active ? 1 : 0,
                  transition: 'opacity 0.2s',
                }} />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
