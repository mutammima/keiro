/**
 * ReceivingSheet — store owner confirms the quantity actually received for a
 * delivered connection order. Bottom sheet, portaled to document.body (iOS
 * containing-block rule). Pre-fills the received quantity with the ordered
 * quantity; editing it to differ flags a discrepancy.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

export default function ReceivingSheet({ order, onConfirm, onClose }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const ordered = Number(order.quantity) || 0;
  const [qty, setQty]     = useState(String(ordered));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const received    = Number(qty);
  const discrepancy = qty !== '' && received !== ordered;

  function confirm() {
    if (qty === '' || saving) return;
    setSaving(true);
    onConfirm({ receivedQuantity: received, receivingNotes: notes.trim() });
  }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', background: C.card, border: `1px solid ${C.cardBorder}`, padding: '20px 20px max(24px, env(safe-area-inset-bottom))', boxShadow: '0 -8px 40px rgba(0,0,0,0.4)', animation: 'tut-fadein 0.18s ease both' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.divider, margin: '0 auto 16px' }} />
        <p style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 4px' }}>Confirm receipt</p>
        <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 18px' }}>{order.productName}</p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.divider}`, marginBottom: 14 }}>
          <span style={{ fontSize: 14, color: C.textSub }}>Ordered quantity</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{ordered}</span>
        </div>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSub, margin: '0 2px 6px' }}>Quantity received</label>
        <input
          type="number" inputMode="numeric" min="0" value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
          style={{ width: '100%', boxSizing: 'border-box', height: 50, fontSize: 16, padding: '0 14px', borderRadius: 12, outline: 'none', WebkitAppearance: 'none', background: C.inputBg, border: `1px solid ${discrepancy ? '#f59e0b' : C.inputBorder}`, color: C.text }}
        />
        {discrepancy && (
          <p style={{ fontSize: 12, color: '#f59e0b', margin: '6px 2px 0' }}>Differs from the {ordered} ordered — add a note below if helpful.</p>
        )}

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSub, margin: '14px 2px 6px' }}>
          Notes <span style={{ color: C.textMuted, fontWeight: 400 }}>optional</span>
        </label>
        <textarea
          value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2 cases were damaged"
          style={{ width: '100%', boxSizing: 'border-box', height: 70, fontSize: 15, padding: '10px 14px', borderRadius: 12, outline: 'none', resize: 'none', background: C.inputBg, border: `1px solid ${C.inputBorder}`, color: C.text, lineHeight: 1.5 }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, height: 50, borderRadius: 14, border: `1px solid ${C.inputBorder}`, background: C.inputBg, color: C.text, fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>Cancel</button>
          <button onClick={confirm} disabled={qty === '' || saving} style={{ flex: 1, height: 50, borderRadius: 14, border: 'none', background: ACCENT, color: '#fff', fontSize: 15, fontWeight: 700, cursor: (qty === '' || saving) ? 'default' : 'pointer', opacity: (qty === '' || saving) ? 0.5 : 1, WebkitTapHighlightColor: 'transparent' }}>Confirm</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
