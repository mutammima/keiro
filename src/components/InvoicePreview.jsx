import { LIGHT, DARK } from '../theme';

export default function InvoicePreview({ items, onRemove, onEdit, dark = false }) {
  const C = dark ? DARK : LIGHT;

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.price), 0
  );

  if (items.length === 0) {
    return (
      <div style={s.empty}>
        <span style={s.emptyIcon}>📦</span>
        <p style={{ ...s.emptyText, color: C.textMuted }}>No items yet. Add one above.</p>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <h3 style={{ ...s.heading, color: C.textSub }}>Items ({items.length})</h3>

      <div style={s.list}>
        {items.map(item => (
          <div key={item.id} style={{ ...s.row, background: C.rowBg }}>
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
                <button
                  style={{ ...s.iconBtn, color: C.textLight }}
                  onClick={() => onEdit(item)}
                  aria-label={`Edit ${item.name}`}
                >
                  ✎
                </button>
              )}
              <button
                style={{ ...s.iconBtn, color: C.textMuted }}
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.name}`}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...s.subtotalBar, background: C.subtotalBar }}>
        <span style={{ ...s.subtotalLabel, color: C.subtotalText }}>Subtotal</span>
        <span style={{ ...s.subtotalAmount, color: C.subtotalText }}>${subtotal.toFixed(2)}</span>
      </div>
    </div>
  );
}

const s = {
  wrap: { marginTop: 8 },
  heading: {
    fontSize: 15,
    fontWeight: 700,
    margin: '0 0 8px',
    letterSpacing: 0.2,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    borderRadius: 10,
    padding: '12px 12px 12px 14px',
    gap: 8,
  },
  rowMain: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  itemName: {
    fontSize: 15,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemMeta: { fontSize: 13 },
  rowRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: 700,
    minWidth: 56,
    textAlign: 'right',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    padding: 0,
    WebkitTapHighlightColor: 'transparent',
  },
  subtotalBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    padding: '14px 16px',
    borderRadius: 12,
  },
  subtotalLabel: {
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  subtotalAmount: { fontSize: 22, fontWeight: 800 },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '32px 0',
    gap: 8,
  },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 15, margin: 0 },
};
