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
import { getSharedInvoices, loadSharedInvoicesFromCloud, getConnectionOrders, loadConnectionOrdersFromCloud, confirmReceiving } from '../../utils/connectionOrderStorage';
import ReceivingSheet from '../../components/connections/ReceivingSheet';
import { isGuest } from '../../utils/guestMode';
import { GuestBanner } from '../../components/auth/GuestUpsell';
import AppFooter from '../../components/navigation/AppFooter';
import { triggerTip, markAction } from '../../utils/tutorialProgress';
import { formatMoney as money, formatOrderDate as formatDate } from '../../utils/invoiceUtils';
import { EVENTS } from '../../utils/constants';

// Intentionally NOT the shared theme `ORDER_STATUS`: this is the billing view,
// so order states are relabelled from a payment angle ("Received" / "Awaiting").
const STATUS_META = {
  delivered: { label: 'Received',    color: '#22c55e' },
  accepted:  { label: 'Awaiting',    color: ACCENT    },
  pending:   { label: 'Awaiting',    color: '#f59e0b' },
  cancelled: { label: 'Cancelled',   color: '#6b7280' },
};

// money + formatDate are imported (aliased) from invoiceUtils above.

function orderTime(o) {
  const t = Date.parse(o.createdAt || '') || Date.parse((o.deliveryDate || '') + 'T00:00:00');
  return isNaN(t) ? 0 : t;
}

export default function SOInvoices({ onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [orders,     setOrders]     = useState(() => getOrders());
  const [shared,     setShared]     = useState(() => getSharedInvoices());
  const [connOrders, setConnOrders] = useState(() => getConnectionOrders());
  const [confirmReceipt, setConfirmReceipt] = useState(null); // order awaiting receipt confirmation
  const [expandedId, setExpandedId] = useState(null);
  // Show a loading line only on a fresh device (no cached data to paint).
  const [loading, setLoading] = useState(
    () => getOrders().length === 0 && getSharedInvoices().length === 0
  );

  useEffect(() => {
    Promise.allSettled([
      loadOrdersFromCloud().then(list => setOrders(list)),
      loadSharedInvoicesFromCloud().then(setShared),
      loadConnectionOrdersFromCloud().then(setConnOrders),
    ]).then(() => setLoading(false));
  }, []);

  // Live-update when the foreground poll refreshes the caches (App dispatches).
  useEffect(() => {
    const onRefresh = () => { setShared(getSharedInvoices()); setOrders(getOrders()); setConnOrders(getConnectionOrders()); };
    window.addEventListener(EVENTS.DATA_REFRESH, onRefresh);
    return () => window.removeEventListener(EVENTS.DATA_REFRESH, onRefresh);
  }, []);

  // Map delivered connection orders by their invoice number, so a shared invoice
  // can surface (and confirm) its receiving state. One order ↔ one invoice.
  const orderByInvoice = useMemo(() => {
    const m = {};
    connOrders.forEach(o => { if (o.invoiceNumber != null) m[o.invoiceNumber] = o; });
    return m;
  }, [connOrders]);

  // Layer 2 — once a driver has set a payment status, explain the status badge.
  const hasPaymentStatus = shared.some(inv => (inv.paymentStatus || 'unpaid') !== 'unpaid');
  useEffect(() => { if (hasPaymentStatus) triggerTip('o-payment-status'); }, [hasPaymentStatus]);

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
  }, [bills, shared]);

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

      <div data-tip="so-invoices-list" style={s.body}>

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
                {shared.map((inv, sIdx) => {
                  const meta = payMeta(inv.paymentStatus);
                  const isOpen = expandedId === inv.id;
                  return (
                    <div key={inv.id} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
                      <button
                        onClick={() => { if (!isOpen) markAction('so_view_invoice'); setExpandedId(isOpen ? null : inv.id); }}
                        style={{ width: '100%', background: 'none', border: 'none', padding: '12px 14px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                            Invoice #{inv.number}
                          </div>
                          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                            {inv.driverName} · {inv.date}{inv.time ? ` · ${inv.time}` : ''}
                          </div>
                          {(() => {
                            const o = orderByInvoice[inv.number];
                            if (!o || !o.receivedConfirmed) return null;
                            const disc = o.receivedQuantity != null && o.receivedQuantity !== o.quantity;
                            return disc
                              ? <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>⚑ Discrepancy · received {o.receivedQuantity} of {o.quantity}</div>
                              : <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: '#22c55e' }}>✓ Receipt confirmed</div>;
                          })()}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{money(invTotal(inv))}</div>
                          <span data-tip={sIdx === 0 ? 'so-payment-status' : undefined} style={{ display: 'inline-block', marginTop: 2, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: meta.colors.bg, color: meta.colors.text }}>
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
                          {(() => {
                            const o = orderByInvoice[inv.number];
                            if (!o || o.status !== 'delivered' || o.receivedConfirmed) return null;
                            return (
                              <button
                                onClick={() => setConfirmReceipt(o)}
                                style={{ marginTop: 10, width: '100%', minHeight: 44, height: 44, border: 'none', borderRadius: 12, background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                              >
                                Confirm Receipt
                              </button>
                            );
                          })()}
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

      {/* Receiving confirmation sheet */}
      {confirmReceipt && (
        <ReceivingSheet
          order={confirmReceipt}
          onConfirm={({ receivedQuantity, receivingNotes }) => {
            confirmReceiving(confirmReceipt.id, { receivedQuantity, receivingNotes });
            setConfirmReceipt(null);
            setExpandedId(null);
            setConnOrders(getConnectionOrders());
          }}
          onClose={() => setConfirmReceipt(null)}
        />
      )}
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
