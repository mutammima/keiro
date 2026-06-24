/**
 * Home — Driver command center.
 *
 * Three focused sections built from live invoice + request data:
 *   1. Today at a glance — revenue, deliveries, pending invoices, and any
 *                          incoming store order requests as notification cards.
 *   2. This Week         — 7-day revenue bar chart, paid/unpaid/overdue counts,
 *                          and the best-performing store this week.
 *   3. Quick Actions     — New Invoice (prominent), pending requests, stores.
 *
 * All numbers come from getInvoices() + the Store→Driver bridge queue. A pulse
 * skeleton shows while the first invoice fetch resolves.
 */

import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';
import { getInvoices, getBusinessName } from '../utils/storage';
import { getBridgeRequests, loadBridgeRequestsFromCloud } from '../utils/storeOwnerStorage';
import { getConnectionOrders, loadConnectionOrdersFromCloud } from '../utils/connectionOrderStorage';
import AppFooter from '../components/navigation/AppFooter';
import { BarChart } from '../components/dashboard/DashboardCharts';
import { subtotalOf, getStatus, formatInvoiceDate as dateStr, isOverdue, getFlagDays } from '../utils/invoiceUtils';
import { isGuest } from '../utils/guestMode';
import { GuestBanner } from '../components/auth/GuestUpsell';
import KeiroWordmark from '../components/ui/KeiroWordmark';

