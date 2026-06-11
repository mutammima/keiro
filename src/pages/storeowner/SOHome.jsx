/**
 * SOHome — Store Owner dashboard ("home base", reached via the Home tab).
 *
 * Three sections:
 *   1. Inventory Pulse  — smart restock suggestions + the last products ordered
 *                         with "days since last order" and the typical cadence.
 *   2. Order history    — newest orders with status, link to the full Orders tab.
 *   3. Quick actions    — New Request (prominent), Orders, Invoices.
 *
 * Smart restock rule: for any product ordered at least twice, average the days
 * between consecutive orders; if the current gap exceeds that average by >20%,
 * flag it as due to reorder.
 *
 * Header shows a ☰ (home base, not a dismissible modal — no close "×").
 */

import { useMemo, useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { getOrders, loadOrdersFromCloud } from '../../utils/storeOwnerStorage';

const MS_DAY = 86400000;

const STATUS_META = {
  pending:   { label: 'Pending',   color: '#f59e0b' },
  accepted:  { label: 'Accepted',  color: ACCENT    },
  delivered: { label: 'Delivered', color: '#22c55e' },
  cancelled: { label: 'Cancelled', color: '#6b7280' },
};

function orderTime(o) {
  return Date.parse(o.createdAt || '') || Date.parse((o.deliveryDate || '') + 'T00:00:00') || 0;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ago = (days) => (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`);

export default function SOHome({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [orders, setOrders] = useState(() => getOrders());

  useEffect(() => {
    loadOrdersFromCloud().then(list => setOrders(list)).catch(() => {});
  }, []);

  const stats = useMemo(() => ({
    pending:   orders.filter(o => o.status === 'pending').length,
    accepted:  orders.filter(o => o.status === 'accepted').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  }), [orders]);

  // ── Inventory model: per-product cadence + restock flag ──────────────────────
  const inventory = useMemo(() => {
    const now = Date.now();
    const map = {};
    orders
      .filter(o => o.status !== 'cancelled')
      .forEach(o => {
        const t = orderTime(o);
        if (!t) return;
        if (!map[o.productName]) map[o.productName] = [];
        map[o.productName].push(t);
      });
    return Object.entries(map).map(([name, times]) => {
      times.sort((a, b) => a - b);
      const lastTime  = times[times.length - 1];
      const daysSince = Math.floor((now - lastTime) / MS_DAY);
      let avgGap = null, suggest = false;
      if (times.length >= 2) {
        let sum = 0;
        for (let i = 1; i < times.length; i++) sum += times[i] - times[i - 1];
        avgGap = sum / (times.length - 1) / MS_DAY; // avg days between orders
        if (avgGap > 0 && daysSince > avgGap * 1.2) suggest = true;
      }
      return { name, count: times.length, daysSince, avgGap, suggest, lastTime };
    });
  }, [orders]);

  const recentInventory  = useMemo(() => [...inventory].sort((a, b) => b.lastTime - a.lastTime).slice(0, 5), [inventory]);
  const restockList      = useMemo(() => inventory.filter(p => p.suggest).sort((a, b) => b.daysSince - a.daysSince), [inventory]);

  const recent = orders.slice(0, 5);

  const statCards = [
    { label: 'Pending',   value: stats.pending,   color: '#f59e0b' },
    { label: 'Accepted',  value: stats.accepted,  color: ACCENT    },
    { label: 'Delivered', value: stats.delivered, color: '#22c55e' },
  ];

  return (
    <div style={{ minHeight: '100%', background: C.bg, display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        ...glassStyle(dark),
        padding: '14px 20px 12px',
        paddingTop: 'max(14px, env(safe-area-inset-top))',
        display: 'flex', alignItems: 'center', gap: 14,
        flexShrink: 0,
      }}>
        {/* No ☰ here — the fixed TopNav strip already provides the drawer toggle
            for tab pages. A 64px spacer balances the +New button so the title
            stays centred (matches the SOOrders header pattern). */}
        <div style={{ width: 64, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center' }}>Dashboard</span>
        <button
          onClick={() => onNav('so-request')}
          style={{ flexShrink: 0, height: 32, padding: '0 14px', border: 'none', borderRadius: 16, background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
        >
          + New
        </button>
      </div>

      <div style={{ padding: '16px 16px 48px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Status strip */}
        <div style={{ display: 'flex', borderRadius: 14, border: `1px solid ${C.cardBorder}`, background: C.card, overflow: 'hidden' }}>
          {statCards.map((item, i) => (
            <div key={item.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 8px', borderLeft: i > 0 ? `1px solid ${C.cardBorder}` : 'none' }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: item.color, lineHeight: 1 }}>{item.value}</span>
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textMuted, marginTop: 4 }}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* ── 1. Inventory Pulse ───────────────────────────────────────────── */}
        {inventory.length === 0 ? (
          <div>
            <p style={s.sectionLabel(C)}>Inventory Pulse</p>
            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '24px 18px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: C.textMuted, margin: '0 0 12px' }}>No orders yet — your restock rhythm will appear here.</p>
              <button
                style={{ background: ACCENT, border: 'none', color: '#fff', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                onClick={() => onNav('so-request')}
              >
                + New Request
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={s.sectionLabel(C)}>Inventory Pulse</p>

            {/* Restock suggestions */}
            {restockList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {restockList.map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: dark ? 'rgba(245,158,11,0.10)' : '#fffbeb', border: `1px solid ${dark ? 'rgba(245,158,11,0.30)' : '#fde68a'}` }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>🔄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#b45309', marginTop: 1 }}>
                        Due to reorder · last {ago(p.daysSince)}{p.avgGap != null ? ` · usually every ~${Math.round(p.avgGap)}d` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => onNav('so-request')}
                      style={{ flexShrink: 0, height: 32, padding: '0 14px', border: 'none', borderRadius: 9, background: '#f59e0b', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                    >
                      Reorder
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Recently ordered */}
            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18, padding: '6px 16px' }}>
              {recentInventory.map((p, i) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i > 0 ? `1px solid ${C.divider}` : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>
                      Ordered {ago(p.daysSince)}
                      {p.avgGap != null ? ` · every ~${Math.round(p.avgGap)}d` : ` · ${p.count} order${p.count !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                  {p.suggest && (
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#f59e0b', border: '1.5px solid #f59e0b', borderRadius: 8, padding: '3px 8px' }}>Restock</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 2. Order history ─────────────────────────────────────────────── */}
        {recent.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ ...s.sectionLabel(C), margin: 0 }}>Recent Orders</p>
              <button
                onClick={() => onNav('so-orders')}
                style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}
              >
                View all
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recent.map(order => {
                const meta = STATUS_META[order.status] || STATUS_META.pending;
                return (
                  <div key={order.id} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.productName}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                        Qty {order.quantity} · {formatDate(order.deliveryDate)}
                        {order.driverName && order.driverName !== 'Unassigned' && ` · ${order.driverName}`}
                      </div>
                    </div>
                    <div style={{ padding: '3px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700, color: meta.color, background: 'transparent', border: `1.5px solid ${meta.color}`, flexShrink: 0 }}>
                      {meta.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 3. Quick actions ─────────────────────────────────────────────── */}
        <div>
          <p style={s.sectionLabel(C)}>Quick Actions</p>

          <button
            onClick={() => onNav('so-request')}
            style={{ width: '100%', height: 54, border: 'none', borderRadius: 16, background: ACCENT, color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 6px 18px rgba(74,123,247,0.30)' }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> New Request
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <button onClick={() => onNav('so-orders')} style={s.quickRow(C)}>
              <span style={{ fontSize: 16 }}>📋</span>
              <span style={{ flex: 1, textAlign: 'left' }}>View all orders</span>
              <span style={{ color: C.textMuted, fontSize: 18 }}>›</span>
            </button>
            <button onClick={() => onNav('so-invoices')} style={s.quickRow(C)}>
              <span style={{ fontSize: 16 }}>🧾</span>
              <span style={{ flex: 1, textAlign: 'left' }}>View invoices</span>
              <span style={{ color: C.textMuted, fontSize: 18 }}>›</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

const s = {
  sectionLabel: (C) => ({
    fontSize: 12, fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: C.textMuted, margin: '0 0 10px 2px',
  }),
  quickRow: (C) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '13px 14px', borderRadius: 14,
    background: C.card, border: `1px solid ${C.cardBorder}`,
    color: C.text, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  }),
};
