/**
 * LiveInvoicePreview — real-time invoice preview shown below the form.
 * Mirrors the InvoiceView document layout exactly so the user sees what
 * the final PDF will look like as they fill in the form.
 */

import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

export default function LiveInvoicePreview({
  businessName,
  businessPhone,
  storeName,
  storePhone,
  storeAddress,
  customerName,
  date,
  time,
  items,
  notes,
  paymentMethod,
}) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const subtotal = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.price), 0);

  const isEmpty =
    !storeName.trim() &&
    !customerName.trim() &&
    items.length === 0;

  return (
    <div style={{ ...s.wrapper, background: dark ? '#111114' : '#f1f1f1' }}>
      {/* Section label */}
      <p style={{ ...s.sectionLabel, color: C.textMuted }}>Live Preview</p>

      {isEmpty ? (
        <div style={{ ...s.emptyState }}>
          <p style={{ color: C.textMuted, fontSize: 14, margin: 0, textAlign: 'center', lineHeight: 1.6 }}>
            Fill in the form above{'\n'}and your invoice will appear here.
          </p>
        </div>
      ) : (
        <div style={{ ...s.doc, background: C.card, borderColor: C.cardBorder }}>

          {/* Business header */}
          <div style={s.bizBlock}>
            <p style={{ ...s.bizName, color: C.text }}>
              {businessName || <span style={{ color: C.textMuted, fontStyle: 'italic' }}>Your Business Name</span>}
            </p>
            {businessPhone ? (
              <p style={{ ...s.bizPhone, color: C.textMuted }}>{businessPhone}</p>
            ) : null}
          </div>

          <div style={{ ...s.rule, background: C.divider }} />

          {/* Meta row */}
          <div style={s.metaRow}>
            <div style={s.metaCell}>
              <span style={{ ...s.metaLabel, color: C.textMuted }}>Date</span>
              <span style={{ ...s.metaValue, color: C.text }}>{date || '—'}</span>
            </div>
            {time ? (
              <div style={s.metaCell}>
                <span style={{ ...s.metaLabel, color: C.textMuted }}>Time</span>
                <span style={{ ...s.metaValue, color: C.text }}>{time}</span>
              </div>
            ) : null}
            <div style={s.metaCell}>
              <span style={{ ...s.metaLabel, color: C.textMuted }}>Payment</span>
              <span style={{ ...s.metaValue, color: C.text, textTransform: 'capitalize' }}>
                {paymentMethod || 'cash'}
              </span>
            </div>
          </div>

          <div style={{ ...s.rule, background: C.divider }} />

          {/* Bill To */}
          <div style={s.billTo}>
            <span style={{ ...s.metaLabel, color: C.textMuted }}>Bill To</span>
            <p style={{ ...s.storeName, color: storeName.trim() ? C.text : C.textMuted, fontStyle: storeName.trim() ? 'normal' : 'italic' }}>
              {storeName.trim() || 'Store name'}
            </p>
            {customerName.trim() ? (
              <p style={{ ...s.storeDetail, color: C.textMuted }}>{customerName}</p>
            ) : null}
            {storePhone ? (
              <p style={{ ...s.storeDetail, color: C.textMuted }}>{storePhone}</p>
            ) : null}
            {storeAddress ? (
              <p style={{ ...s.storeDetail, color: C.textMuted }}>{storeAddress}</p>
            ) : null}
          </div>

          <div style={{ ...s.rule, background: C.divider }} />

          {/* Items table */}
          <div style={s.tableHead}>
            <span style={{ ...s.col1, ...s.colHead, color: C.textMuted }}>Item</span>
            <span style={{ ...s.colQ, ...s.colHead, color: C.textMuted }}>Qty</span>
            <span style={{ ...s.colP, ...s.colHead, color: C.textMuted }}>Price</span>
            <span style={{ ...s.colT, ...s.colHead, color: C.textMuted }}>Total</span>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '14px 0', textAlign: 'center' }}>
              <span style={{ color: C.textMuted, fontSize: 13, fontStyle: 'italic' }}>No items added yet</span>
            </div>
          ) : (
            items.map((item, idx) => (
              <div key={item.id} style={{
                ...s.tableRow,
                borderBottom: idx < items.length - 1 ? `1px solid ${C.divider}` : 'none',
                borderBottomColor: C.divider,
              }}>
                <span style={{ ...s.col1, color: C.text }}>{item.name}</span>
                <span style={{ ...s.colQ, color: C.textSub }}>{item.qty}</span>
                <span style={{ ...s.colP, color: C.textSub }}>${Number(item.price).toFixed(2)}</span>
                <span style={{ ...s.colT, color: C.text, fontWeight: 700 }}>
                  ${(Number(item.qty) * Number(item.price)).toFixed(2)}
                </span>
              </div>
            ))
          )}

          {/* Total */}
          {items.length > 0 && (
            <div style={{ ...s.totalRow, background: dark ? '#1e1e2e' : '#f0f4ff' }}>
              <span style={{ ...s.totalLabel, color: dark ? '#a0aec0' : '#4a5568' }}>Total Due</span>
              <span style={{ ...s.totalAmt, color: ACCENT }}>${subtotal.toFixed(2)}</span>
            </div>
          )}

          {/* Notes */}
          {notes?.trim() ? (
            <div style={{ ...s.notesBox, borderTopColor: C.divider }}>
              <span style={{ ...s.metaLabel, color: C.textMuted }}>Notes</span>
              <p style={{ ...s.notesText, color: C.textSub }}>{notes}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

const s = {
  wrapper: {
    padding: '4px 16px 24px',
    maxWidth: 480,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', margin: '0 0 10px',
  },
  emptyState: {
    padding: '32px 24px',
    textAlign: 'center',
  },
  doc: {
    borderRadius: 18,
    border: '1px solid',
    padding: '20px 18px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
  },
  bizBlock: { marginBottom: 14 },
  bizName: {
    fontSize: 17, fontWeight: 800,
    letterSpacing: 1, textTransform: 'uppercase',
    margin: '0 0 2px',
  },
  bizPhone: { fontSize: 13, margin: 0 },
  rule: { height: 1, margin: '12px 0' },
  metaRow: {
    display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 2,
  },
  metaCell: {
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  metaLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  metaValue: { fontSize: 13, fontWeight: 600 },
  billTo: { marginBottom: 2 },
  storeName: { fontSize: 15, fontWeight: 700, margin: '4px 0 2px' },
  storeDetail: { fontSize: 13, margin: '1px 0' },
  tableHead: {
    display: 'flex', paddingBottom: 8,
    borderBottom: '1px solid',
  },
  tableRow: {
    display: 'flex', alignItems: 'center',
    paddingTop: 9, paddingBottom: 9,
  },
  col1: { flex: 1, fontSize: 13, minWidth: 0, paddingRight: 8 },
  colQ: { width: 32, fontSize: 13, textAlign: 'center', flexShrink: 0 },
  colP: { width: 52, fontSize: 13, textAlign: 'right', flexShrink: 0 },
  colT: { width: 60, fontSize: 13, textAlign: 'right', flexShrink: 0 },
  colHead: {
    fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  totalRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, padding: '12px 14px', borderRadius: 10,
  },
  totalLabel: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  totalAmt: { fontSize: 22, fontWeight: 800 },
  notesBox: { marginTop: 14, paddingTop: 12, borderTop: '1px solid' },
  notesText: { fontSize: 13, margin: '4px 0 0', lineHeight: 1.5 },
};
