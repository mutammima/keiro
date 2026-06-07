/**
 * SOHome — Dashboard overlay for Store Owner role.
 * Shows pending orders count, recent orders, and most-ordered products.
 */

import { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { getOrders } from '../../utils/storeOwnerStorage';

const STATUS_META = {
  pending:   { label: 'Pending',   color: '#f59e0b' },
  accepted:  { label: 'Accepted',  color: ACCENT    },
  delivered: { label: 'Delivered', color: '#22c55e' },
  cancelled: { label: 'Cancelled', color: '#6b7280' },
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SOHome({ onClose, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const orders = getOrders();

  const stats = useMemo(() => {
    const pending   = orders.filter(o => o.status === 'pending').length;
    const accepted  = orders.filter(o => o.status === 'accepted').length;
    const delivered = orders.filter(o => o.status === 'delivered').length;
    const total     = orders.length;
    return { pending, accepted, delivered, total };
  }, [orders]);

  // Most-ordered products (by total quantity)
  const topProducts = useMemo(() => {
    const map = {};
    orders.forEach(o => {
      const key = o.productName;
      if (!map[key]) map[key] = { name: key, qty: 0, count: 0 };
      map[key].qty   += o.quantity;
      map[key].count += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [orders]);

  // Recent orders (newest 5)
  const recent = orders.slice(0, 5);

  const statCards = [
    { label: 'Pending',   value: stats.pending,   color: '#f59e0b' },
    { label: 'Accepted',  value: stats.accepted,  color: ACCENT    },
    { label: 'Delivered', value: stats.delivered, color: '#22c55e' },
    { label: 'Total',     value: stats.total,     color: C.textSub },
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
          onClick={onClose}
          style={{ background: 'none', border: 'none', fontSize: 22, color: C.text, cursor: 'pointer', padding: '2px 6px', WebkitTapHighlightColor: 'transparent', lineHeight: 1 }}
        >
          ×
        </button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center' }}>
          Dashboard
        </span>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ padding: '16px 16px 48px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {statCards.map(({ label, value, color }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '16px 18px' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Top products */}
        {topProducts.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18, padding: '16px 18px' }}>
            <p style={s.sectionLabel(C)}>Most Ordered</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topProducts.map((p, i) => {
                const maxQty = topProducts[0].qty || 1;
                const pct    = Math.round((p.qty / maxQty) * 100);
                return (
                  <div key={p.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</span>
                      <span style={{ fontSize: 12, color: C.textMuted }}>{p.qty} units</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: dark ? '#2a2a2a' : '#e5e7eb', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        borderRadius: 3,
                        background: i === 0 ? ACCENT : (dark ? '#3a3a3a' : '#cbd5e1'),
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent orders */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ ...s.sectionLabel(C), margin: 0 }}>Recent Orders</p>
            {orders.length > 5 && (
              <button
                onClick={() => onNav('so-orders')}
                style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}
              >
                View all
              </button>
            )}
          </div>

          {recent.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '24px 18px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: C.textMuted, margin: '0 0 12px' }}>No orders yet.</p>
              <button
                style={{ background: ACCENT, border: 'none', color: '#fff', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                onClick={() => { onClose(); onNav('so-request'); }}
              >
                + New Request
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recent.map(order => {
                const meta = STATUS_META[order.status] || STATUS_META.pending;
                return (
                  <div
                    key={order.id}
                    style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{order.productName}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                        Qty {order.quantity} · {formatDate(order.deliveryDate)}
                        {order.driverName && order.driverName !== 'Unassigned' && ` · ${order.driverName}`}
                      </div>
                    </div>
                    <div style={{
                      padding: '3px 9px', borderRadius: 8,
                      fontSize: 11, fontWeight: 700, color: meta.color,
                      background: 'transparent',
                      border: `1.5px solid ${meta.color}`,
                      flexShrink: 0,
                    }}>
                      {meta.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            onClick={() => { onClose(); onNav('so-request'); }}
            style={{ background: ACCENT, border: 'none', color: '#fff', padding: '14px 12px', borderRadius: 14, fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            + New Request
          </button>
          <button
            onClick={() => { onClose(); onNav('so-orders'); }}
            style={{ background: C.card, border: `1px solid ${C.cardBorder}`, color: C.text, padding: '14px 12px', borderRadius: 14, fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            View Orders
          </button>
        </div>

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
