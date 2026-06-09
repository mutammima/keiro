/**
 * StoreBalance — dashboard for a single store showing total owed,
 * last delivery date, and full invoice history for that store.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, GRADIENT, STATUS, glassStyle } from '../theme';
import { getInvoices, updateInvoicePaymentStatus } from '../utils/storage';
import { generateAndSharePDF } from '../utils/pdfGenerator';
import { subtotalOf, getStatus } from '../utils/invoiceUtils';

const STATUS_CYCLE = ['unpaid', 'paid', 'partial'];

export default function StoreBalance({ storeName, onBack }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [sharing, setSharing]   = useState(null);
  const [expanded, setExpanded] = useState(null);

  // Load invoices for this store async
  useEffect(() => {
    getInvoices().then(list => {
      const storeInvs = (list || []).filter(inv => {
        const sn = inv.storeName || inv.store_name;
        return sn === storeName;
      });
      // Ensure newest first
      setInvoices(storeInvs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [storeName]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const totalOwed = invoices
    .filter(i => getStatus(i) !== 'paid')
    .reduce((s, i) => s + subtotalOf(i), 0);
  const totalAll = invoices.reduce((s, i) => s + subtotalOf(i), 0);
  const lastDelivery = invoices[0]?.date ?? '—';
  const unpaidCount = invoices.filter(i => getStatus(i) === 'unpaid').length;
  const allClear = totalOwed === 0 && invoices.length > 0;

  // ── Actions ──────────────────────────────────────────────────────────────
  function cycleStatus(number) {
    const inv = invoices.find(i => (i.number || i.invoice_number) === number);
    const cur  = getStatus(inv);
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
    updateInvoicePaymentStatus(number, next).catch(e => console.error(e));
    setInvoices(prev => prev.map(i =>
      (i.number || i.invoice_number) === number
        ? { ...i, paymentStatus: next, payment_status: next }
        : i
    ));
  }

  async function handleShare(inv) {
    // Open tab synchronously (user gesture) before any async work
    const targetTab = window.open('', '_blank');
    const normalised = {
      ...inv,
      number: inv.number || inv.invoice_number,
      storeName: inv.storeName || inv.store_name,
      storePhone: inv.storePhone || inv.store_phone,
      storeAddress: inv.storeAddress || inv.store_address,
      businessName: inv.businessName || inv.business_name,
      businessPhone: inv.businessPhone || inv.business_phone,
      paymentStatus: getStatus(inv),
    };
    setSharing(normalised.number);
    try { await generateAndSharePDF(normalised, targetTab); } catch { if (targetTab) targetTab.close(); }
    finally { setSharing(null); }
  }

  function sc(status) {
    const key = status || 'unpaid';
    return dark ? STATUS[key]?.dark : STATUS[key]?.light;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ ...s.page, background: C.bg }}>

      {/* Sticky glass header */}
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <button style={{ ...s.backBtn, color: ACCENT }} onClick={onBack}>← Back</button>
        <span style={{ ...s.title, color: C.text }}>{storeName}</span>
        <div style={{ width: 60 }} />
      </div>

      <div style={s.body}>
        {/* Hero card */}
        <div style={{
          ...s.heroCard,
          background: allClear
            ? 'linear-gradient(135deg, #0D2B20 0%, #1a5c3a 100%)'
            : GRADIENT,
        }}>
          <div style={s.heroRow}>
            <div>
              <p style={s.heroLabel}>{allClear ? 'ALL CLEAR' : 'OUTSTANDING'}</p>
              <p style={s.heroAmt}>${totalOwed.toFixed(2)}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={s.heroLabel}>TOTAL BILLED</p>
              <p style={s.heroSub}>${totalAll.toFixed(2)}</p>
            </div>
          </div>
          <div style={s.heroPills}>
            <span style={s.heroPill}>{invoices.length} Invoice{invoices.length !== 1 ? 's' : ''}</span>
            {unpaidCount > 0 && <span style={s.heroPill}>{unpaidCount} Unpaid</span>}
            <span style={s.heroPill}>Last: {lastDelivery}</span>
          </div>
        </div>

        {/* Loading / empty / list */}
        {loading ? (
          <div style={s.empty}>
            <p style={{ ...s.emptyText, color: C.textMuted }}>Loading…</p>
          </div>
        ) : invoices.length === 0 ? (
          <div style={s.empty}>
            <p style={{ ...s.emptyText, color: C.textMuted }}>No invoices yet for this store.</p>
          </div>
        ) : invoices.map(inv => {
          const invNum   = inv.number || inv.invoice_number;
          const total    = subtotalOf(inv);
          const colors   = sc(getStatus(inv));
          const isOpen   = expanded === invNum;

          return (
            <div key={invNum} style={{ ...s.card, background: C.card }}>
              {/* Top row */}
              <div style={s.cardTop}>
                <div style={s.cardLeft}>
                  <span style={{ ...s.invNum, color: C.textMuted }}>#{invNum}</span>
                  <span style={{ ...s.invDate, color: C.textMuted }}>
                    {inv.date}{inv.time ? ` · ${inv.time}` : ''}
                  </span>
                </div>
                <span style={{ ...s.invTotal, color: C.text }}>${total.toFixed(2)}</span>
              </div>

              {/* Status badge */}
              <div style={s.cardFooter}>
                <button
                  style={{ ...s.statusBadge, background: colors?.bg, color: colors?.text }}
                  onClick={() => cycleStatus(invNum)}
                >
                  {STATUS[getStatus(inv)]?.label}
                </button>
                <button
                  style={{ ...s.expandBtn, color: C.textMuted }}
                  onClick={() => setExpanded(isOpen ? null : invNum)}
                >
                  {isOpen ? 'Collapse' : 'Details'}
                </button>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ ...s.expandedBody, borderTopColor: C.divider }}>
                  {(inv.items || []).map((item, idx) => (
                    <div key={idx} style={{ ...s.itemRow, borderBottomColor: C.divider }}>
                      <span style={{ ...s.itemName, color: C.textSub }}>{item.name}</span>
                      <span style={{ ...s.itemDetail, color: C.textMuted }}>
                        {item.qty} × ${Number(item.price).toFixed(2)}
                      </span>
                      <span style={{ ...s.itemTotal, color: C.text }}>
                        ${(item.qty * item.price).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {inv.notes && (
                    <p style={{ ...s.notes, color: C.textMuted }}>Note: {inv.notes}</p>
                  )}
                  <button
                    style={{ ...s.shareBtn, opacity: sharing === invNum ? 0.6 : 1 }}
                    onClick={() => handleShare(inv)}
                    disabled={!!sharing}
                  >
                    {sharing === invNum ? 'Sharing…' : 'Share PDF'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' },
  header: {
    padding: '14px 20px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    background: 'none', border: 'none', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', padding: '4px 0', WebkitTapHighlightColor: 'transparent',
  },
  title: { fontSize: 17, fontWeight: 700, textAlign: 'center', flex: 1 },
  body: {
    padding: '12px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },

  // Hero
  heroCard: { borderRadius: 20, padding: '20px 22px', color: '#fff' },
  heroRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
    textTransform: 'uppercase', opacity: 0.65, margin: '0 0 4px',
  },
  heroAmt: { fontSize: 36, fontWeight: 800, letterSpacing: -1, margin: 0 },
  heroSub: { fontSize: 22, fontWeight: 700, margin: 0 },
  heroPills: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 },
  heroPill: {
    fontSize: 11, fontWeight: 600, padding: '4px 11px',
    borderRadius: 20, background: 'rgba(255,255,255,0.15)',
  },

  // Invoice cards
  card: { borderRadius: 18, overflow: 'hidden' },
  cardTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px 8px',
  },
  cardLeft: { display: 'flex', flexDirection: 'column', gap: 2 },
  invNum: { fontSize: 12, fontWeight: 600 },
  invDate: { fontSize: 12 },
  invTotal: { fontSize: 20, fontWeight: 800 },
  cardFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px 14px',
  },
  statusBadge: {
    fontSize: 11, fontWeight: 700, padding: '4px 12px',
    borderRadius: 20, border: 'none', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  expandBtn: {
    background: 'none', border: 'none', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },

  // Expanded
  expandedBody: { borderTop: '1px solid', padding: '10px 16px 14px' },
  itemRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 0', borderBottom: '1px solid',
  },
  itemName: { flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemDetail: { fontSize: 12, flexShrink: 0 },
  itemTotal: { fontSize: 13, fontWeight: 600, minWidth: 52, textAlign: 'right' },
  notes: { fontSize: 13, margin: '10px 0 8px', lineHeight: 1.5 },
  shareBtn: {
    marginTop: 10, width: '100%', height: 44,
    background: ACCENT, border: 'none', borderRadius: 12,
    fontSize: 14, fontWeight: 700, color: '#fff',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },

  empty: { paddingTop: 48, textAlign: 'center' },
  emptyText: { fontSize: 15 },
};
