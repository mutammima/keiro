/**
 * DailyProgress — shows what was sold on any given day:
 *   • Total invoiced (expected revenue)
 *   • Amount received (paid invoices)
 *   • Amount pending (unpaid invoices)
 *   • Per-store breakdown
 * User can swipe between days using the date picker.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { getInvoices, updateInvoicePaymentStatus } from '../../utils/storage';
import AppFooter from '../navigation/AppFooter';

function formatDate(dateStr) {
  // dateStr is e.g. "May 30, 2026"
  return dateStr;
}

function dateKey(dateStr) {
  // Normalize to a sortable key
  try {
    return new Date(dateStr).toDateString();
  } catch {
    return dateStr;
  }
}

function totalItems(items) {
  return (items || []).reduce((s, i) => s + (i.qty * i.price), 0);
}

export default function DailyProgress({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [days, setDays]        = useState([]);   // sorted unique day strings newest-first
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    getInvoices().then(list => {
      const all = list || [];
      setInvoices(all);

      // Collect unique days
      const seen = new Set();
      const uniqueDays = [];
      all.forEach(inv => {
        const d = inv.date || '';
        if (d && !seen.has(dateKey(d))) {
          seen.add(dateKey(d));
          uniqueDays.push(d);
        }
      });
      setDays(uniqueDays);
      setSelectedDay(uniqueDays[0] || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const dayInvoices = invoices.filter(inv => dateKey(inv.date) === dateKey(selectedDay));

  const totalExpected = dayInvoices.reduce((s, inv) => s + totalItems(inv.items), 0);
  const totalReceived = dayInvoices
    .filter(inv => inv.paymentStatus === 'paid')
    .reduce((s, inv) => s + totalItems(inv.items), 0);
  const totalPending  = totalExpected - totalReceived;

  async function togglePayment(inv) {
    const newStatus = inv.paymentStatus === 'paid' ? 'unpaid' : 'paid';
    await updateInvoicePaymentStatus(inv.number, newStatus);
    setInvoices(prev => prev.map(i =>
      (i.number === inv.number) ? { ...i, paymentStatus: newStatus } : i
    ));
  }

  const inp = { background: C.inputBg, border: `1px solid ${C.inputBorder}`, color: C.text };

  return (
    <div style={{ ...s.page, background: C.bg }}>
      {/* Header */}
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer}>☰</button>
        <span style={{ ...s.title, color: C.text }}>Daily Progress</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>
        {loading ? (
          <p style={{ color: C.textMuted, textAlign: 'center', paddingTop: 60 }}>Loading…</p>
        ) : days.length === 0 ? (
          <div style={s.empty}>
            <p style={{ ...s.emptyTitle, color: C.textSub }}>No invoices yet.</p>
            <p style={{ ...s.emptyDesc, color: C.textMuted }}>Generate your first invoice to start tracking progress.</p>
          </div>
        ) : (
          <>
            {/* Day picker */}
            <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
              <p style={{ ...s.sectionLabel, color: C.textMuted }}>Select Day</p>
              <div style={s.dayScroll}>
                {days.map(d => (
                  <button
                    key={d}
                    style={{
                      ...s.dayChip,
                      background: dateKey(d) === dateKey(selectedDay) ? ACCENT : C.rowBg,
                      color: dateKey(d) === dateKey(selectedDay) ? '#fff' : C.textSub,
                    }}
                    onClick={() => setSelectedDay(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            <div style={s.statsRow}>
              <StatCard label="Expected" value={totalExpected} color={C.text} C={C} />
              <StatCard label="Received" value={totalReceived} color="#2ECC8A" C={C} />
              <StatCard label="Pending"  value={totalPending}  color={totalPending > 0 ? '#f59e0b' : C.textMuted} C={C} />
            </div>

            {/* Per-store breakdown */}
            {dayInvoices.length === 0 ? (
              <p style={{ color: C.textMuted, textAlign: 'center', paddingTop: 20 }}>No invoices on this day.</p>
            ) : (
              <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
                <p style={{ ...s.sectionLabel, color: C.textMuted }}>
                  {dayInvoices.length} Invoice{dayInvoices.length !== 1 ? 's' : ''}
                </p>
                {dayInvoices.map((inv, idx) => {
                  const amt = totalItems(inv.items);
                  const paid = inv.paymentStatus === 'paid';
                  return (
                    <div key={inv.number}>
                      {idx > 0 && <div style={{ height: 1, background: C.divider }} />}
                      <div style={s.invoiceRow}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...s.storeName, color: C.text }}>{inv.storeName}</p>
                          <p style={{ ...s.invMeta, color: C.textMuted }}>
                            #{inv.number} · {inv.time || ''}{inv.customerName ? ` · ${inv.customerName}` : ''}
                          </p>
                          <p style={{ ...s.invMeta, color: C.textMuted }}>
                            {(inv.items || []).map(i => `${i.qty}× ${i.name}`).join(', ')}
                          </p>
                        </div>
                        <div style={s.rightCol}>
                          <p style={{ ...s.invAmt, color: C.text }}>${amt.toFixed(2)}</p>
                          <button
                            style={{
                              ...s.statusBtn,
                              background: paid ? '#166534' : '#7c2d12',
                              color: paid ? '#4ade80' : '#fca5a5',
                            }}
                            onClick={() => togglePayment(inv)}
                          >
                            {paid ? 'Paid' : 'Unpaid'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <AppFooter onNav={onNav} />
      </div>
    </div>
  );
}

function StatCard({ label, value, color, C }) {
  return (
    <div style={{ ...s.statCard, background: C.card, borderColor: C.cardBorder }}>
      <p style={{ ...s.statLabel, color: C.textMuted }}>{label}</p>
      <p style={{ ...s.statValue, color }}>${value.toFixed(2)}</p>
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
  hamburger: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', padding: '3px 4px',
    WebkitTapHighlightColor: 'transparent',
  },
  title: { fontSize: 17, fontWeight: 700, textAlign: 'center', flex: 1 },
  body: {
    padding: '12px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 12,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  card: { borderRadius: 18, padding: '16px 18px', border: '1px solid' },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', margin: '0 0 12px',
  },
  dayScroll: {
    display: 'flex', flexWrap: 'wrap', gap: 8,
  },
  dayChip: {
    padding: '7px 14px', border: 'none', borderRadius: 20,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    whiteSpace: 'nowrap',
  },
  statsRow: {
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10,
  },
  statCard: {
    borderRadius: 16, padding: '14px 12px', border: '1px solid',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', margin: '0 0 6px',
  },
  statValue: {
    fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: -0.5,
  },
  invoiceRow: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '12px 0',
  },
  storeName: { fontSize: 15, fontWeight: 700, margin: '0 0 3px' },
  invMeta: { fontSize: 12, margin: '0 0 2px', lineHeight: 1.4 },
  rightCol: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  invAmt: { fontSize: 16, fontWeight: 800, margin: 0 },
  statusBtn: {
    fontSize: 11, fontWeight: 700, border: 'none',
    borderRadius: 8, padding: '4px 10px',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  empty: {
    paddingTop: 60, textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: 700, margin: 0 },
  emptyDesc: { fontSize: 13, margin: 0, maxWidth: 280, lineHeight: 1.5 },
};
