/**
 * NewRequest — Tab 1 for Store Owner role.
 * Creates an order request (product, quantity, delivery date, assigned driver).
 */

import { useState, useEffect, useRef } from 'react';
import { STORAGE_KEYS } from '../../utils/constants';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { getDrivers, saveOrder, loadDriversFromCloud } from '../../utils/storeOwnerStorage';
import { getActiveConnections, loadConnectionsFromCloud } from '../../utils/connectionStorage';
import { sendConnectionOrder } from '../../utils/connectionOrderStorage';
import { saveMyDemand } from '../../utils/marketplaceStorage';
import { getBusinessName, getBusinessPhone } from '../../utils/storage';
import { formatInvoiceDate } from '../../utils/invoiceUtils';
import { getCurrentPosition } from '../../utils/geo';
import { canSaveGuestEntry, isGuest } from '../../utils/guestMode';
import { GuestCapModal, GuestBanner } from '../../components/auth/GuestUpsell';
import AppFooter from '../../components/navigation/AppFooter';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

/** Small red asterisk for required fields — mirrors the driver form's <Req /> convention. */
const Req = () => <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>;

// Shown when a guest tries to send an order that can only reach a driver through
// the cloud. Names the real reason (no account) instead of letting the order look
// "placed" while it silently reaches no one.
const SEND_WALL_COPY = {
  title: 'Create an account to send this order',
  subtitle: 'Orders reach drivers through the cloud, so they need a free account. Sign up and a driver can see and accept this request — your local data comes with you.',
  cta: 'Create Free Account',
};

