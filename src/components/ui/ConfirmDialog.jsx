/**
 * ConfirmDialog — a two-button "are you sure?" dialog (Go back / Generate
 * anyway, Keep it / Discard). Portaled to body: iOS clips position:fixed
 * children of overflow ancestors.
 */
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

export default function ConfirmDialog({ open, title, children, cancelLabel, confirmLabel, onCancel, onConfirm, danger = false }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  if (!open) return null;
  return createPortal(
    <div style={s.backdrop} onClick={onCancel}>
      <div role="dialog" aria-label={title} style={{ ...s.dialog, border: `1px solid ${C.cardBorder}`, background: C.card }} onClick={e => e.stopPropagation()}>
        <p style={{ ...s.title, color: C.text }}>{title}</p>
        <p style={{ ...s.body, color: C.textSub }}>{children}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ ...s.btn, border: `1px solid ${C.inputBorder}`, background: C.inputBg, color: C.text }}>{cancelLabel}</button>
          <button onClick={onConfirm} style={{ ...s.btn, border: 'none', background: danger ? C.danger : ACCENT, color: '#fff' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const s = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 9600, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog:   { width: '100%', maxWidth: 340, borderRadius: 18, padding: '22px 20px 18px', boxShadow: '0 16px 48px rgba(0,0,0,0.35)' },
  title:    { fontSize: 18, fontWeight: 800, margin: '0 0 8px' },
  body:     { fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' },
  btn:      { flex: 1, height: 46, borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
};
