/**
 * Home — Visual dashboard.
 *
 * Sections:
 *   1. Today strip     — Today's Total | Collected | # Invoices
 *   2. 7-Day Bar Chart — daily revenue for the last week + week total
 *   3. Collection Ring — donut % paid + collected / owed stats
 *   4. Overdue alert   — if any unpaid invoices > 7 days old
 *   5. Pinned Stores   — outstanding balance per pinned store
 *   6. Top Products    — horizontal progress bars, this month
 *
 * Quick Actions removed per request.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';
import { getInvoices, getPinnedStores, getBusinessName } from '../utils/storage';
import AppFooter from '../components/navigation/AppFooter';
import { BarChart, DonutRing, HorizBar, PRODUCT_COLORS } from '../components/dashboard/DashboardCharts';
import { subtotalOf, getStatus, formatInvoiceDate as dateStr, isOverdue, getFlagDays } from '../utils/invoiceUtils';
import { isGuest } from '../utils/guestMode';
import { GuestBanner } from '../components/auth/GuestUpsell';
import KeiroWordmark from '../components/ui/KeiroWordmark';

// ─── helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [invoices, setInvoices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const pinned  = getPinnedStores();
  const bizName = getBusinessName() || 'Keiro';

  useEffect(() => {
    getInvoices().then(list => {
      setInvoices(Array.isArray(list) ? list : []);
      setLoading(false);
    });
  }, []);

  // ── Today stats ─────────────────────────────────────────────────────────────
  const today         = dateStr(new Date());
  const todayInvoices = invoices.filter(inv => inv.date === today);
  const todayTotal    = todayInvoices.reduce((s, inv) => s + subtotalOf(inv), 0);
  const todayCollected = todayInvoices
    .filter(inv => getStatus(inv) === 'paid')
    .reduce((s, inv) => s + subtotalOf(inv), 0);

  // ── All-time collection ──────────────────────────────────────────────────────
  const totalPaid  = invoices
    .filter(inv => getStatus(inv) === 'paid')
    .reduce((s, inv) => s + subtotalOf(inv), 0);
  const totalOwed  = invoices
    .filter(inv => getStatus(inv) !== 'paid')
    .reduce((s, inv) => s + subtotalOf(inv), 0);
  const unpaidCount = invoices.filter(inv => getStatus(inv) === 'unpaid').length;
  const paidCount   = invoices.filter(inv => getStatus(inv) === 'paid').length;

  // ── Overdue ──────────────────────────────────────────────────────────────────
  const flagDays = getFlagDays();
  const overdueCount = invoices.filter(inv => isOverdue(inv, flagDays)).length;

  // ── Last 7 days (bar chart) ──────────────────────────────────────────────────
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const ds  = dateStr(d);
    const tot = invoices
      .filter(inv => inv.date === ds)
      .reduce((s, inv) => s + subtotalOf(inv), 0);
    return { label: DAY_LABELS[d.getDay()], total: tot, isToday: i === 6 };
  });
  const weekTotal = last7.reduce((s, d) => s + d.total, 0);

  // ── Top 5 products this month (horizontal bars) ───────────────────────────────
  const thisMonth = new Date().getMonth();
  const thisYear  = new Date().getFullYear();
  const productQty = {};
  invoices.forEach(inv => {
    const d = new Date(inv.date);
    if (isNaN(d) || d.getMonth() !== thisMonth || d.getFullYear() !== thisYear) return;
    (inv.items || []).forEach(item => {
      productQty[item.name] = (productQty[item.name] || 0) + Number(item.qty);
    });
  });
  const topProducts = Object.entries(productQty).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxQty = topProducts[0]?.[1] || 1;

  // ── Pinned store balances ────────────────────────────────────────────────────
  const storeBalance = {};
  invoices.forEach(inv => {
    const sn = inv.storeName || inv.store_name;
    if (!sn) return;
    if (!storeBalance[sn]) storeBalance[sn] = 0;
    if (getStatus(inv) !== 'paid') storeBalance[sn] += subtotalOf(inv);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: C.bg }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))',
        borderBottom: `1px solid ${C.divider}`,
        flexShrink: 0,
        background: C.bg,
      }}>
        <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.text, padding: '4px 6px', WebkitTapHighlightColor: 'transparent', lineHeight: 1 }} onClick={onOpenDrawer}>☰</button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text }}>{bizName}</span>
        <button
          data-tutorial="tab-new"
          style={{ background: ACCENT, border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, padding: '7px 16px', borderRadius: 20, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          onClick={() => onNav('invoice')}
        >+ New</button>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 88 }}>

        {isGuest() && (
          <div style={{ margin: '14px 16px 0' }}>
            <GuestBanner />
          </div>
        )}

        {/* ── Today strip ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', margin: '14px 16px 0',
          borderRadius: 14,
          border: `1px solid ${dark ? '#1a2f5a' : '#c7d8ff'}`,
          background: dark ? '#0d1a3a' : '#eef3ff',
          overflow: 'hidden',
        }}>
          {[
            { val: `$${todayTotal.toFixed(2)}`,      label: "Today's Total", color: ACCENT },
            { val: `$${todayCollected.toFixed(2)}`,  label: 'Collected',     color: '#22c55e' },
            { val: String(todayInvoices.length),     label: 'Invoices',      color: '#f59e0b' },
          ].map((item, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 8px', borderLeft: i > 0 ? `1px solid ${dark ? '#1a2f5a' : '#c7d8ff'}` : 'none' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.val}</span>
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textMuted, marginTop: 3 }}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* ── 7-Day Bar Chart ──────────────────────────────────────────────── */}
        <div style={{ margin: '12px 16px 0', borderRadius: 18, background: C.card, border: `1px solid ${C.cardBorder}`, padding: '16px 16px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Revenue — Last 7 Days</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: weekTotal > 0 ? ACCENT : C.textMuted }}>
              ${weekTotal.toFixed(2)}
            </span>
          </div>
          <BarChart days={last7} dark={dark} />
        </div>

        {/* ── Collection Ring + Stats ──────────────────────────────────────── */}
        <div style={{ margin: '12px 16px 0', borderRadius: 18, background: C.card, border: `1px solid ${C.cardBorder}`, padding: '16px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>

            {/* Donut */}
            <DonutRing paid={totalPaid} owed={totalOwed} dark={dark} />

            {/* Stats */}
            <div style={{ flex: 1 }}>
              {/* Collected */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: '#22c55e', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.textMuted }}>Collected</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>${totalPaid.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{paidCount} paid invoice{paidCount !== 1 ? 's' : ''}</div>
              </div>
              {/* Owed */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: '#ef4444', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.textMuted }}>Owed to You</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: totalOwed > 0 ? '#ef4444' : C.textMuted, lineHeight: 1 }}>${totalOwed.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{unpaidCount} unpaid invoice{unpaidCount !== 1 ? 's' : ''}</div>
              </div>
            </div>

            {/* View all */}
            <button
              style={{ alignSelf: 'flex-start', background: 'none', border: `1px solid ${C.divider}`, borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: ACCENT, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}
              onClick={() => onNav('history')}
            >All →</button>
          </div>

          {/* Overdue alert */}
          {overdueCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginTop: 14, padding: '9px 12px',
              borderRadius: 10, border: `1px solid ${dark ? 'rgba(239,68,68,0.25)' : '#fecaca'}`,
              background: dark ? 'rgba(239,68,68,0.10)' : '#fef2f2',
            }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#ef4444' }}>!</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>
                {overdueCount} overdue invoice{overdueCount !== 1 ? 's' : ''} — follow up needed
              </span>
            </div>
          )}
        </div>

        {/* ── Pinned Stores ────────────────────────────────────────────────── */}
        {pinned.length > 0 && (
          <div style={{ margin: '12px 16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>★ Pinned Stores</span>
              <button style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 600, color: ACCENT, cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }} onClick={() => onNav('store-map')}>See all</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pinned.map(name => {
                const bal = storeBalance[name] || 0;
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 14, background: C.card, border: `1px solid ${C.cardBorder}` }}>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: C.text }}>{name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: bal > 0 ? '#ef4444' : '#22c55e' }}>
                      {bal > 0 ? `$${bal.toFixed(2)}` : '✓ Paid'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Top Products (horizontal bar chart) ──────────────────────────── */}
        {topProducts.length > 0 && (
          <div style={{ margin: '12px 16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Top Products This Month</span>
              <button style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 600, color: ACCENT, cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }} onClick={() => onNav('products')}>Manage</button>
            </div>
            <div style={{ borderRadius: 18, background: C.card, border: `1px solid ${C.cardBorder}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {topProducts.map(([name, qty], i) => (
                <div key={name}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 18, fontSize: 11, fontWeight: 700, color: C.textMuted }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{name}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }}>{qty} units</span>
                  </div>
                  <HorizBar pct={qty / maxQty} color={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Loading ──────────────────────────────────────────────────────── */}
        {loading && (
          <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: '40px 0' }}>Loading…</div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {!loading && invoices.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ marginBottom: 10 }}>
              <KeiroWordmark C={C} style={{ fontSize: 36, letterSpacing: '-1px' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Welcome to Keiro</div>
            <div style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.6 }}>Tap <strong style={{ color: C.text }}>+ New</strong> to create your first invoice.</div>
          </div>
        )}

        <AppFooter onNav={onNav} />
      </div>
    </div>
  );
}
