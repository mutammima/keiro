/**
 * Reports — business analytics at a glance.
 *
 * Shows:
 *  • This week / this month totals + collected vs pending
 *  • Top 5 stores by revenue
 *  • Top 5 products by units sold
 *  • A simple 7-day bar chart
 *
 * All derived from invoices — no extra DB tables needed.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';
import { getInvoices } from '../utils/storage';
import { isGuest } from '../utils/guestMode';
import { GuestBanner } from '../components/auth/GuestUpsell';
import AppFooter from '../components/navigation/AppFooter';

// ── Helpers ───────────────────────────────────────────────────────────────────

function invTotal(inv) {
  return (inv.items || []).reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
}

function isPaid(inv) {
  return (inv.paymentStatus || inv.payment_status || 'unpaid') === 'paid';
}

function startOfWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d;
}

function startOfMonth() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

function parseInvDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d) ? null : d;
}

// Last N calendar days (today = index N-1)
function last7DayLabels() {
  const labels = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
  }
  return labels;
}

// Today helpers
function isToday(dateStr) {
  const d = parseInvDate(dateStr);
  if (!d) return false;
  return d.toDateString() === new Date().toDateString();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Reports({ onOpenDrawer, onNav, embedded }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [range, setRange]      = useState('today'); // 'today' | 'week' | 'month' | 'year'

  useEffect(() => {
    getInvoices()
      .then(list => { setInvoices(list || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // ── Today stats ────────────────────────────────────────────────────────────
  const todayInvoices  = invoices.filter(inv => isToday(inv.date));
  const todayTotal     = todayInvoices.reduce((s, inv) => s + invTotal(inv), 0);
  const todayCollected = todayInvoices.filter(isPaid).reduce((s, inv) => s + invTotal(inv), 0);
  const todayPending   = todayTotal - todayCollected;

  // ── Filter by range ────────────────────────────────────────────────────────
  function startOfYear() {
    const d = new Date(); d.setHours(0,0,0,0); d.setMonth(0,1); return d;
  }

  const cutoff = range === 'today' ? (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })()
               : range === 'week'  ? startOfWeek()
               : range === 'month' ? startOfMonth()
               : range === 'year'  ? startOfYear()
               : null;

  const filtered = range === 'today'
    ? invoices.filter(inv => isToday(inv.date))
    : cutoff
      ? invoices.filter(inv => { const d = parseInvDate(inv.date); return d && d >= cutoff; })
      : invoices;

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalRev    = filtered.reduce((s, inv) => s + invTotal(inv), 0);
  const collected   = filtered.filter(isPaid).reduce((s, inv) => s + invTotal(inv), 0);
  const pending     = totalRev - collected;
  const invoiceCount = filtered.length;

  // ── Top stores ─────────────────────────────────────────────────────────────
  const storeMap = {};
  filtered.forEach(inv => {
    const name = inv.storeName || inv.store_name || 'Unknown';
    storeMap[name] = (storeMap[name] || 0) + invTotal(inv);
  });
  const topStores = Object.entries(storeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxStoreVal = topStores[0]?.[1] || 1;

  // ── Top products ───────────────────────────────────────────────────────────
  const productMap = {};
  filtered.forEach(inv => {
    (inv.items || []).forEach(item => {
      const name = item.name || 'Unknown';
      if (!productMap[name]) productMap[name] = { units: 0, revenue: 0 };
      productMap[name].units   += Number(item.qty);
      productMap[name].revenue += Number(item.qty) * Number(item.price);
    });
  });
  const topProducts = Object.entries(productMap)
    .sort((a, b) => b[1].units - a[1].units)
    .slice(0, 5);
  const maxProductUnits = topProducts[0]?.[1].units || 1;

  // ── Month-over-month ──────────────────────────────────────────────────────────
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const thisMonthRev = invoices.filter(inv => {
    const d = parseInvDate(inv.date); return d && d >= thisMonthStart;
  }).reduce((s, inv) => s + invTotal(inv), 0);

  const lastMonthRev = invoices.filter(inv => {
    const d = parseInvDate(inv.date); return d && d >= lastMonthStart && d <= lastMonthEnd;
  }).reduce((s, inv) => s + invTotal(inv), 0);

  const momDiff = thisMonthRev - lastMonthRev;
  const momPct  = lastMonthRev > 0 ? (momDiff / lastMonthRev) * 100 : null;

  // ── 7-day chart ─────────────────────────────────────────────────────────────
  const dayLabels = last7DayLabels();
  const dayTotals = dayLabels.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return invoices.reduce((s, inv) => {
      const invDate = parseInvDate(inv.date);
      if (!invDate) return s;
      if (invDate.toDateString() === d.toDateString()) return s + invTotal(inv);
      return s;
    }, 0);
  });
  const maxDay = Math.max(...dayTotals, 1);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...s.page, ...(embedded ? { minHeight: '100%' } : null), background: C.bg }}>
      {!embedded && (
        <div style={{ ...s.header, ...glassStyle(dark) }}>
          <button style={{ ...s.hamburger, color: C.text }} aria-label="Open menu" onClick={onOpenDrawer}>☰</button>
          <span style={{ ...s.title, color: C.text }}>Reports</span>
          <div style={{ width: 36 }} />
        </div>
      )}

      <div style={s.body}>

        {isGuest() && <GuestBanner />}

        {/* Range toggle — Today / This Week / This Month / This Year */}
        <div style={{ ...s.segmented, background: dark ? '#1a1a1a' : '#e0e0e0' }}>
          {[['today','Today'],['week','Week'],['month','Month'],['year','Year']].map(([val, label]) => (
            <button
              key={val}
              style={{
                ...s.seg,
                background: range === val ? (dark ? '#2a2a2a' : '#fff') : 'none',
                color: range === val ? C.text : C.textMuted,
                boxShadow: range === val ? (dark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.12)') : 'none',
              }}
              onClick={() => setRange(val)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Today panel — shown when Today tab is active */}
        {range === 'today' && loading && (
          <p style={{ color: C.textMuted, textAlign: 'center', paddingTop: 40 }}>Loading…</p>
        )}
        {range === 'today' && !loading && (
          <div style={{
            borderRadius: 20,
            background: dark ? '#0d0d0d' : '#fff',
            border: `1px solid ${C.cardBorder || C.divider}`,
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: ACCENT, borderRadius: '4px 0 0 4px' }} />
            <div style={{ paddingLeft: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <p style={{ ...s.sectionLabel, color: C.textMuted, margin: '0 0 4px' }}>Today's Total</p>
                  <p style={{ color: C.text, fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
                    ${todayTotal.toFixed(2)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: C.textMuted, fontSize: 12, margin: '0 0 4px' }}>
                    {todayInvoices.length} invoice{todayInvoices.length !== 1 ? 's' : ''}
                  </p>
                  <p style={{ fontSize: 12, margin: 0, color: C.textMuted }}>
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
              {todayTotal > 0 ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, background: dark ? '#0D2B20' : '#f0fdf4', borderRadius: 10, padding: '8px 12px' }}>
                    <p style={{ color: dark ? '#888' : '#86efac', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 3px' }}>Collected</p>
                    <p style={{ color: dark ? '#2ECC8A' : '#16a34a', fontSize: 16, fontWeight: 800, margin: 0 }}>${todayCollected.toFixed(2)}</p>
                  </div>
                  <div style={{ flex: 1, background: dark ? '#1f1000' : '#fffbeb', borderRadius: 10, padding: '8px 12px' }}>
                    <p style={{ color: dark ? '#888' : '#fde68a', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 3px' }}>Pending</p>
                    <p style={{ color: dark ? '#fbbf24' : '#b45309', fontSize: 16, fontWeight: 800, margin: 0 }}>${todayPending.toFixed(2)}</p>
                  </div>
                </div>
              ) : (
                <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>No invoices yet today.</p>
              )}
              {todayInvoices.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {todayInvoices.map((inv, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: C.textSub, fontSize: 13, fontWeight: 500 }}>{inv.storeName}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>${invTotal(inv).toFixed(2)}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
                          background: isPaid(inv) ? (dark ? '#0D2B20' : '#f0fdf4') : (dark ? '#2d0a0a' : '#fef2f2'),
                          color: isPaid(inv) ? (dark ? '#2ECC8A' : '#16a34a') : (dark ? '#f87171' : '#dc2626'),
                        }}>
                          {isPaid(inv) ? 'PAID' : 'UNPAID'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {range !== 'today' && (loading ? (
          <p style={{ color: C.textMuted, textAlign: 'center', paddingTop: 40 }}>Loading…</p>
        ) : invoices.length === 0 ? (
          <EmptyState C={C} />
        ) : (
          <>
            {/* Summary cards */}
            <div style={s.statsGrid}>
              <StatCard label="Revenue" value={`$${totalRev.toFixed(2)}`} sub={`${invoiceCount} invoice${invoiceCount !== 1 ? 's' : ''}`} color={C.text} C={C} big />
              <StatCard label="Collected" value={`$${collected.toFixed(2)}`} sub={totalRev > 0 ? `${Math.round(collected / totalRev * 100)}%` : '—'} color="#2ECC8A" C={C} />
              <StatCard label="Pending"   value={`$${pending.toFixed(2)}`}   sub={pending > 0 ? 'owed' : 'all clear'} color={pending > 0 ? '#f59e0b' : C.textMuted} C={C} />
            </div>

            {/* Month-over-month comparison */}
            {(thisMonthRev > 0 || lastMonthRev > 0) && (
              <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
                <p style={{ ...s.sectionLabel, color: C.textMuted }}>Month vs Last Month</p>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, background: dark ? '#1a1a1a' : '#f4f4f5', borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                      {now.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>${thisMonthRev.toFixed(0)}</div>
                  </div>
                  <div style={{ flex: 1, background: dark ? '#1a1a1a' : '#f4f4f5', borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                      {new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: C.textMuted }}>${lastMonthRev.toFixed(0)}</div>
                  </div>
                </div>
                {momPct !== null && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
                    background: momDiff >= 0 ? (dark ? '#0D2B20' : '#f0fdf4') : (dark ? '#2d0a0a' : '#fef2f2'),
                  }}>
                    <span style={{ fontSize: 18 }}>{momDiff >= 0 ? '▲' : '▼'}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: momDiff >= 0 ? (dark ? '#2ECC8A' : '#16a34a') : (dark ? '#f87171' : '#dc2626') }}>
                      {momDiff >= 0 ? '+' : ''}{momPct.toFixed(1)}% vs last month
                    </span>
                    <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 'auto' }}>
                      {momDiff >= 0 ? '+' : ''}${Math.abs(momDiff).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 7-day bar chart */}
            <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
              <p style={{ ...s.sectionLabel, color: C.textMuted }}>Last 7 Days</p>
              <div style={s.chartRow}>
                {dayTotals.map((val, i) => (
                  <div key={i} style={s.barCol}>
                    <div style={{ ...s.barTrack, background: dark ? '#1e1e1e' : '#e8e8e8' }}>
                      <div style={{
                        ...s.barFill,
                        height: `${Math.max(4, (val / maxDay) * 100)}%`,
                        background: i === 6 ? ACCENT : (dark ? '#2a2a2a' : '#d0d0d0'),
                        transition: 'height 0.6s ease',
                      }} />
                    </div>
                    {val > 0 && (
                      <span style={{ ...s.barAmt, color: i === 6 ? ACCENT : C.textMuted }}>
                        ${val >= 100 ? Math.round(val) : val.toFixed(0)}
                      </span>
                    )}
                    <span style={{ ...s.barLabel, color: i === 6 ? C.text : C.textMuted }}>
                      {dayLabels[i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top stores */}
            {topStores.length > 0 && (
              <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
                <p style={{ ...s.sectionLabel, color: C.textMuted }}>Top Stores</p>
                {topStores.map(([name, rev], i) => (
                  <div key={name} style={{ marginBottom: i < topStores.length - 1 ? 14 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{name}</span>
                      <span style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>${rev.toFixed(2)}</span>
                    </div>
                    <div style={{ ...s.barRow, background: dark ? '#1e1e1e' : '#e8e8e8' }}>
                      <div style={{
                        height: '100%',
                        width: `${(rev / maxStoreVal) * 100}%`,
                        background: ACCENT,
                        borderRadius: 4,
                        opacity: 0.75 + 0.25 * (1 - i / 5),
                        transition: 'width 0.6s ease',
                        minWidth: 4,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Top products */}
            {topProducts.length > 0 && (
              <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
                <p style={{ ...s.sectionLabel, color: C.textMuted }}>Top Products</p>
                {topProducts.map(([name, data], i) => (
                  <div key={name}>
                    {i > 0 && <div style={{ height: 1, background: C.divider, margin: '10px 0' }} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ color: C.text, fontSize: 13, fontWeight: 600, flex: 1, marginRight: 8 }}>{name}</span>
                      <span style={{ color: C.textMuted, fontSize: 12 }}>{data.units} units</span>
                      <span style={{ color: C.text, fontSize: 13, fontWeight: 700, marginLeft: 12 }}>${data.revenue.toFixed(2)}</span>
                    </div>
                    <div style={{ ...s.barRow, background: dark ? '#1e1e1e' : '#e8e8e8' }}>
                      <div style={{
                        height: '100%',
                        width: `${(data.units / maxProductUnits) * 100}%`,
                        background: '#7c3aed',
                        borderRadius: 4,
                        opacity: 0.7 + 0.3 * (1 - i / 5),
                        transition: 'width 0.6s ease',
                        minWidth: 4,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filtered.length === 0 && (
              <p style={{ color: C.textMuted, textAlign: 'center', paddingTop: 20, fontSize: 14 }}>
                No invoices in this period.
              </p>
            )}
          </>
        ))}

        <AppFooter onNav={onNav} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, C, big }) {
  return (
    <div style={{ ...s.statCard, background: C.card, borderColor: C.cardBorder, gridColumn: big ? 'span 2' : undefined }}>
      <p style={{ ...s.statLabel, color: C.textMuted }}>{label}</p>
      <p style={{ ...s.statValue, color, fontSize: big ? 26 : 18 }}>{value}</p>
      {sub && <p style={{ ...s.statSub, color: C.textMuted }}>{sub}</p>}
    </div>
  );
}

function EmptyState({ C }) {
  return (
    <div style={{ paddingTop: 60, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <p style={{ fontSize: 17, fontWeight: 700, color: C.textSub, margin: 0 }}>No data yet.</p>
      <p style={{ fontSize: 13, color: C.textMuted, margin: 0, maxWidth: 260, lineHeight: 1.5 }}>
        Reports populate automatically once you start generating invoices.
      </p>
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
  hamburger: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: '3px 4px', WebkitTapHighlightColor: 'transparent' },
  title: { fontSize: 17, fontWeight: 700, textAlign: 'center', flex: 1 },
  body: {
    padding: '12px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 12,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  segmented: {
    display: 'flex', borderRadius: 12, padding: 4, gap: 4,
  },
  seg: {
    flex: 1, background: 'none', border: 'none',
    padding: '8px 4px', borderRadius: 9,
    fontSize: 13, fontWeight: 500,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.15s',
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
  },
  statCard: {
    borderRadius: 16, padding: '14px 16px', border: '1px solid',
  },
  statLabel: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 5px' },
  statValue: { fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 },
  statSub: { fontSize: 11, margin: '4px 0 0', fontWeight: 500 },
  card: { borderRadius: 18, padding: '16px 18px', border: '1px solid' },
  sectionLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' },
  chartRow: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, height: 100 },
  barCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%' },
  barTrack: { flex: 1, width: '100%', borderRadius: 6, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: '6px 6px 0 0', minHeight: 4 },
  barAmt: { fontSize: 9, fontWeight: 700, lineHeight: 1 },
  barLabel: { fontSize: 10, fontWeight: 500 },
  barRow: { height: 6, borderRadius: 4, overflow: 'hidden' },
};
