/**
 * SOOrders — Tab 2 for Store Owner role.
 * Lists all order requests with status management.
 */

import { useState } from 'react';
import { createPortal as portal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { getOrders, updateOrderStatus, deleteOrder } from '../../utils/storeOwnerStorage';
import AppFooter from '../../components/navigation/AppFooter';

const STATUS_META = {
  pending:   { label: 'Pending',   color: '#f59e0b', bg: { light: '#fffbeb', dark: '#1f1000' } },
  accepted:  { label: 'Accepted',  color: ACCENT,    bg: { light: '#eff6ff', dark: '#0a1a3a' } },
  delivered: { label: 'Delivered', color: '#22c55e', bg: { light: '#f0fdf4', dark: '#0D2B20' } },
  cancelled: { label: 'Cancelled', color: '#6b7280', bg: { light: '#f3f4f6', dark: '#1a1a1a' } },
};

const FILTERS = ['all', 'pending', 'accepted', 'delivered', 'cancelled'];

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SOOrders({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [filter,        setFilter]        = useState('all');
  const [orders,        setOrders]        = useState(() => getOrders());
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expandedId,    setExpandedId]    = useState(null);

  function refresh() { setOrders(getOrders()); }

  function handleStatus(id, status) {
    updateOrderStatus(id, status);
    refresh();
  }

  function handleDelete() {
    if (!confirmDelete) return;
    deleteOrder(confirmDelete.id);
    setConfirmDelete(null);
    refresh();
  }

  const visible = filter === 'all'
    ? orders
    : orders.filter(o => o.status === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: C.bg }}>

      {/* Header */}
      <div style={{ ...glassStyle(dark), padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onOpenDrawer} style={s.iconBtn(C)}>☰</button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center' }}>Orders</span>
        <div style={{ width: 36 }} />
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 4px', overflowX: 'auto' }}>
        {FILTERS.map(f => {
          const active = filter === f;
          return (
            <button
              key={f}
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
              {f === 'all' ? 'All' : STATUS_META[f]?.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div style={{ padding: '8px 16px 100px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {visible.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>No orders yet</p>
            <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 20px' }}>
              {filter === 'all' ? 'Tap Request to create your first order.' : `No ${filter} orders.`}
            </p>
            {filter === 'all' && (
              <button style={s.accentBtn} onClick={() => onNav('so-request')}>+ New Request</button>
            )}
          </div>
        ) : visible.map(order => {
          const meta = STATUS_META[order.status] || STATUS_META.pending;
          const expanded = expandedId === order.id;
          return (
            <div
              key={order.id}
              style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18, overflow: 'hidden' }}
            >
              {/* Main row */}
              <button
                onClick={() => setExpandedId(expanded ? null : order.id)}
                style={{ width: '100%', background: 'none', border: 'none', padding: '14px 16px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'left' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 3 }}>
                      {order.productName}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>
                      Qty: <strong style={{ color: C.textSub }}>{order.quantity}</strong>
                      {' · '}
                      {formatDate(order.deliveryDate)}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                      {order.driverName}
                    </div>
                  </div>
                  {/* Status badge */}
                  <div style={{
                    padding: '4px 10px', borderRadius: 10,
                    background: meta.bg[dark ? 'dark' : 'light'],
                    fontSize: 11, fontWeight: 700, color: meta.color,
                    flexShrink: 0,
                  }}>
                    {meta.label}
                  </div>
                </div>
              </button>

              {/* Expanded actions */}
              {expanded && (
                <div style={{ borderTop: `1px solid ${C.divider}`, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {order.notes && (
                    <p style={{ width: '100%', fontSize: 12, color: C.textMuted, margin: '0 0 8px', fontStyle: 'italic' }}>
                      "{order.notes}"
                    </p>
                  )}
                  {order.status !== 'delivered' && order.status !== 'cancelled' && (
                    <button style={{ ...s.actionBtn(C), color: '#22c55e', borderColor: '#22c55e' }}
                      onClick={() => { handleStatus(order.id, 'delivered'); setExpandedId(null); }}>
                      Mark Delivered
                    </button>
                  )}
                  {order.status === 'pending' && (
                    <button style={{ ...s.actionBtn(C), color: ACCENT, borderColor: ACCENT }}
                      onClick={() => { handleStatus(order.id, 'accepted'); setExpandedId(null); }}>
                      Mark Accepted
                    </button>
                  )}
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
                </div>
              )}
            </div>
          );
        })}

        <AppFooter onNav={onNav} />
      </div>

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
  actionBtn: (C) => ({
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
  modalBtn: (C) => ({
    flex: 1, height: 46, borderRadius: 12, border: '1px solid',
    fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  }),
};