// ─── helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
// NOTE: deliberately a separator-less `toFixed` format (e.g. "$1234.50"), unlike
// the shared formatMoney() ("$1,234.50"). Left as-is to avoid changing the
// dashboard's displayed numbers; see structural-cleanup notes.
const money = (n) => '$' + (Number(n) || 0).toFixed(2);

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home({ onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [invoices,   setInvoices]   = useState([]);
  const [requests,   setRequests]   = useState(() => getBridgeRequests());
  const [connOrders, setConnOrders] = useState(() => getConnectionOrders());
  const [loading,    setLoading]    = useState(true);
  const bizName = getBusinessName() || 'Keiro';

  useEffect(() => {
    getInvoices().then(list => {
      setInvoices(Array.isArray(list) ? list : []);
      setLoading(false);
    });
    loadBridgeRequestsFromCloud().then(setRequests).catch(() => {});
    loadConnectionOrdersFromCloud().then(setConnOrders).catch(() => {});
  }, []);

  const flagDays = getFlagDays();

  // Open cross-account orders from connected stores, folded into the same
  // request-card shape as bridge requests so one surface shows both. Memoized so
  // a theme toggle / unrelated re-render doesn't rebuild the array reference.
  const allRequests = useMemo(() => [
    ...connOrders
      .filter(o => o.status === 'pending' || o.status === 'accepted')
      .map(o => ({ id: o.id, productName: o.productName, quantity: o.quantity, fromStore: o.storeName || 'Connected store' })),
    ...requests,
  ], [connOrders, requests]);

  // All invoice-derived dashboard numbers in one memo — recomputed only when the
  // invoices (or the overdue threshold) change, not on every render. `bars` keeps
  // a stable reference so the memoized BarChart can skip re-rendering.
  const {
    todayRevenue, todayDeliveries, pendingInvoices,
    bars, weekTotal, weekPaid, weekUnpaid, weekOverdue, bestStore,
  } = useMemo(() => {
    // ── Today ──
    const today           = dateStr(new Date());
    const todayInvoices   = invoices.filter(inv => inv.date === today);
    const todayRevenue    = todayInvoices.reduce((s, inv) => s + subtotalOf(inv), 0);
    const todayDeliveries = todayInvoices.length;
    const pendingInvoices = invoices.filter(inv => getStatus(inv) !== 'paid').length;

    // ── This week (last 7 days incl. today) ──
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { ds: dateStr(d), label: DAY_LABELS[d.getDay()], isToday: i === 6 };
    });
    const weekSet      = new Set(last7.map(d => d.ds));
    const weekInvoices = invoices.filter(inv => weekSet.has(inv.date));

    const bars = last7.map(d => ({
      label: d.label,
      total: weekInvoices.filter(inv => inv.date === d.ds).reduce((s, inv) => s + subtotalOf(inv), 0),
      isToday: d.isToday,
    }));
    const weekTotal = bars.reduce((s, b) => s + b.total, 0);

    const weekPaid    = weekInvoices.filter(inv => getStatus(inv) === 'paid').length;
    const weekUnpaid  = weekInvoices.filter(inv => getStatus(inv) !== 'paid').length;
    const weekOverdue = weekInvoices.filter(inv => isOverdue(inv, flagDays)).length;

    const weekByStore = {};
    weekInvoices.forEach(inv => {
      const sn = inv.storeName || inv.store_name;
      if (!sn) return;
      weekByStore[sn] = (weekByStore[sn] || 0) + subtotalOf(inv);
    });
    const bestStore = Object.entries(weekByStore).sort((a, b) => b[1] - a[1])[0]; // [name, total] | undefined

    return { todayRevenue, todayDeliveries, pendingInvoices, bars, weekTotal, weekPaid, weekUnpaid, weekOverdue, bestStore };
  }, [invoices, flagDays]);

  const skelBg = dark ? '#1d1d1f' : '#e9e7e3';

  // ── Quick actions (shown in every non-loading branch) ───────────────────────
  const quickActions = (
    <div style={{ margin: '4px 16px 0' }}>
      <div style={s.sectionLabel(C)}>Quick Actions</div>

      <button
        data-tutorial="tab-new"
        onClick={() => onNav('invoice')}
        style={{ width: '100%', height: 54, border: 'none', borderRadius: 16, background: ACCENT, color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 6px 18px rgba(74,123,247,0.30)' }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> New Invoice
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <button onClick={() => onNav('route')} style={s.quickRow(C)}>
          <span style={{ fontSize: 16 }}>▢</span>
          <span style={{ flex: 1, textAlign: 'left' }}>View pending requests</span>
          {allRequests.length > 0 && (
            <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: ACCENT, color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {allRequests.length}
            </span>
          )}
          <span style={{ color: C.textMuted, fontSize: 18 }}>›</span>
        </button>
        <button onClick={() => onNav('stores')} style={s.quickRow(C)}>
          <span style={{ fontSize: 16 }}>⌂</span>
          <span style={{ flex: 1, textAlign: 'left' }}>View connected stores</span>
          <span style={{ color: C.textMuted, fontSize: 18 }}>›</span>
        </button>
      </div>
    </div>
  );

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
        {/* No ☰ here — the fixed TopNav strip already provides the drawer toggle
            for tab pages. Rendering one here too produced a double hamburger. */}
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text }}>{bizName}</span>
        <button
          style={{ background: ACCENT, border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, padding: '7px 16px', borderRadius: 20, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          onClick={() => onNav('invoice')}
        >+ New</button>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'clip', paddingBottom: 88, display: 'flex', flexDirection: 'column', gap: 18 }}>

        {isGuest() && (
          <div style={{ margin: '14px 16px 0' }}>
            <GuestBanner />
          </div>
        )}

        {loading ? (
          /* ── Loading skeleton ─────────────────────────────────────────── */
          <div style={{ margin: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="skeleton-box" style={{ height: 78, borderRadius: 14, background: skelBg }} />
            <div className="skeleton-box" style={{ height: 168, borderRadius: 18, background: skelBg }} />
            <div className="skeleton-box" style={{ height: 64, borderRadius: 16, background: skelBg }} />
            <div className="skeleton-box" style={{ height: 54, borderRadius: 16, background: skelBg }} />
          </div>
        ) : (invoices.length === 0 && allRequests.length === 0) ? (
          /* ── Welcome (brand-new driver) ───────────────────────────────── */
          <>
            <div style={{ textAlign: 'center', padding: '40px 24px 8px' }}>
              <div style={{ marginBottom: 10 }}>
                <KeiroWordmark C={C} style={{ fontSize: 36, letterSpacing: '-1px' }} />
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 6 }}>Welcome to Keiro</div>
              <div style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.6 }}>
                Create your first invoice to start tracking revenue, stores, and payments.
              </div>
            </div>
            {quickActions}
          </>
        ) : (
          <>
            {/* ── 1. Today at a glance ─────────────────────────────────── */}
            <div style={{ margin: '14px 16px 0' }}>
              <div style={s.sectionLabel(C)}>Today</div>

              <div style={{
                display: 'flex',
                borderRadius: 14,
                border: `1px solid ${dark ? '#1a2f5a' : '#c7d8ff'}`,
                background: dark ? '#0d1a3a' : '#eef3ff',
                overflow: 'hidden',
              }}>
                {[
                  { val: money(todayRevenue),       label: 'Revenue',    color: ACCENT },
                  { val: String(todayDeliveries),   label: todayDeliveries === 1 ? 'Delivery' : 'Deliveries', color: '#22c55e' },
                  { val: String(pendingInvoices),   label: 'Pending',    color: '#f59e0b' },
                ].map((item, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '13px 8px', borderLeft: i > 0 ? `1px solid ${dark ? '#1a2f5a' : '#c7d8ff'}` : 'none' }}>
                    <span style={{ fontSize: 19, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.val}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textMuted, marginTop: 4 }}>{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Incoming store requests (bridge + connected-store orders) */}
              {allRequests.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {allRequests.slice(0, 4).map(req => (
                    <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: dark ? '#0a1a3a' : '#eff6ff', border: `1px solid ${dark ? 'rgba(74,123,247,0.25)' : 'rgba(74,123,247,0.20)'}` }}>
                      <span style={{ fontSize: 18, flexShrink: 0, color: ACCENT }}>{req.fromStore ? '⇄' : '▢'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {req.productName}
                        </div>
                        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>
                          {req.fromStore ? `From ${req.fromStore}` : 'New order request'} · Qty {req.quantity}
                        </div>
                      </div>
                      <button
                        onClick={() => onNav('route')}
                        style={{ flexShrink: 0, height: 32, padding: '0 14px', border: 'none', borderRadius: 9, background: ACCENT, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                      >
                        Fill
                      </button>
                    </div>
                  ))}
                  {allRequests.length > 4 && (
                    <button onClick={() => onNav('route')} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '2px 0', WebkitTapHighlightColor: 'transparent' }}>
                      View all {allRequests.length} requests →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── 2. This Week ─────────────────────────────────────────── */}
            {invoices.length > 0 && (
              <div style={{ margin: '0 16px' }}>
                <div style={s.sectionLabel(C)}>This Week</div>

                {/* Revenue bar chart */}
                <div data-tip="home-chart" style={{ borderRadius: 18, background: C.card, border: `1px solid ${C.cardBorder}`, padding: '16px 16px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Revenue</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: weekTotal > 0 ? ACCENT : C.textMuted }}>{money(weekTotal)}</span>
                  </div>
                  <BarChart days={bars} dark={dark} />
                </div>

                {/* Paid / Unpaid / Overdue */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
                  {[
                    { val: weekPaid,    label: 'Paid',    color: '#22c55e' },
                    { val: weekUnpaid,  label: 'Unpaid',  color: '#f59e0b' },
                    { val: weekOverdue, label: 'Overdue', color: '#ef4444' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '12px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.val}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted, marginTop: 4 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Best store this week */}
                {bestStore && bestStore[1] > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, padding: '13px 16px', borderRadius: 14, background: C.card, border: `1px solid ${C.cardBorder}` }}>
                    <span style={{ fontSize: 18, flexShrink: 0, color: '#f59e0b' }}>★</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textMuted }}>Best store this week</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{bestStore[0]}</div>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 800, color: ACCENT, flexShrink: 0 }}>{money(bestStore[1])}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── 3. Quick actions ─────────────────────────────────────── */}
            {quickActions}
          </>
        )}

        <AppFooter onNav={onNav} />
      </div>
    </div>
  );
}

const s = {
  sectionLabel: (C) => ({
    fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
    color: C.textMuted, margin: '0 0 10px 2px',
  }),
  quickRow: (C) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '13px 14px', borderRadius: 14,
    background: C.card, border: `1px solid ${C.cardBorder}`,
    color: C.text, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  }),
};
