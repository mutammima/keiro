/**
 * Shows the list of items added so far + running subtotal.
 *
 * Props:
 *   items: [{ id, name, qty, price }]
 *   onRemove(id): removes an item
 */
export default function InvoicePreview({ items, onRemove }) {
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.price),
    0
  );

  if (items.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyIcon}>📦</span>
        <p style={styles.emptyText}>No items yet. Add one above.</p>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <h3 style={styles.heading}>Items ({items.length})</h3>

      <div style={styles.list}>
        {items.map((item) => (
          <div key={item.id} style={styles.row}>
            <div style={styles.rowMain}>
              <span style={styles.itemName}>{item.name}</span>
              <span style={styles.itemMeta}>
                {item.qty} × ${Number(item.price).toFixed(2)}
              </span>
            </div>
            <div style={styles.rowRight}>
              <span style={styles.itemTotal}>
                ${(Number(item.qty) * Number(item.price)).toFixed(2)}
              </span>
              <button
                style={styles.removeBtn}
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.name}`}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.subtotalBar}>
        <span style={styles.subtotalLabel}>Subtotal</span>
        <span style={styles.subtotalAmount}>${subtotal.toFixed(2)}</span>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    marginTop: 8,
  },
  heading: {
    fontSize: 15,
    fontWeight: 700,
    color: '#444',
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
    background: '#f7f7f7',
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
    color: '#111',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemMeta: {
    fontSize: 13,
    color: '#777',
  },
  rowRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: 700,
    color: '#222',
    minWidth: 60,
    textAlign: 'right',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#aaa',
    fontSize: 16,
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
    background: '#111',
    borderRadius: 12,
    color: '#fff',
  },
  subtotalLabel: {
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  subtotalAmount: {
    fontSize: 22,
    fontWeight: 800,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '32px 0',
    gap: 8,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyText: {
    color: '#aaa',
    fontSize: 15,
    margin: 0,
  },
};
