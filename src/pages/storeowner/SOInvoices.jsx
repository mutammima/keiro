/**
 * SOInvoices — Tab 4 ("Invoices") for the Store Owner role.
 * A billing view of the store's orders: total billed, outstanding (value of
 * orders still in flight), and a line-by-line list with amounts.
 *
 * Phase 1 note: orders carry a unit price, so each order doubles as a bill.
 * Delivery status stands in for settlement until cross-role invoice sharing
 * (driver → store) lands in a later phase:
 *   • delivered            → received
 *   • pending / accepted   → outstanding (awaiting delivery)
 */

import { useMemo, useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, STATUS, glassStyle } from '../../theme';
import { getOrders, loadOrdersFromCloud } from '../../utils/storeOwnerStorage';
import { getSharedInvoices, loadSharedInvoicesFromCloud } from '../../utils/connectionOrderStorage';
import { isGuest } from '../../utils/guestMode';
import { GuestBanner } from '../../components/auth/GuestUpsell';
import AppFooter from '../../components/navigation/AppFooter';

const STATUS_META = {
  delivered: { label: 'Received',    color: '#22c55e' },
  accepted:  { label: 'Awaiting',    color: ACCENT    },
  pending:   { label: 'Awaiting',    color: '#f59e0b' },
  cancelled: { label: 'Cancelled',   color: '#6b7280' },
};

const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function orderTime(o) {
  const t = Date.parse(o.createdAt || '') || Date.parse((o.deliveryDate || '') + 'T00:00:00');
  return isNaN(t) ? 0 : t;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SOInvoices({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [orders,     setOrders]     = useState(() => getOrders());
  const [shared,     setShared]     = useState(() => getSharedInvoices());
  const [expandedId, setExpandedId] = useState(null);
  // Show a loading line only on a fresh device (no cached data to paint).
  const [loading, setLoading] = useState(
    () => getOrders().length === 0 && getSharedInvoices().length === 0
  );

  useEffect(() => {
    Promise.allSettled([
      loadOrdersFromCloud().then(list => setOrders(list)),
      loadSharedInvoicesFromCloud().then(setShared),
    ]).then(() => setLoading(false));
  }, []);

  // Live-update when the foreground poll refreshes the caches (App dispatches).
  useEffect(() => {
    const onRefresh = () => { setShared(getSharedInvoices()); setOrders(getOrders()); };
    window.addEventListener('inv-data-refresh', onRefresh);
    return () => window.removeEventListener('inv-data-refresh', onRefresh);
  }, []);

  const invTotal = (inv) => (inv.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  const payMeta  = (status) => ({
    label:  STATUS[status]?.label || 'Unpaid',
    colors: (dark ? STATUS[status]?.dark : STATUS[status]?.light) || {},
  });

  // Only priced orders are billable. Newest first.
  const bills = useMemo(
    () => orders
      .filter(o => o.status !== 'cancelled' && (Number(o.price) || 0) > 0)
      .map(o => ({ ...o, amount: (Number(o.quantity) || 0) * (Number(o.price) || 0) }))
      .sort((a, b) => orderTime(b) - orderTime(a)),
    [orders]
  );

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let billed = 0, outstanding = 0, thisMonth = 0;
    if (shared.length > 0) {
      // Real invoices from connected drivers are the source of truth.
      shared.forEach(inv => {
        const amt = invTotal(inv);
        billed += amt;
        if ((inv.paymentStatus || 'unpaid') !== 'paid') outstanding += amt;
        if ((Date.parse(inv.createdAt || '') || 0) >= monthStart) thisMonth += amt;
      });
    } else {
      bills.forEach(b => {
        billed += b.amount;
        if (b.status !== 'delivered') outstanding += b.amount;
        if (orderTime(b) >= monthStart) thisMonth += b.amount;
      });
    }
    return { billed, outstanding, thisMonth };
  }, [bills, shared]); // eslint-disable-line

  const statCards = [
    { label: 'Outstanding', value: money(stats.outstanding), color: stats.outstanding > 0 ? C.text : '#22c55e' },
    { label: 'This Month',  value: money(stats.thisMonth),   color: ACCENT },
  ];

  return (
    <div style={{ ...s.page, background: C.bg }}>

      {/* Header */}
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <div style={{ width: 36 }} />
        <span style={{ ...s.title, color: C.text }}>Invoices</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>

        {isGuest() && <GuestBanner />}

        {loading && bills.length === 0 && shared.length === 0 ? (
          <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 14, paddingTop: 60 }}>Loading invoices…</p>
        ) : bills.length === 0 && shared.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '32px 18px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: C.textMuted, margin: '0 0 6px' }}>No invoices yet.</p>
            <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 14px' }}>Invoices from your connected drivers appear here automatically.</p>
            <button
              onClick={() => onNav('so-request')}
              style={{ background: ACCENT, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              + New Request
            </button>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {statCards.map(({ label, value, color }) => (
                <div key={label} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '16px 18px' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1.1, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, fontWeight: 600 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Invoices from connected drivers (read-only, real billing) */}
            {shared.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.textMuted, margin: '4px 0 0' }}>
                  ⇄ From your drivers
                </p>
                {shared.map(inv => {
                  const meta = payMeta(inv.paymentStatus);
                  const isOpen = expandedId === inv.id;
                  return (
                    <div key={inv.id} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
                      <button
                        onClick={() => setExpandedId(isOpen ? null : inv.id)}
                        style={{ width: '100%', background: 'none', border: 'none', padding: '12px 14px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                            Invoice #{inv.number}
                          </div>
                          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                            {inv.driverName} · {inv.date}{inv.time ? ` · ${inv.time}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{money(invTotal(inv))}</div>
                          <span style={{ display: 'inline-block', marginTop: 2, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: meta.colors.bg, color: meta.colors.text }}>
                            {meta.label}
                          </span>
                        </div>
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${C.divider}`, padding: '10px 14px 12px' }}>
                          {(inv.items || []).map((item, idx) => (
                            <div key={item.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.divider}` }}>
                              <span style={{ flex: 1, fontSize: 13, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                              <span style={{ fontSize: 12, color: C.textMuted, flexShrink: 0 }}>{item.qty} × {money(item.price)}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: C.text, minWidth: 56, textAlign: 'right' }}>{money(item.qty * item.price)}</span>
                            </div>
                          ))}
                          {inv.notes && (
                            <p style={{ fontSize: 12, color: C.textMuted, margin: '8px 0 0', fontStyle: 'italic' }}>"{inv.notes}"</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Order-estimate bills (legacy, same-account orders with a price) */}
            {bills.length > 0 && shared.length > 0 && (
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.textMuted, margin: '8px 0 0' }}>
                Order estimates
              </p>
            )}
            {/* Bill list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bills.map(b => {
                const meta = STATUS_META[b.status] || STATUS_META.pending;
                return (
                  <div key={b.id} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.productName}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                        Qty {b.quantity} · {formatDate(b.deliveryDate)}
                        {b.driverName && b.driverName !== 'Unassigned' ? ` · ${b.driverName}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{money(b.amount)}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: meta.color, marginTop: 1 }}>{meta.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', margin: '4px 0 0' }}>
              Total billed: {money(stats.billed)}
            </p>
          </>
        )}

        <AppFooter onNav={onNav} />
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100%', display: 'flex', flexDirection: 'column', overflowX: 'clip' },
  header: {
    padding: '14px 20px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', gap: 14,
  },
  title: { flex: 1, fontSize: 18, fontWeight: 700, textAlign: 'center', letterSpacing: 0.2 },
  body: {
    padding: '12px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
};
