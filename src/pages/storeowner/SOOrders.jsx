/**
 * SOOrders — Tab 2 for Store Owner role.
 * Lists all order requests with status management.
 */

import { useState, useEffect } from 'react';
import { createPortal as portal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle, ORDER_STATUS } from '../../theme';
import { getOrders, updateOrderStatus, deleteOrder, bridgeOrderToDriver, loadOrdersFromCloud, stageReorder } from '../../utils/storeOwnerStorage';
import { getConnectionOrders, loadConnectionOrdersFromCloud, updateConnectionOrderStatus, confirmReceiving } from '../../utils/connectionOrderStorage';
import ReceivingSheet from '../../components/connections/ReceivingSheet';
import AppFooter from '../../components/navigation/AppFooter';
import { triggerTip, markAction } from '../../utils/tutorialProgress';
import { formatOrderDate as formatDate, orderLines } from '../../utils/invoiceUtils';
import { EVENTS } from '../../utils/constants';

// Order status meta → shared ORDER_STATUS in theme.js
// formatDate → formatOrderDate in invoiceUtils (aliased above).

const FILTERS = ['all', 'pending', 'accepted', 'delivered', 'cancelled'];

export default function SOOrders({ onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [filter,        setFilter]        = useState('all');
  const [orders,        setOrders]        = useState(() => getOrders());
  const [connOrders,    setConnOrders]    = useState(() => getConnectionOrders());
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmReceipt, setConfirmReceipt] = useState(null); // order awaiting receipt confirmation
  const [expandedId,    setExpandedId]    = useState(null);
  // Loading only matters when there's no cached data to paint (fresh device) —
  // otherwise the cache renders instantly and the cloud refresh lands silently.
  const [loading, setLoading] = useState(
    () => getOrders().length === 0 && getConnectionOrders().length === 0
  );

  // Fetch latest from cloud on mount (syncs localStorage cache too)
  useEffect(() => {
    Promise.allSettled([
      loadOrdersFromCloud().then(list => setOrders(list)),
      loadConnectionOrdersFromCloud().then(setConnOrders),
    ]).then(() => setLoading(false));
  }, []);

  // Live-update when the foreground poll refreshes the caches (App dispatches).
  useEffect(() => {
    const onRefresh = () => { setOrders(getOrders()); setConnOrders(getConnectionOrders()); };
    window.addEventListener(EVENTS.DATA_REFRESH, onRefresh);
    return () => window.removeEventListener(EVENTS.DATA_REFRESH, onRefresh);
  }, []);

  function refresh() { setOrders(getOrders()); setConnOrders(getConnectionOrders()); }

  function handleStatus(id, status) {
    // When accepting, push a bridge request for the Driver role to pick up
    if (status === 'accepted') {
      const order = orders.find(o => o.id === id);
      if (order) bridgeOrderToDriver(order);
    }
    updateOrderStatus(id, status);
    refresh();
  }

  function handleConnCancel(id) {
    updateConnectionOrderStatus(id, 'cancelled');
    refresh();
  }

  // Prefill the New Request form from a past order and jump to it (user reviews
  // + taps Send themselves — this is a shortcut, not an automatic reorder).
  function handleReorder(order) {
    stageReorder(order);
    setExpandedId(null);
    onNav('so-request');
  }

  function handleDelete() {
    if (!confirmDelete) return;
    deleteOrder(confirmDelete.id);
    setConfirmDelete(null);
    refresh();
  }

  // Merge private orders with cross-account connection orders, newest first.
  const merged = [
    ...connOrders.map(o => ({ ...o, isConnection: true })),
    ...orders,
  ].sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));

  const visible = filter === 'all'
    ? merged
    : merged.filter(o => o.status === filter);

  // Anchors for the first connection order / first delivered-with-invoice order.
  const firstConnIdx      = visible.findIndex(o => o.isConnection);
  const firstDeliveredIdx = visible.findIndex(o => o.isConnection && o.status === 'delivered' && o.invoiceNumber != null);

  // Layer 2 + checklist signals.
  const hasConnOrder = merged.some(o => o.isConnection);
  const hasDelivered = merged.some(o => o.status === 'delivered');
  useEffect(() => { if (hasConnOrder) triggerTip('o-order-status'); }, [hasConnOrder]);
  useEffect(() => { if (hasDelivered) { triggerTip('o-order-delivered'); markAction('so_delivered'); } }, [hasDelivered]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: C.bg }}>

      {/* Header */}
      <div style={{ ...glassStyle(dark), padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 64 }} />
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center' }}>Orders</span>
        <button
          data-qs="new-request"
          onClick={() => onNav('so-request')}
          style={{ flexShrink: 0, height: 32, padding: '0 14px', border: 'none', borderRadius: 16, background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
        >
          + New
        </button>
      </div>

      {/* Filter pills */}
      <div data-tutorial="so-orders-filters" style={{ display: 'flex', gap: 8, padding: '12px 16px 4px', overflowX: 'auto' }}>
        {FILTERS.map(f => {
          const active = filter === f;
          return (
            <button
              key={f}
              data-tutorial={`so-filter-${f}`}
              onClick={() => setFilter(f)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 20,
                border: `1.5px solid ${active ? ACCENT : C.cardBorder}`,
                background: active ? ACCENT : C.card,
                color: active ? '#fff' : C.textMuted,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                textTransform: 'capitalize',
              }}
            >
              {f === 'all' ? 'All' : ORDER_STATUS[f]?.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div data-tip="so-orders-list" style={{ padding: '8px 16px 100px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {loading && visible.length === 0 ? (
          <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 14, paddingTop: 60 }}>Loading orders…</p>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>No orders yet</p>
            <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 20px' }}>
              {filter === 'all' ? 'Tap Request to create your first order.' : `No ${filter} orders.`}
            </p>
            {filter === 'all' && (
              <button style={s.accentBtn} onClick={() => onNav('so-request')}>+ New Request</button>
            )}
          </div>
        ) : visible.map((order, orderIdx) => {
          const meta = ORDER_STATUS[order.status] || ORDER_STATUS.pending;
          const expanded = expandedId === order.id;
          return (
            <div
              key={order.id}
              style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18, overflow: 'hidden' }}
            >
              {/* Main row */}
              <button
                data-tutorial={orderIdx === 0 ? 'so-order-card' : undefined}
                onClick={() => setExpandedId(expanded ? null : order.id)}
                style={{ width: '100%', background: 'none', border: 'none', padding: '14px 16px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'left' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 3 }}>
                      {(() => { const ls = orderLines(order); return ls.length > 1 ? `${ls[0].name} +${ls.length - 1} more` : order.productName; })()}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>
                      {(() => {
                        const ls = orderLines(order);
                        return ls.length > 1
                          ? <span style={{ color: C.textSub, fontWeight: 700 }}>{ls.length} items</span>
                          : <>Qty: <strong style={{ color: C.textSub }}>{order.quantity}</strong></>;
                      })()}
                      {' · '}
                      {formatDate(order.deliveryDate)}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                      {order.isConnection ? '⇄ ' : ''}{order.driverName}
                      {order.isConnection && order.status === 'delivered' && order.invoiceNumber != null && (
                        <span data-tip={orderIdx === firstDeliveredIdx ? 'so-invoice-number' : undefined}> · Invoice #{order.invoiceNumber}</span>
                      )}
                    </div>
                    {order.isConnection && order.receivedConfirmed && (
                      order.receivedQuantity != null && order.receivedQuantity !== order.quantity ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 11, fontWeight: 700, color: '#f59e0b', background: dark ? 'rgba(245,158,11,0.12)' : '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: '2px 8px' }}>
                          ⚑ Discrepancy noted · received {order.receivedQuantity} of {order.quantity}
                        </span>
                      ) : (
                        <span style={{ display: 'inline-block', marginTop: 5, fontSize: 11, fontWeight: 700, color: '#22c55e' }}>✓ Receipt confirmed</span>
                      )
                    )}
                  </div>
                  {/* Status badge */}
                  <div
                    data-tip={order.isConnection && orderIdx === firstConnIdx ? 'so-order-status' : undefined}
                    style={{
                      padding: '4px 10px', borderRadius: 10,
                      background: meta.bg[dark ? 'dark' : 'light'],
                      fontSize: 11, fontWeight: 700, color: meta.color,
                      flexShrink: 0,
                    }}
                  >
                    {meta.label}
                  </div>
                </div>
              </button>

              {/* Expanded actions */}
              {expanded && order.isConnection && (
                <div style={{ borderTop: `1px solid ${C.divider}`, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {order.notes && (
                    <p style={{ width: '100%', fontSize: 12, color: C.textMuted, margin: '0 0 8px', fontStyle: 'italic' }}>
                      "{order.notes}"
                    </p>
                  )}
                  <p style={{ width: '100%', fontSize: 12, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
                    Sent to {order.driverName}'s Keiro account — they update the status
                    as they accept and deliver.
                  </p>
                  {/* Convention: ghost/Cancel left → primary right. */}
                  {order.status === 'pending' && (
                    <button style={{ ...s.actionBtn(C), color: C.textMuted, borderColor: C.divider }}
                      onClick={() => { handleConnCancel(order.id); setExpandedId(null); }}>
                      Cancel Order
                    </button>
                  )}
                  <button style={{ ...s.actionBtn(C), color: ACCENT, borderColor: ACCENT }}
                    onClick={() => handleReorder(order)}>
                    Reorder
                  </button>
                  {order.status === 'delivered' && !order.receivedConfirmed && (
                    <button style={{ ...s.actionBtn(C), background: ACCENT, color: '#fff', borderColor: ACCENT }}
                      onClick={() => setConfirmReceipt(order)}>
                      Confirm Receipt
                    </button>
                  )}
                </div>
              )}
              {expanded && !order.isConnection && (
                <div style={{ borderTop: `1px solid ${C.divider}`, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {order.notes && (
                    <p style={{ width: '100%', fontSize: 12, color: C.textMuted, margin: '0 0 8px', fontStyle: 'italic' }}>
                      "{order.notes}"
                    </p>
                  )}
                  {/* Convention: dismiss/destructive (Cancel, Delete) left → forward-progress primary right. */}
                  {order.status !== 'cancelled' && order.status !== 'delivered' && (
                    <button style={{ ...s.actionBtn(C), color: C.textMuted, borderColor: C.divider }}
                      onClick={() => { handleStatus(order.id, 'cancelled'); setExpandedId(null); }}>
                      Cancel
                    </button>
                  )}
                  <button style={{ ...s.actionBtn(C), color: C.danger, borderColor: C.danger }}
                    onClick={() => setConfirmDelete({ id: order.id, productName: order.productName })}>
                    Delete
                  </button>
                  <button style={{ ...s.actionBtn(C), color: ACCENT, borderColor: ACCENT }}
                    onClick={() => handleReorder(order)}>
                    Reorder
                  </button>
                  {order.status === 'pending' && (
                    <button style={{ ...s.actionBtn(C), color: ACCENT, borderColor: ACCENT }}
                      onClick={() => { handleStatus(order.id, 'accepted'); setExpandedId(null); }}>
                      Mark Accepted
                    </button>
                  )}
                  {order.status !== 'delivered' && order.status !== 'cancelled' && (
                    <button style={{ ...s.actionBtn(C), color: '#22c55e', borderColor: '#22c55e' }}
                      onClick={() => { handleStatus(order.id, 'delivered'); setExpandedId(null); }}>
                      Mark Delivered
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

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
            refresh();
          }}
          onClose={() => setConfirmReceipt(null)}
        />
      )}

      {/* Delete confirm modal */}
      {confirmDelete && portal(
        <div style={s.overlay} onClick={() => setConfirmDelete(null)}>
          <div style={{ ...s.modal(C) }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>Delete order?</p>
            <p style={{ fontSize: 14, color: C.textSub, margin: '0 0 20px', lineHeight: 1.5 }}>
              Remove the request for "{confirmDelete.productName}"? This can't be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...s.modalBtn(C), background: C.inputBg, color: C.text, borderColor: C.inputBorder }}
                onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button style={{ ...s.modalBtn(C), background: C.danger, color: '#fff', borderColor: C.danger }}
                onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const s = {
  iconBtn: (C) => ({
    background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
    color: C.text, padding: '4px 6px', WebkitTapHighlightColor: 'transparent', lineHeight: 1,
  }),
  accentBtn: {
    background: ACCENT, border: 'none', color: '#fff',
    padding: '10px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  actionBtn: () => ({
    background: 'none', border: '1.5px solid', borderRadius: 10,
    padding: '7px 14px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  }),
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modal: (C) => ({
    width: '100%', maxWidth: 340, borderRadius: 18,
    border: `1px solid ${C.cardBorder}`, background: C.card,
    padding: '22px 20px 18px', boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
  }),
  modalBtn: () => ({
    flex: 1, height: 46, borderRadius: 12, border: '1px solid',
    fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  }),
};
