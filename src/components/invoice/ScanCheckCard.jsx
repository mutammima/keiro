/**
 * ScanCheckCard — the Easy invoice's "check this item" card: name, quantity
 * (− / +) and price, bound to useInvoiceForm's add-item fields. Opens after a
 * scan, for "Add without scanning", and when a line is tapped (then it also
 * offers Remove). Portaled to body so it sits above the page on iOS.
 */
import { createPortal } from 'react-dom';
import AutofillInput from '../ui/AutofillInput';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { LOOKING_UP_TEXT, NAME_FROM_DRIVERS, NAME_FROM_DATABASE } from '../../utils/constants';

export default function ScanCheckCard({ form, onAdd, onCancel, onRemove }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const lookingUp = form.productName === LOOKING_UP_TEXT;
  const qtyNum = Number(form.qty) || 0;
  const field = { ...s.input, background: C.inputBg, borderColor: C.inputBorder, color: C.text };
  const stepBtn = { ...s.stepBtn, background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  return createPortal(
    <div style={s.backdrop}>
      <div data-qs="easy-card" style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
        <AutofillInput
          label="Product" placeholder="Product name"
          value={lookingUp ? '' : form.productName} onChange={form.setProductName}
          suggestions={form.productSuggestions} dark={dark}
        />
        {lookingUp && <p style={{ ...s.hint, color: C.textMuted }}>{LOOKING_UP_TEXT}</p>}
        {!lookingUp && form.nameSource && (
          <p style={{ ...s.hint, color: C.textMuted }}>
            {form.nameSource === 'drivers' ? NAME_FROM_DRIVERS : NAME_FROM_DATABASE}
          </p>
        )}

        <div style={s.row}>
          <span style={{ ...s.label, color: C.textSub }}>Qty</span>
          <div style={s.stepper}>
            <button type="button" aria-label="Less" style={stepBtn}
              onClick={() => form.setQty(String(Math.max(1, qtyNum - 1)))}>−</button>
            {/* Digits and one decimal point (2.5 lb, 1.5 cases). */}
            <input aria-label="Quantity" inputMode="decimal" style={{ ...field, width: 64, textAlign: 'center' }}
              value={form.qty} onChange={e => form.setQty(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} />
            <button type="button" aria-label="More" style={stepBtn}
              onClick={() => form.setQty(String(qtyNum + 1))}>+</button>
          </div>
        </div>

        <div style={s.row}>
          <span style={{ ...s.label, color: C.textSub }}>Price ($)</span>
          <input aria-label="Price" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
            style={{ ...field, width: 120, textAlign: 'right' }}
            value={form.price} onChange={e => form.setPrice(e.target.value)} />
        </div>

        {form.lastBarcode && <p style={{ ...s.barcode, background: C.tagBg, color: C.textMuted }}>Barcode: {form.lastBarcode}</p>}
        {form.error && <p style={{ ...s.error, color: C.danger }}>{form.error}</p>}
        {form.lookupUnavailable && (
          <button type="button" onClick={form.retryLookup} style={{ ...s.retry, color: ACCENT, borderColor: C.inputBorder }}>Try again</button>
        )}

        <div style={s.actions}>
          <button type="button" onClick={onCancel} style={{ ...s.secondary, background: C.inputBg, borderColor: C.inputBorder, color: C.text }}>Cancel</button>
          {form.replaceLineId && (
            <button type="button" onClick={onRemove} style={{ ...s.secondary, background: C.inputBg, borderColor: C.inputBorder, color: C.danger }}>Remove</button>
          )}
          <button type="button" onClick={onAdd} disabled={lookingUp}
            style={{ ...s.primary, background: ACCENT, opacity: lookingUp ? 0.5 : 1 }}>Add</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const s = {
  backdrop:  { position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  card:      { width: '100%', maxWidth: 'var(--form-max)', boxSizing: 'border-box', border: '1px solid', borderRadius: '20px 20px 0 0', padding: '18px 18px max(18px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 12 },
  hint:      { fontSize: 13, margin: '-6px 0 0' },
  row:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label:     { fontSize: 14, fontWeight: 600 },
  stepper:   { display: 'flex', alignItems: 'center', gap: 8 },
  stepBtn:   { width: 44, height: 44, borderRadius: 12, border: '1px solid', fontSize: 20, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  input:     { height: 46, fontSize: 16, padding: '0 12px', border: '1px solid', borderRadius: 12, outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' },
  barcode:   { fontSize: 12, padding: '3px 8px', borderRadius: 6, margin: 0, fontFamily: 'monospace', alignSelf: 'flex-start' },
  error:     { fontSize: 13, fontWeight: 600, margin: 0 },
  retry:     { alignSelf: 'flex-start', fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 8, background: 'transparent', border: '1px solid', cursor: 'pointer' },
  actions:   { display: 'flex', gap: 10, marginTop: 4 },
  secondary: { flex: 1, height: 48, borderRadius: 12, border: '1px solid', fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  primary:   { flex: 1.4, height: 48, borderRadius: 12, border: 'none', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
};
