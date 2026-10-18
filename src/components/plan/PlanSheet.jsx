/**
 * PlanSheet — the bottom sheet every plan screen uses (a centered dialog on
 * desktop through the --sheet-* custom properties, like the other sheets).
 * Portaled so an overflow:hidden ancestor can't clip it on iOS.
 */
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

export default function PlanSheet({ open, onClose, title, label, children }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  if (!open) return null;
  return createPortal(
    <div onClick={onClose} style={s.backdrop}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label || title || 'Keiro Pro'}
        onClick={e => e.stopPropagation()}
        style={{ ...s.sheet, background: C.card, borderColor: C.cardBorder, color: C.text }}
      >
        {title && <div style={s.title}>{title}</div>}
        {children}
      </div>
    </div>,
    document.body
  );
}

export function PrimaryBtn({ onClick, disabled = false, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...s.primary, background: ACCENT, opacity: disabled ? 0.7 : 1 }}>
      {children}
    </button>
  );
}

export function TextBtn({ onClick, children }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  return (
    <button type="button" onClick={onClick} style={{ ...s.text, color: C.textMuted }}>{children}</button>
  );
}

const s = {
  backdrop: {
    // Portaled to body, so it stacks against the app chrome directly: above
    // TopNav (1000), the sliding drawer (1600) and the bottom OfflineBanner
    // (8000, which would hide half of the primary button while offline);
    // level with InviteModal (9000); below confirm dialogs (9500+). The
    // docked desktop rail is z 5, far beneath.
    position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'var(--sheet-align, flex-end)', justifyContent: 'center',
  },
  sheet: {
    width: '100%', maxWidth: 480, boxSizing: 'border-box', border: '1px solid',
    borderRadius: 'var(--sheet-radius-20, 20px 20px 0 0)',
    padding: '22px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  title: { fontSize: 19, fontWeight: 800, lineHeight: 1.3 },
  primary: {
    height: 50, borderRadius: 14, border: 'none', color: '#fff', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  text: {
    background: 'none', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    padding: '6px 0', WebkitTapHighlightColor: 'transparent',
  },
};
