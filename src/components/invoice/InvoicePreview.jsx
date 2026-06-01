import { LIGHT, DARK, ACCENT } from '../../theme';

export default function InvoicePreview({ items, onRemove, onEdit, dark = false }) {
  const C = dark ? DARK : LIGHT;
  const subtotal = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.price), 0);

  if (items.length === 0) {
    return (
      <div style={s.empty}>
        <p style={{ ...s.emptyText, color: C.textMuted }}>No items yet — add one above.</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ ...s.heading, color: C.textMuted }}>Items ({items.length})</p>
      <div style={s.list}>
        {items.map((item, idx) => (
          <div key={item.id} style={{
            ...s.row,
            borderBottomColor: C.divider,
            borderBottom: idx < items.length - 1 ? `1px solid ${C.divider}` : 'none',
          }}>
            <div style={s.rowMain}>
              <span style={{ ...s.itemName, color: C.text }}>{item.name}</span>
              <span style={{ ...s.itemMeta, color: C.textMuted }}>
                {item.qty} × ${Number(item.price).toFixed(2)}
              </span>
            </div>
            <div style={s.rowRight}>
              <span style={{ ...s.itemTotal, color: C.text }}>
                ${(Number(item.qty) * Number(item.price)).toFixed(2)}
              </span>
              {onEdit && (
                <button style={{ ...s.iconBtn, color: C.textMuted }} onClick={() => onEdit(item)}>✎</button>
              )}
              <button style={{ ...s.iconBtn, color: C.textMuted }} onClick={() => onRemove(item.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...s.subtotalBar, background: C.subtotalBar }}>
        <span style={{ ...s.subtotalLabel, color: C.subtotalText }}>Subtotal</span>
        <span style={{ ...s.subtotalAmt, color: C.subtotalText }}>${subtotal.toFixed(2)}</span>
      </div>
    </div>
  );
}

const s = {
  heading: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', margin: '0 0 10px',
  },
  list: { display: 'flex', flexDirection: 'column' },
  row: {
    display: 'flex', alignItems: 'center',
    paddingTop: 10, paddingBottom: 10, gap: 8,
  },
  rowMain: { flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  itemName: {
    fontSize: 14, fontWeight: 600,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  itemMeta: { fontSize: 12 },
  rowRight: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  itemTotal: { fontSize: 14, fontWeight: 700, minWidth: 52, textAlign: 'right' },
  iconBtn: {
    background: 'none', border: 'none', fontSize: 16,
    cursor: 'pointer', width: 30, height: 30,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 15, padding: 0, WebkitTapHighlightColor: 'transparent',
  },
  subtotalBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, padding: '12px 14px', borderRadius: 8,
  },
  subtotalLabel: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  subtotalAmt: { fontSize: 20, fontWeight: 800 },
  empty: { padding: '24px 0', textAlign: 'center' },
  emptyText: { fontSize: 14, margin: 0 },
};