export default function NewRequest({ onNav, onBack }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  // Committed line items for this request. The productName/quantity/price fields
  // below are the "add item" input row — a request can hold many lines.
  const [items,         setItems]         = useState([]);
  const [productName,   setProductName]   = useState('');
  const [quantity,      setQuantity]      = useState('');
  const [price,         setPrice]         = useState('');
  const [deliveryDate,  setDeliveryDate]  = useState('');
  const [driverId,      setDriverId]      = useState('');
  const [notes,         setNotes]         = useState('');
  const [errors,        setErrors]        = useState({});
  const [submitted,     setSubmitted]     = useState(false);
  const [guestWall,     setGuestWall]     = useState(false);
  // Tailored copy for the guest wall. null → GuestCapModal's default (entry-cap)
  // message; set to SEND_WALL_COPY when the block is because the order can only
  // reach a driver through the cloud (a connected-driver send or an unassigned
  // marketplace broadcast), which a guest session can't do.
  const [wallCopy,      setWallCopy]      = useState(null);
  // Reorder prefill: original notes are staged but NOT copied unless the user
  // opts in via the "Copy notes from original" toggle (per spec).
  const [originalNotes, setOriginalNotes] = useState('');
  const [copyNotes,     setCopyNotes]     = useState(false);

  const [drivers, setDrivers] = useState(() => getDrivers());
  const [conns,   setConns]   = useState(() => getActiveConnections());

  // Best-effort store location, stamped on broadcast demand so nearby drivers
  // surface first. Null when the store declines location.
  const coords = useRef(null);

  useEffect(() => {
    loadDriversFromCloud().then(list => setDrivers(list)).catch(() => {});
    loadConnectionsFromCloud().then(list => setConns((list || []).filter(c => c.status === 'active'))).catch(() => {});
    getCurrentPosition().then(c => { if (c) coords.current = c; }).catch(() => {});
  }, []);

  // Reorder prefill — written by stageReorder() before navigating here. Only
  // consume entries flagged `reorder` (leave any driver-invoice prefill alone).
  useEffect(() => {
    let p;
    try { p = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFILL) || 'null'); } catch { p = null; }
    if (!p || !p.reorder) return;
    try { localStorage.removeItem(STORAGE_KEYS.PREFILL); } catch { /* ignore */ }
    // Multi-line reorder restores every committed line; a legacy single-line
    // prefill still populates the add-item input row.
    if (Array.isArray(p.items) && p.items.length) {
      setItems(p.items.map(it => ({ id: uid(), name: it.name, qty: Number(it.qty) || 1, price: Number(it.price) || 0 })));
    } else {
      if (p.productName) setProductName(p.productName);
      if (p.quantity != null) setQuantity(String(p.quantity));
      if (p.price != null && p.price !== '') setPrice(String(p.price));
    }
    if (p.driverId) setDriverId(p.driverId);
    // Fresh delivery date defaulting to tomorrow (user can change it).
    const t = new Date(); t.setDate(t.getDate() + 1);
    setDeliveryDate(t.toISOString().slice(0, 10));
    if (p.notes) setOriginalNotes(p.notes);
  }, []);

  /** Driver's display name on a connection, from the store's side. */
  function connDriverName(c) {
    return (c.inviterRole === 'driver' ? c.inviterName : c.redeemerName) || 'Connected driver';
  }

  /** The add-item input row folded into a line item, or null if incomplete. */
  function pendingLine() {
    const name = productName.trim();
    const qtyN = Number(quantity);
    if (!name || !qtyN || qtyN <= 0) return null;
    return { id: uid(), name, qty: qtyN, price: Number(price) || 0 };
  }

  /** All lines: committed items plus a valid-but-not-yet-added input row. */
  function collectItems() {
    const line = pendingLine();
    return line ? [...items, line] : [...items];
  }

  /** Commit the input row to the item list (mirrors the driver invoice's Add Item). */
  function addItem() {
    const name = productName.trim();
    const qtyN = Number(quantity);
    const e = {};
    if (!name) e.productName = 'Product name is required.';
    if (!qtyN || qtyN <= 0) e.quantity = 'Enter a valid quantity.';
    if (Object.keys(e).length) { setErrors(v => ({ ...v, ...e })); return; }
    setItems(list => [...list, { id: uid(), name, qty: qtyN, price: Number(price) || 0 }]);
    setProductName(''); setQuantity(''); setPrice('');
    setErrors(v => ({ ...v, productName: '', quantity: '', items: '' }));
  }

  function removeItem(id) {
    setItems(list => list.filter(it => it.id !== id));
  }

  function resetForm() {
    setItems([]); setProductName(''); setQuantity(''); setPrice('');
    setDeliveryDate(''); setDriverId(''); setNotes(''); setErrors({}); setSubmitted(false);
  }

  function validate() {
    const e = {};
    if (collectItems().length === 0) e.items = 'Add at least one product.';
    if (!deliveryDate) e.deliveryDate = 'Pick a delivery date.';
    return e;
  }

  function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }

    // Guest hard cap: block the save and surface the account-upsell modal.
    if (!canSaveGuestEntry()) { setGuestWall(true); return; }

    // Connected driver selected → the order travels to THEIR account over the
    // connection (connection_orders), not into this store's private list.
    if (driverId.startsWith('conn:')) {
      // A cross-account send needs a session to reach the driver — hard-block guests.
      if (isGuest()) { setWallCopy(SEND_WALL_COPY); setGuestWall(true); return; }
      const conn = conns.find(c => `conn:${c.id}` === driverId);
      if (conn) {
        const lines = collectItems();
        const first = lines[0];
        sendConnectionOrder(conn, {
          items:        lines,
          productName:  first.name,
          quantity:     first.qty,
          price:        first.price,
          deliveryDate,
          notes:        notes.trim(),
          storeName:    getBusinessName() || 'A store',
          driverName:   connDriverName(conn),
        });
        setSubmitted(true);
        setTimeout(() => { resetForm(); onNav('so-orders'); }, 700);
        return;
      }
    }

    // No driver assigned → this order can only reach drivers via the marketplace
    // broadcast, which needs a session. Block guests with the account wall BEFORE
    // saving, so we never leave a "Pending" order that silently reached no one.
    if (!driverId && isGuest()) {
      setWallCopy(SEND_WALL_COPY); setGuestWall(true); return;
    }

    const driver = drivers.find(d => d.id === driverId);
    const lines = collectItems();
    const first = lines[0];
    const order = {
      id: uid(),
      items: lines,
      productName: first.name,   // first line summarises the order for legacy views
      quantity: first.qty,
      price: first.price,
      deliveryDate,
      driverId: driverId || null,
      driverName: driver ? driver.name : 'Unassigned',
      status: 'pending',
      createdAt: new Date().toISOString(),
      notes: notes.trim(),
    };

    saveOrder(order);

    // No driver assigned → broadcast this order to the marketplace so any driver
    // who carries the product can discover and accept it. Assigning a specific
    // driver keeps it a private handoff (not published).
    if (!driverId) {
      // The marketplace demand feed is single-product, so broadcast the first line.
      saveMyDemand({
        id: order.id,
        storeName:   getBusinessName()  || 'A store',
        storePhone:  getBusinessPhone() || '',
        productName: first.name,
        quantity:    first.qty,
        targetPrice: first.price,
        neededBy:    order.deliveryDate,
        notes:       order.notes,
        status:      'open',
        lat:         coords.current ? coords.current.lat : null,
        lng:         coords.current ? coords.current.lng : null,
      });
    }

    setSubmitted(true);

    // Reset form after a brief confirmation flash
    setTimeout(() => { resetForm(); onNav('so-orders'); }, 700);
  }

  const inp = {
    background: C.inputBg, borderColor: C.inputBorder, color: C.text,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: C.bg }}>

      <GuestCapModal open={guestWall} onClose={() => { setGuestWall(false); setWallCopy(null); }} {...(wallCopy || {})} />

      {/* Header */}
      <div style={{ ...glassStyle(dark), padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 14 }}>
        {onBack ? (
          <button onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', fontSize: 22, color: C.text, cursor: 'pointer', padding: '3px 4px', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}>←</button>
        ) : (
          <div style={{ width: 36 }} />
        )}
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center' }}>New Request</span>
        <div style={{ width: 36 }} />
      </div>

      {/* Form */}
      <div style={{ padding: '16px 16px 100px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Guest-mode persistent warning — local-only data, no cloud backup */}
        {isGuest() && (
          <GuestBanner
            title="You're in guest mode"
            subtitle="Your data is saved on this device only. Create a free account to back up your orders."
            cta="Create Account"
          />
        )}

        {/* Products */}
        <div style={{ ...s.card(C) }}>
          <p style={s.sectionLabel(C)}>What do you need?</p>

          {/* Committed line items — a request can hold several products */}
          {items.length > 0 && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(it => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                      Qty {it.qty}{Number(it.price) > 0 ? ` · $${Number(it.price).toFixed(2)} each` : ''}
                    </div>
                  </div>
                  {Number(it.price) > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flexShrink: 0 }}>${(it.qty * it.price).toFixed(2)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    aria-label={`Remove ${it.name}`}
                    style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, minHeight: 40, background: 'none', border: 'none', color: C.textMuted, fontSize: 18, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          <label data-tutorial="so-label-product" style={s.label(C)}>
            {items.length > 0 ? 'Add another product' : <>Product Name <Req /></>}
          </label>
          <input
            data-tutorial="so-request-product"
            style={{ ...s.input, ...inp, borderColor: errors.productName ? C.danger : C.inputBorder }}
            placeholder="e.g. Whole Milk 1 Gal"
            value={productName}
            onChange={e => { setProductName(e.target.value); setErrors(v => ({ ...v, productName: '', items: '' })); }}
          />
          {errors.productName && <p style={s.error(C)}>{errors.productName}</p>}

          <label data-tutorial="so-label-qty" style={{ ...s.label(C), marginTop: 14 }}>
            Quantity {items.length === 0 && <Req />}
          </label>
          <input
            data-tutorial="so-request-qty"
            type="number"
            min="1"
            style={{ ...s.input, ...inp, borderColor: errors.quantity ? C.danger : C.inputBorder }}
            placeholder="e.g. 10"
            value={quantity}
            onChange={e => { setQuantity(e.target.value); setErrors(v => ({ ...v, quantity: '', items: '' })); }}
          />
          {errors.quantity && <p style={s.error(C)}>{errors.quantity}</p>}

          <label style={{ ...s.label(C), marginTop: 14 }}>
            Unit Price <span style={{ color: C.textMuted, fontWeight: 400, fontSize: 11 }}>optional</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            style={{ ...s.input, ...inp }}
            placeholder="e.g. 3.50"
            value={price}
            onChange={e => setPrice(e.target.value)}
          />

          <button
            type="button"
            data-tutorial="so-add-item"
            onClick={addItem}
            style={{ width: '100%', marginTop: 14, height: 46, border: `1.5px dashed ${ACCENT}`, borderRadius: 12, background: 'none', color: ACCENT, fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            + Add Item
          </button>
          {errors.items && <p style={s.error(C)}>{errors.items}</p>}

          {(() => {
            const all = collectItems();
            const total = all.reduce((sum, i) => sum + i.qty * (Number(i.price) || 0), 0);
            if (total <= 0) return null;
            return (
              <p style={{ fontSize: 13, fontWeight: 600, color: C.textSub, margin: '10px 0 0' }}>
                Estimated total ({all.length} item{all.length !== 1 ? 's' : ''}): <span style={{ color: C.text }}>${total.toFixed(2)}</span>
              </p>
            );
          })()}
        </div>

        {/* Delivery date */}
        <div style={{ ...s.card(C) }}>
          <p style={s.sectionLabel(C)}>When do you need it?</p>

          <label data-tutorial="so-label-date" style={s.label(C)}>Requested Delivery Date <Req /></label>
          <input
            data-tutorial="so-request-date"
            type="date"
            style={{ ...s.input, ...inp, borderColor: errors.deliveryDate ? C.danger : C.inputBorder }}
            value={deliveryDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={e => { setDeliveryDate(e.target.value); setErrors(v => ({ ...v, deliveryDate: '' })); }}
          />
          {errors.deliveryDate && <p style={s.error(C)}>{errors.deliveryDate}</p>}
          {deliveryDate && !errors.deliveryDate && (
            <p style={{ fontSize: 13, fontWeight: 600, color: C.textSub, margin: '6px 0 0' }}>
              Requested for <span style={{ color: C.text }}>{formatInvoiceDate(new Date(deliveryDate + 'T00:00:00'))}</span>
            </p>
          )}
        </div>

        {/* Driver */}
        <div data-qs="assign-driver" style={{ ...s.card(C) }}>
          <p style={s.sectionLabel(C)}>Assign a Driver <span style={{ color: C.textMuted, fontWeight: 400, fontSize: 11 }}>optional</span></p>

          {drivers.length === 0 && conns.length === 0 ? (
            <div style={{ padding: '12px 0' }}>
              <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 10px' }}>
                No drivers added yet.
              </p>
              <button
                style={{ ...s.ghostBtn(C), fontSize: 13 }}
                onClick={() => onNav('so-drivers')}
              >
                Add a Driver
              </button>
            </div>
          ) : (
            <>
              <select
                style={{ ...s.input, ...inp }}
                value={driverId}
                onChange={e => setDriverId(e.target.value)}
              >
                <option value="">No driver assigned</option>
                {conns.map(c => (
                  <option key={`conn:${c.id}`} value={`conn:${c.id}`}>⇄ {connDriverName(c)} — connected</option>
                ))}
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {driverId.startsWith('conn:') && (
                <p style={{ fontSize: 12, color: C.textMuted, margin: '6px 0 0', lineHeight: 1.5 }}>
                  This order is sent straight to their Keiro account — you'll see the
                  status update when they accept and deliver it.
                </p>
              )}
            </>
          )}
        </div>

        {/* Notes */}
        <div style={{ ...s.card(C) }}>
          <p style={s.sectionLabel(C)}>Notes <span style={{ color: C.textMuted, fontWeight: 400, fontSize: 11 }}>optional</span></p>
          {originalNotes && (
            <button
              type="button"
              onClick={() => { const next = !copyNotes; setCopyNotes(next); setNotes(next ? originalNotes : ''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44,
                background: 'none', border: 'none', padding: '4px 0 10px', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent', textAlign: 'left',
              }}
            >
              <span style={{
                width: 38, height: 22, borderRadius: 11, flexShrink: 0, position: 'relative',
                background: copyNotes ? ACCENT : C.inputBorder, transition: 'background 0.2s',
              }}>
                <span style={{
                  position: 'absolute', top: 2, left: copyNotes ? 18 : 2, width: 18, height: 18,
                  borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                }} />
              </span>
              <span style={{ fontSize: 13, color: C.textSub }}>Copy notes from original</span>
            </button>
          )}
          <textarea
            style={{ ...s.input, ...inp, height: 80, padding: '10px 14px', resize: 'none', lineHeight: 1.5 }}
            placeholder="Any special instructions..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Submit */}
        <button
          data-tutorial="so-request-submit"
          onClick={handleSubmit}
          style={{
            height: 52, borderRadius: 16, border: 'none',
            background: submitted ? '#22c55e' : ACCENT,
            color: '#fff', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 4px 16px rgba(74,123,247,0.3)',
            transition: 'background 0.2s',
          }}
        >
          {submitted ? 'Request Sent!' : 'Send Request'}
        </button>

        <AppFooter onNav={onNav} />
      </div>
    </div>
  );
}

const s = {
  card: (C) => ({
    background: C.card, border: `1px solid ${C.cardBorder}`,
    borderRadius: 18, padding: '16px 18px',
  }),
  sectionLabel: (C) => ({
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: C.textMuted, margin: '0 0 12px',
  }),
  label: (C) => ({
    display: 'block', fontSize: 13, fontWeight: 500, color: C.textSub, marginBottom: 6,
  }),
  input: {
    width: '100%', boxSizing: 'border-box', height: 46,
    fontSize: 16, padding: '0 14px',
    border: '1px solid', borderRadius: 12,
    outline: 'none', WebkitAppearance: 'none', marginBottom: 4,
  },
  error: (C) => ({
    fontSize: 12, fontWeight: 600, color: C.danger, margin: '2px 0 0',
  }),
  iconBtn: (C) => ({
    background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
    color: C.text, padding: '4px 6px', WebkitTapHighlightColor: 'transparent', lineHeight: 1,
  }),
  ghostBtn: (C) => ({
    background: 'none', border: `1px solid ${C.inputBorder}`, borderRadius: 10,
    padding: '8px 14px', color: ACCENT, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  }),
};
