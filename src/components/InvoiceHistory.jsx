import { useState } from 'react';
import { getInvoices } from '../utils/storage';
import { generateAndSharePDF } from '../utils/pdfGenerator';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

export default function InvoiceHistory({ onOpenDrawer }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

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
    <div style={{ ...s.page, background: C.bg }}>
      <div style={{ ...s.header, background: C.header, borderBottomColor: C.headerBorder }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer} aria-label="Open menu">☰</button>
        <span style={{ ...s.title, color: C.text }}>Invoice History</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>
        {invoices.length === 0 ? (
          <div style={s.empty}>
            <span style={{ fontSize: 48 }}>📋</span>
            <p style={{ ...s.emptyText, color: C.textSub }}>No invoices yet.</p>
            <p style={{ ...s.emptySubText, color: C.textMuted }}>Generated invoices will appear here.</p>
          </div>
        ) : (
          invoices.map(inv => {
            const subtotal = inv.items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
            const isOpen = expanded === inv.number;
            return (
              <div key={inv.number} style={{ ...s.card, background: C.card }}>
                <button style={{ ...s.summaryRow }} onClick={() => toggle(inv.number)}>
                  <div style={s.summaryLeft}>
                    <span style={{ ...s.invoiceNum, color: C.text }}>Invoice #{inv.number}</span>
                    <span style={{ ...s.storeName, color: C.textSub }}>{inv.storeName}</span>
                    <span style={{ ...s.meta, color: C.textMuted }}>
                      {inv.date}{inv.time ? `  ·  ${inv.time}` : ''}
                    </span>
                  </div>
                  <div style={s.summaryRight}>
                    <span style={{ ...s.total, color: C.text }}>${subtotal.toFixed(2)}</span>
                    <span style={{ ...s.chevron, color: C.textMuted }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div style={s.detail}>
                    <div style={{ ...s.divider, background: C.divider }} />
                    {inv.businessPhone && (
                      <p style={{ ...s.detailMeta, color: C.textMuted }}>📞 {inv.businessPhone}</p>
                    )}
                    {inv.storePhone && (
                      <p style={{ ...s.detailMeta, color: C.textMuted }}>🏪 {inv.storePhone}</p>
                    )}
                    {inv.items.map((item, idx) => (
                      <div key={idx} style={s.itemRow}>
                        <span style={{ ...s.itemName, color: C.textSub }}>{item.name}</span>
                        <span style={{ ...s.itemDetail, color: C.textMuted }}>
                          {item.qty} × ${Number(item.price).toFixed(2)} = ${(item.qty * item.price).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <div style={{ ...s.totalRow, borderTopColor: C.divider }}>
                      <span style={{ color: C.text }}>Total</span>
                      <span style={{ ...s.totalAmt, color: C.text }}>${subtotal.toFixed(2)}</span>
                    </div>
                    <button
                      style={{ ...s.regenBtn, opacity: regenerating === inv.number ? 0.6 : 1 }}
                      onClick={() => handleRegenerate(inv)}
                      disabled={regenerating === inv.number}
                    >
                      {regenerating === inv.number ? 'Sharing…' : 'Share PDF'}
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

const s = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    borderBottom: '1px solid',
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
    cursor: 'pointer',
    padding: '2px 4px',
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 800,
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
  emptyText: { fontSize: 18, fontWeight: 700, margin: 0 },
  emptySubText: { fontSize: 14, margin: 0 },
  card: {
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
  invoiceNum: { fontSize: 15, fontWeight: 800 },
  storeName: { fontSize: 14, fontWeight: 600 },
  meta: { fontSize: 12 },
  summaryRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  total: { fontSize: 18, fontWeight: 800 },
  chevron: { fontSize: 11 },
  detail: { padding: '0 18px 18px' },
  divider: { height: 1, margin: '0 0 12px' },
  detailMeta: { fontSize: 13, margin: '0 0 6px' },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    gap: 8,
  },
  itemName: { fontSize: 14, fontWeight: 500 },
  itemDetail: { fontSize: 13, flexShrink: 0 },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 4,
    borderTop: '1px solid',
    fontSize: 15,
    fontWeight: 700,
  },
  totalAmt: { fontSize: 16, fontWeight: 800 },
  regenBtn: {
    width: '100%',
    marginTop: 14,
    height: 48,
    background: ACCENT,
    border: 'none',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
};
