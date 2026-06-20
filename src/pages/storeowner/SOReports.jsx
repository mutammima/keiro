/**
 * SOReports — order analytics for the Store Owner role.
 * Orders don't carry a price, so this reports on *volume* (counts, status mix,
 * 7-day trend, top products) rather than money. If pricing is added to the
 * order shape later, dollar totals can slot into the stat row.
 * Reached from the nav drawer; header shows ☰ to reopen the drawer.
 */

import { useMemo, useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle, ORDER_STATUS } from '../../theme';
import { getOrders, loadOrdersFromCloud } from '../../utils/storeOwnerStorage';
import { isGuest } from '../../utils/guestMode';
import { GuestBanner } from '../../components/auth/GuestUpsell';
import { markAction } from '../../utils/tutorialProgress';
import { formatMoney as money } from '../../utils/invoiceUtils';

// Order status meta → shared ORDER_STATUS in theme.js

const DAY_MS = 24 * 60 * 60 * 1000;

function orderTime(o) {
  // Prefer createdAt; fall back to the delivery date.
  const t = Date.parse(o.createdAt || '') || Date.parse((o.deliveryDate || '') + 'T00:00:00');
  return isNaN(t) ? 0 : t;
}

export default function SOReports({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [orders, setOrders] = useState(() => getOrders());
  const [loading, setLoading] = useState(() => getOrders().length === 0);

  useEffect(() => {
    loadOrdersFromCloud()
      .then(list => setOrders(list))
      .catch(() => {})
      .finally(() => setLoading(false));
    markAction('so_history'); // checklist: viewed delivery/order history
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const byStatus = { pending: 0, accepted: 0, delivered: 0, cancelled: 0 };
    let thisMonth = 0;
    let totalSpend = 0;
    let monthSpend = 0;
    orders.forEach(o => {
      if (byStatus[o.status] !== undefined) byStatus[o.status] += 1;
      const lineTotal = (Number(o.quantity) || 0) * (Number(o.price) || 0);
      totalSpend += lineTotal;
      if (orderTime(o) >= monthStart) { thisMonth += 1; monthSpend += lineTotal; }
    });
    return { total: orders.length, thisMonth, byStatus, totalSpend, monthSpend };
  }, [orders]);

  // 7-day order-volume trend (oldest → newest)
  const trend = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime() - 6 * DAY_MS;
    const buckets = Array.from({ length: 7 }, (_, i) => ({
      label: new Date(start + i * DAY_MS).toLocaleDateString('en-US', { weekday: 'narrow' }),
      count: 0,
    }));
    orders.forEach(o => {
      const t = orderTime(o);
      if (t < start) return;
      const idx = Math.floor((t - start) / DAY_MS);
      if (idx >= 0 && idx < 7) buckets[idx].count += 1;
    });
    return buckets;
  }, [orders]);

  const topProducts = useMemo(() => {
    const map = {};
    orders.forEach(o => {
      const key = o.productName || 'Unknown';
      if (!map[key]) map[key] = { name: key, qty: 0 };
      map[key].qty += Number(o.quantity) || 0;
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [orders]);

  const maxTrend = Math.max(1, ...trend.map(d => d.count));

  // money → shared formatMoney in invoiceUtils (aliased on the import above).
  const statCards = [
    { label: 'Total Spend',   value: money(stats.totalSpend), color: '#22c55e' },
    { label: 'Spent This Mo.', value: money(stats.monthSpend), color: ACCENT    },
    { label: 'Total Orders',  value: stats.total,              color: C.text    },
    { label: 'Delivered',     value: stats.byStatus.delivered, color: C.textSub },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: C.bg,
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>

      {/* Header */}
      <div style={{
        ...glassStyle(dark),
        padding: '14px 20px 12px',
        paddingTop: 'max(14px, env(safe-area-inset-top))',
        display: 'flex', alignItems: 'center', gap: 14,
        flexShrink: 0,
      }}>
        <button
          onClick={onOpenDrawer}
          aria-label="Open menu"
          style={{ background: 'none', border: 'none', fontSize: 20, color: C.text, cursor: 'pointer', padding: '4px 6px', WebkitTapHighlightColor: 'transparent', lineHeight: 1 }}
        >
          ☰
        </button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center' }}>
          Reports
        </span>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ padding: '16px 16px 48px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {isGuest() && <GuestBanner />}

        {loading && orders.length === 0 ? (
          <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 14, paddingTop: 40 }}>Loading reports…</p>
        ) : orders.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '28px 18px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: C.textMuted, margin: '0 0 14px' }}>No orders yet — reports will appear once you start requesting.</p>
            <button
              style={{ background: ACCENT, border: 'none', color: '#fff', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
              onClick={() => onNav('so-request')}
            >
              + New Request
            </button>
          </div>
        ) : (
          <>
            {/* Stat row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {statCards.map(({ label, value, color }) => (
                <div key={label} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '16px 18px' }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1.1, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, fontWeight: 600 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* 7-day trend */}
            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18, padding: '16px 18px' }}>
              <p style={s.sectionLabel(C)}>Last 7 Days</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, height: 96 }}>
                {trend.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted }}>{d.count || ''}</span>
                    <div style={{
                      width: '100%', maxWidth: 26,
                      height: `${Math.round((d.count / maxTrend) * 70)}%`,
                      minHeight: d.count ? 4 : 2,
                      borderRadius: 6,
                      background: d.count ? ACCENT : (dark ? '#2a2a2a' : '#e5e7eb'),
                      transition: 'height 0.4s ease',
                    }} />
                    <span style={{ fontSize: 11, color: C.textMuted }}>{d.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status breakdown */}
            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18, padding: '16px 18px' }}>
              <p style={s.sectionLabel(C)}>By Status</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(ORDER_STATUS).map(([key, meta]) => {
                  const count = stats.byStatus[key] || 0;
                  const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{meta.label}</span>
                        <span style={{ fontSize: 12, color: C.textMuted }}>{count} · {pct}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: dark ? '#2a2a2a' : '#e5e7eb', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: meta.color, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top products */}
            {topProducts.length > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18, padding: '16px 18px' }}>
                <p style={s.sectionLabel(C)}>Most Ordered</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {topProducts.map((p, i) => {
                    const maxQty = topProducts[0].qty || 1;
                    const pct = Math.round((p.qty / maxQty) * 100);
                    return (
                      <div key={p.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</span>
                          <span style={{ fontSize: 12, color: C.textMuted }}>{p.qty} units</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: dark ? '#2a2a2a' : '#e5e7eb', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: i === 0 ? ACCENT : (dark ? '#3a3a3a' : '#cbd5e1'), transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  sectionLabel: (C) => ({
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: C.textMuted, margin: '0 0 12px',
  }),
};
