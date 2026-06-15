/**
 * HelpChecklist — Layer 3 feature discovery, rendered inside Settings.
 *
 * Lists every headline feature for the current role as a checklist. Items tick
 * off automatically as the user discovers features (the checklist reads the same
 * inv_act_* flags the contextual tips and milestone bridge set). Tapping an item
 * expands a one-line explanation with a "Take me there" button that navigates
 * straight to the feature.
 *
 * Also hosts the "Replay the quick tour" entry the spec requires for users who
 * skipped the Quick Start.
 */

import { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { getChecklist, PROGRESS_EVENT } from '../../utils/tutorialProgress';

export default function HelpChecklist({ role, onNav, onReplay }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [items, setItems] = useState(() => getChecklist(role));
  const [open, setOpen]   = useState(null); // expanded item id

  // Refresh whenever progress changes (a tip dismissed, an action recorded).
  useEffect(() => {
    const refresh = () => setItems(getChecklist(role));
    refresh();
    window.addEventListener(PROGRESS_EVENT, refresh);
    return () => window.removeEventListener(PROGRESS_EVENT, refresh);
  }, [role]);

  const doneCount = items.filter(i => i.done).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
      <button
        onClick={onReplay}
        style={{ height: 44, borderRadius: 12, border: `1px solid ${C.divider}`, background: C.rowBg, color: ACCENT, fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
      >
        Replay the quick tour
      </button>

      {/* Progress summary */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Feature checklist</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>{doneCount} of {items.length} discovered</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: C.divider, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${items.length ? (doneCount / items.length) * 100 : 0}%`, background: ACCENT, borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(item => {
          const isOpen = open === item.id;
          return (
            <div key={item.id} style={{ border: `1px solid ${C.divider}`, borderRadius: 12, overflow: 'hidden', background: C.rowBg }}>
              <button
                onClick={() => setOpen(isOpen ? null : item.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'left' }}
              >
                {/* Check circle */}
                <span style={{
                  flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                  border: item.done ? 'none' : `2px solid ${C.divider}`,
                  background: item.done ? '#22C55E' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 13, fontWeight: 900,
                }}>
                  {item.done ? '✓' : ''}
                </span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: item.done ? C.textMuted : C.text, textDecoration: item.done ? 'line-through' : 'none' }}>
                  {item.label}
                </span>
                <span style={{ flexShrink: 0, color: C.textMuted, fontSize: 16, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 14px 12px 48px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: C.textSub }}>{item.desc}</p>
                  {!item.done && (
                    <button
                      onClick={() => onNav?.(item.page)}
                      style={{ alignSelf: 'flex-start', height: 36, padding: '0 16px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                    >
                      Take me there →
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
