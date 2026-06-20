/**
 * StoreBalance — dashboard for a single store showing total owed,
 * last delivery date, and full invoice history for that store.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, GRADIENT, STATUS, glassStyle, statusColors } from '../theme';
import { MS_PER_DAY as MS_DAY } from '../utils/constants';
import { getInvoices, updateInvoicePaymentStatus, getBusinessName } from '../utils/storage';
import { subtotalOf, getStatus, buildWhatsAppUrl } from '../utils/invoiceUtils';
import { getTotalPaid, getPaymentsFor, loadAllPaymentsFromCloud } from '../utils/paymentStorage';
import { triggerTip } from '../utils/tutorialProgress';

const STATUS_CYCLE = ['unpaid', 'paid', 'partial'];

// MS_DAY → shared MS_PER_DAY in constants (aliased on the import above).

/** Local-midnight Monday of the week containing d. */
function weekStartOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** "Jun 2 – Jun 8, 2026" label for the week starting at `start`. */
function weekLabel(start) {
  const end = new Date(start.getTime() + 6 * MS_DAY);
  const a = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const b = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${a} – ${b}`;
}

export default function StoreBalance({ storeName, onBack }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [sharing, setSharing]   = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = last week…
  const [, setPayments] = useState(0); // bumped after the payment ledger refreshes

  // Refresh the payment ledger so "received this week" is right on a fresh device.
  useEffect(() => {
    loadAllPaymentsFromCloud().then(() => setPayments(v => v + 1)).catch(() => {});
  }, []);

  // Layer 2 — point at the outstanding total the first time a store balance opens.
  useEffect(() => { triggerTip('d-store-balance'); }, []);

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

  // ── Weekly statement (Mon–Sun) ───────────────────────────────────────────
  const weekStart = new Date(weekStartOf(new Date()).getTime() + weekOffset * 7 * MS_DAY);
  const weekEndMs = weekStart.getTime() + 7 * MS_DAY;
  const inWeek = (t) => t >= weekStart.getTime() && t < weekEndMs;

  const weekInvoices = invoices.filter(inv => {
    const t = Date.parse(inv.date || '') || Date.parse(inv.createdAt || inv.created_at || '') || 0;
    return inWeek(t);
  });
  const weekBilled = weekInvoices.reduce((s, i) => s + subtotalOf(i), 0);
  // Payments logged this week across ALL of this store's invoices — a payment
  // made this week often settles an invoice billed in an earlier week.
  const weekReceived = invoices.reduce((sum, inv) =>
    sum + getPaymentsFor(inv.number || inv.invoice_number)
      .filter(p => inWeek(Date.parse(p.ts || '') || 0))
      .reduce((s, p) => s + Number(p.amount), 0)
  , 0);

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
    normalised.paidAmount = getTotalPaid(normalised.number);
    setSharing(normalised.number);
    try {
      // Lazy-load the PDF stack only when sharing.
      const { generateAndSharePDF } = await import('../utils/pdfGenerator');
      await generateAndSharePDF(normalised, targetTab);
    } catch { if (targetTab) targetTab.close(); }
    finally { setSharing(null); }
  }

  // Payment-status chip colors → shared statusColors() in theme.js

  /** Opens WhatsApp with a plain-text statement for the selected week. */
  function shareStatement() {
    const invLines = weekInvoices.map(inv => {
      const n = inv.number || inv.invoice_number;
      return `#${n} · ${inv.date} · $${subtotalOf(inv).toFixed(2)} (${STATUS[getStatus(inv)]?.label || getStatus(inv)})`;
    });
    const biz = getBusinessName();
    const lines = [
      `Weekly Statement — ${storeName}`,
      `Week of ${weekLabel(weekStart)}`,
      '',
      ...(invLines.length ? invLines : ['No deliveries this week.']),
      '',
      `Deliveries: ${weekInvoices.length}`,
      `Billed: $${weekBilled.toFixed(2)}`,
      `Payments received: $${weekReceived.toFixed(2)}`,
      '',
      `Outstanding balance: $${totalOwed.toFixed(2)}`,
      ...(biz ? ['', `— ${biz}`] : []),
    ];
    const phoneInv = invoices.find(i => i.storePhone || i.store_phone);
    const phone = phoneInv ? (phoneInv.storePhone || phoneInv.store_phone) : '';
    window.open(buildWhatsAppUrl(phone, lines.join('\n')), '_blank');
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
            <div data-tip="store-balance-total">
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

        {/* Weekly statement */}
        {invoices.length > 0 && (
          <div style={{ ...s.weekCard, background: C.card, borderColor: C.cardBorder }}>
            <div style={s.weekHead}>
              <p style={{ ...s.weekTitle, color: C.textMuted }}>Weekly Statement</p>
              <div style={s.weekNav}>
                <button
                  style={{ ...s.weekArrow, color: C.text, background: C.rowBg }}
                  onClick={() => setWeekOffset(o => o - 1)}
                  aria-label="Previous week"
                >‹</button>
                <button
                  style={{ ...s.weekArrow, color: C.text, background: C.rowBg, opacity: weekOffset === 0 ? 0.4 : 1 }}
                  onClick={() => setWeekOffset(o => o + 1)}
                  disabled={weekOffset === 0}
                  aria-label="Next week"
                >›</button>
              </div>
            </div>
            <p style={{ ...s.weekRange, color: C.text }}>
              {weekLabel(weekStart)}{weekOffset === 0 ? ' · this week' : ''}
            </p>
            <div style={s.weekStats}>
              <div style={s.weekStat}>
                <span style={{ ...s.weekStatVal, color: C.text }}>{weekInvoices.length}</span>
                <span style={{ ...s.weekStatLbl, color: C.textMuted }}>Deliveries</span>
              </div>
              <div style={s.weekStat}>
                <span style={{ ...s.weekStatVal, color: C.text }}>${weekBilled.toFixed(2)}</span>
                <span style={{ ...s.weekStatLbl, color: C.textMuted }}>Billed</span>
              </div>
              <div style={s.weekStat}>
                <span style={{ ...s.weekStatVal, color: weekReceived > 0 ? '#22c55e' : C.text }}>${weekReceived.toFixed(2)}</span>
                <span style={{ ...s.weekStatLbl, color: C.textMuted }}>Received</span>
              </div>
            </div>
            <button
              style={{ ...s.weekShareBtn, opacity: weekInvoices.length === 0 && weekReceived === 0 ? 0.5 : 1 }}
              onClick={shareStatement}
              disabled={weekInvoices.length === 0 && weekReceived === 0}
            >
              Share via WhatsApp
            </button>
          </div>
        )}

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
          const colors   = statusColors(getStatus(inv), dark);
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

  // Weekly statement
  weekCard: { borderRadius: 18, padding: '16px 18px', border: '1px solid' },
  weekHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  weekTitle: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', margin: 0,
  },
  weekNav: { display: 'flex', gap: 6 },
  weekArrow: {
    width: 32, height: 32, borderRadius: 9, border: 'none',
    fontSize: 17, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
  },
  weekRange: { fontSize: 16, fontWeight: 800, margin: '10px 0 14px' },
  weekStats: { display: 'flex', gap: 8 },
  weekStat: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  weekStatVal: { fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' },
  weekStatLbl: { fontSize: 11, fontWeight: 600 },
  weekShareBtn: {
    marginTop: 14, width: '100%', height: 44,
    background: ACCENT, border: 'none', borderRadius: 12,
    fontSize: 14, fontWeight: 700, color: '#fff',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
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
