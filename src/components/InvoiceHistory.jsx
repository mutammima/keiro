import { useState } from 'react';
import { getInvoices, updateInvoicePaymentStatus } from '../utils/storage';
import { generateAndSharePDF } from '../utils/pdfGenerator';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, STATUS } from '../theme';

const STATUS_CYCLE = ['unpaid', 'paid', 'partial'];

export default function InvoiceHistory({ onOpenDrawer }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [invoices, setInvoices] = useState(() => [...getInvoices()].reverse());
  const [expanded, setExpanded]     = useState(null);
  const [regenerating, setRegenerating] = useState(null);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  function toggle(id) { setExpanded(prev => (prev === id ? null : id)); }

  function cycleStatus(e, number) {
    e.stopPropagation();
    const inv = invoices.find(i => i.number === number);
    const cur = inv?.paymentStatus || 'unpaid';
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
    updateInvoicePaymentStatus(number, next);
    setInvoices(prev => prev.map(i => i.number === number ? { ...i, paymentStatus: next } : i));
  }

  async function handleShare(invoice) {
    setRegenerating(invoice.number);
    try { await generateAndSharePDF(invoice); }
    catch (e) { console.error(e); }
    finally { setRegenerating(null); }
  }

  const filtered = invoices.filter(inv => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || inv.storeName.toLowerCase().includes(q) || String(inv.number).includes(q);
    const matchStatus = statusFilter === 'all' || (inv.paymentStatus || 'unpaid') === statusFilter;
    return matchSearch && matchStatus;
  });

  function statusColors(status) {
    const key = status || 'unpaid';
    return dark ? STATUS[key]?.dark : STATUS[key]?.light;
  }

  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  return (
    <div style={{ ...s.page, background: C.bg }}>
      <div style={{ ...s.header, background: C.header, borderBottomColor: C.headerBorder }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer}>☰</button>
        <span style={{ ...s.title, color: C.text }}>History</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>
        {/* Search + filter bar */}
        <div style={{ ...s.filterBar, background: C.card, borderColor: C.cardBorder }}>
          <input
            style={{ ...s.searchInput, ...inp, borderColor: 'transparent', boxShadow: 'none' }}
            placeholder="Search by store or invoice #"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ ...s.filterDivider, background: C.divider }} />
          <div style={s.statusFilters}>
            {['all', 'unpaid', 'paid', 'partial'].map(f => (
              <button
                key={f}
                style={{
                  ...s.filterBtn,
                  background: statusFilter === f ? ACCENT : 'none',
                  color: statusFilter === f ? '#fff' : C.textMuted,
                }}
                onClick={() => setStatusFilter(f)}
              >
                {f === 'all' ? 'All' : STATUS[f]?.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={s.empty}>
            <p style={{ ...s.emptyText, color: C.textSub }}>
              {invoices.length === 0 ? 'No invoices yet.' : 'No results found.'}
            </p>
            <p style={{ ...s.emptySubText, color: C.textMuted }}>
              {invoices.length === 0 ? 'Generated invoices will appear here.' : 'Try a different search or filter.'}
            </p>
          </div>
        ) : (
          filtered.map(inv => {
            const subtotal = inv.items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
            const isOpen = expanded === inv.number;
            const sc = statusColors(inv.paymentStatus);

            return (
              <div key={inv.number} style={{ ...s.card, background: C.card, borderColor: C.cardBorder, boxShadow: C.cardShadow }}>
                <button style={s.summaryRow} onClick={() => toggle(inv.number)}>
                  <div style={s.summaryLeft}>
                    <div style={s.summaryTop}>
                      <span style={{ ...s.invoiceNum, color: C.text }}>#{inv.number}</span>
                      <button
                        style={{ ...s.statusBadge, background: sc?.bg, color: sc?.text }}
                        onClick={e => cycleStatus(e, inv.number)}
                        title="Tap to change status"
                      >
                        {STATUS[inv.paymentStatus || 'unpaid']?.label}
                      </button>
                    </div>
                    <span style={{ ...s.storeName, color: C.textSub }}>{inv.storeName}</span>
                    <span style={{ ...s.meta, color: C.textMuted }}>
                      {inv.date}{inv.time ? ` · ${inv.time}` : ''}
                    </span>
                  </div>
                  <div style={s.summaryRight}>
                    <span style={{ ...s.total, color: C.text }}>${subtotal.toFixed(2)}</span>
                    <span style={{ ...s.chevron, color: C.textMuted }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ ...s.detail, borderTopColor: C.divider }}>
                    {(inv.businessPhone || inv.storePhone || inv.storeAddress) && (
                      <div style={{ ...s.detailMeta, color: C.textMuted, marginBottom: 10 }}>
                        {inv.businessPhone && <span>From: {inv.businessPhone}</span>}
                        {inv.storePhone && <span>  ·  {inv.storePhone}</span>}
                        {inv.storeAddress && <div style={{ marginTop: 2 }}>{inv.storeAddress}</div>}
                      </div>
                    )}

                    {inv.items.map((item, idx) => (
                      <div key={idx} style={{ ...s.itemRow, borderBottomColor: C.divider }}>
                        <span style={{ ...s.itemName, color: C.textSub }}>{item.name}</span>
                        <span style={{ ...s.itemDetail, color: C.textMuted }}>
                          {item.qty} × ${Number(item.price).toFixed(2)}
                        </span>
                        <span style={{ ...s.itemAmt, color: C.text }}>
                          ${(item.qty * item.price).toFixed(2)}
                        </span>
                      </div>
                    ))}

                    <div style={{ ...s.totalRow, borderTopColor: C.divider }}>
                      <span style={{ color: C.textSub }}>Total</span>
                      <span style={{ ...s.totalAmt, color: C.text }}>${subtotal.toFixed(2)}</span>
                    </div>

                    {inv.notes && (
                      <div style={{ ...s.notesBox, background: C.rowBg, borderColor: C.divider }}>
                        <span style={{ ...s.notesLabel, color: C.textMuted }}>Notes</span>
                        <p style={{ ...s.notesText, color: C.textSub }}>{inv.notes}</p>
                      </div>
                    )}

                    <button
                      style={{ ...s.shareBtn, opacity: regenerating === inv.number ? 0.6 : 1 }}
                      onClick={() => handleShare(inv)}
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
  page: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' },
  header: {
    borderBottom: '1px solid',
    padding: '12px 16px 10px',
    paddingTop: 'max(12px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', padding: '3px 4px',
    WebkitTapHighlightColor: 'transparent', flexShrink: 0,
  },
  title: { flex: 1, fontSize: 17, fontWeight: 700, textAlign: 'center' },
  body: {
    padding: '14px 16px 48px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  filterBar: {
    borderRadius: 12, border: '1px solid', overflow: 'hidden',
  },
  searchInput: {
    width: '100%', boxSizing: 'border-box', height: 44,
    fontSize: 15, padding: '0 14px', border: 'none',
    outline: 'none', background: 'transparent',
  },
  filterDivider: { height: 1 },
  statusFilters: {
    display: 'flex', padding: '8px 8px',
    gap: 6,
  },
  filterBtn: {
    flex: 1, height: 30, border: 'none', borderRadius: 6,
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  empty: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', paddingTop: 60, gap: 6, textAlign: 'center',
  },
  emptyText: { fontSize: 17, fontWeight: 700, margin: 0 },
  emptySubText: { fontSize: 14, margin: 0 },
  card: { borderRadius: 12, border: '1px solid', overflow: 'hidden' },
  summaryRow: {
    width: '100%', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: '14px 16px',
    background: 'none', border: 'none', cursor: 'pointer',
    textAlign: 'left', gap: 8, WebkitTapHighlightColor: 'transparent',
    boxSizing: 'border-box',
  },
  summaryLeft: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  summaryTop: { display: 'flex', alignItems: 'center', gap: 8 },
  invoiceNum: { fontSize: 15, fontWeight: 700 },
  statusBadge: {
    fontSize: 11, fontWeight: 700, padding: '2px 8px',
    borderRadius: 20, border: 'none', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', flexShrink: 0,
    letterSpacing: '0.03em',
  },
  storeName: { fontSize: 14, fontWeight: 500 },
  meta: { fontSize: 12 },
  summaryRight: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    gap: 4, flexShrink: 0,
  },
  total: { fontSize: 17, fontWeight: 700 },
  chevron: { fontSize: 10 },
  detail: { padding: '12px 16px 16px', borderTop: '1px solid' },
  detailMeta: { fontSize: 12, lineHeight: 1.6 },
  itemRow: {
    display: 'flex', alignItems: 'center',
    paddingTop: 8, paddingBottom: 8,
    borderBottom: '1px solid', gap: 8,
  },
  itemName: { flex: 1, fontSize: 14, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemDetail: { fontSize: 12, flexShrink: 0 },
  itemAmt: { fontSize: 13, fontWeight: 600, flexShrink: 0, minWidth: 54, textAlign: 'right' },
  totalRow: {
    display: 'flex', justifyContent: 'space-between',
    paddingTop: 10, marginTop: 2,
    borderTop: '1px solid', fontSize: 14, fontWeight: 600,
  },
  totalAmt: { fontSize: 15, fontWeight: 700 },
  notesBox: {
    marginTop: 10, borderRadius: 8, border: '1px solid',
    padding: '8px 12px',
  },
  notesLabel: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  notesText: { fontSize: 13, margin: '3px 0 0', lineHeight: 1.5 },
  shareBtn: {
    width: '100%', marginTop: 12, height: 44,
    background: ACCENT, border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 700, color: '#fff',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
};
