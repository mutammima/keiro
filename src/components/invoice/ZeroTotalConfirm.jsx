/**
 * ZeroTotalConfirm — "Generate a $0.00 invoice?" guard, shared by the normal
 * and Easy invoice screens (useInvoiceForm's zeroConfirm / confirmZeroTotal).
 * Portaled to body: iOS clips position:fixed children of overflow ancestors.
 */
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

export default function ZeroTotalConfirm({ open, onCancel, onConfirm }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  if (!open) return null;
  return createPortal(
    <div style={s.backdrop} onClick={onCancel}>
      <div style={{ ...s.dialog, border: `1px solid ${C.cardBorder}`, background: C.card }} onClick={e => e.stopPropagation()}>
        <p style={{ ...s.title, color: C.text }}>Generate a $0.00 invoice?</p>
        <p style={{ ...s.body, color: C.textSub }}>
          This invoice totals <strong>$0.00</strong> — usually that means an item is missing a price. Generate it anyway?
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ ...s.btn, border: `1px solid ${C.inputBorder}`, background: C.inputBg, color: C.text }}>Go back</button>
          <button onClick={onConfirm} style={{ ...s.btn, border: 'none', background: ACCENT, color: '#fff' }}>Generate anyway</button>
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
