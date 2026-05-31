import { useState } from 'react';
import { getInvoices } from '../utils/storage';
import { generateAndSharePDF } from '../utils/pdfGenerator';

export default function InvoiceHistory({ onOpenDrawer }) {
  const [invoices] = useState(() => [...getInvoices()].reverse());
  const [expanded, setExpanded] = useState(null);
  const [regenerating, setRegenerating] = useState(null);

  function toggle(id) {
    setExpanded(prev => (prev === id ? null : id));
  }

  async function handleRegenerate(invoice) {
    setRegenerating(invoice.number);
    try {
      await generateAndSharePDF(invoice);
    } catch (e) {
      console.error(e);
    } finally {
      setRegenerating(null);
    }
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.hamburger} onClick={onOpenDrawer} aria-label="Open menu">☰</button>
        <span style={styles.title}>Invoice History</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={styles.body}>
        {invoices.length === 0 ? (
          <div style={styles.empty}>
            <span style={{ fontSize: 48 }}>📋</span>
            <p style={styles.emptyText}>No invoices yet.</p>
            <p style={styles.emptySubText}>Generated invoices will appear here.</p>
          </div>
        ) : (
          invoices.map(inv => {
            const subtotal = inv.items.reduce(
              (s, i) => s + Number(i.qty) * Number(i.price), 0
            );
            const isOpen = expanded === inv.number;
            return (
              <div key={inv.number} style={styles.card}>
                {/* Summary row */}
                <button style={styles.summaryRow} onClick={() => toggle(inv.number)}>
                  <div style={styles.summaryLeft}>
                    <span style={styles.invoiceNum}>Invoice #{inv.number}</span>
                    <span style={styles.storeName}>{inv.storeName}</span>
                    <span style={styles.meta}>
                      {inv.date}{inv.time ? `  ·  ${inv.time}` : ''}
                    </span>
                  </div>
                  <div style={styles.summaryRight}>
                    <span style={styles.total}>${subtotal.toFixed(2)}</span>
                    <span style={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={styles.detail}>
                    <div style={styles.divider} />
                    {inv.businessPhone && (
                      <p style={styles.detailMeta}>📞 {inv.businessPhone}</p>
                    )}
                    {inv.storePhone && (
                      <p style={styles.detailMeta}>🏪 {inv.storePhone}</p>
                    )}
                    {inv.items.map((item, idx) => (
                      <div key={idx} style={styles.itemRow}>
                        <span style={styles.itemName}>{item.name}</span>
                        <span style={styles.itemDetail}>
                          {item.qty} × ${Number(item.price).toFixed(2)} = ${(item.qty * item.price).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <div style={styles.totalRow}>
                      <span>Total</span>
                      <span style={styles.totalAmt}>${subtotal.toFixed(2)}</span>
                    </div>
                    <button
                      style={{ ...styles.regenBtn, opacity: regenerating === inv.number ? 0.6 : 1 }}
                      onClick={() => handleRegenerate(inv)}
                      disabled={regenerating === inv.number}
                    >
                      {regenerating === inv.number ? 'Sharing…' : '📤 Share PDF'}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100dvh',
    background: '#f2f2f7',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    background: '#fff',
    borderBottom: '1px solid #e5e5e5',
    padding: '14px 16px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  hamburger: {
    background: 'none',
    border: 'none',
    fontSize: 24,
    color: '#333',
    cursor: 'pointer',
    padding: '2px 4px',
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 800,
    color: '#111',
    textAlign: 'center',
  },
  body: {
    padding: '16px 16px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxWidth: 480,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyText: { fontSize: 18, fontWeight: 700, color: '#555', margin: 0 },
  emptySubText: { fontSize: 14, color: '#aaa', margin: 0 },
  card: {
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    overflow: 'hidden',
  },
  summaryRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 18px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    gap: 8,
    WebkitTapHighlightColor: 'transparent',
    boxSizing: 'border-box',
  },
  summaryLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  invoiceNum: { fontSize: 15, fontWeight: 800, color: '#111' },
  storeName: { fontSize: 14, fontWeight: 600, color: '#444' },
  meta: { fontSize: 12, color: '#999' },
  summaryRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  total: { fontSize: 18, fontWeight: 800, color: '#111' },
  chevron: { fontSize: 11, color: '#bbb' },
  detail: { padding: '0 18px 18px' },
  divider: { height: 1, background: '#f0f0f0', margin: '0 0 12px' },
  detailMeta: { fontSize: 13, color: '#777', margin: '0 0 6px' },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    gap: 8,
  },
  itemName: { fontSize: 14, color: '#333', fontWeight: 500 },
  itemDetail: { fontSize: 13, color: '#777', flexShrink: 0 },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 4,
    borderTop: '1px solid #f0f0f0',
    fontSize: 15,
    fontWeight: 700,
    color: '#111',
  },
  totalAmt: { fontSize: 16, fontWeight: 800 },
  regenBtn: {
    width: '100%',
    marginTop: 14,
    height: 48,
    background: '#1a73e8',
    border: 'none',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
};
