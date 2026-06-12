/**
 * NewRequest — Tab 1 for Store Owner role.
 * Creates an order request (product, quantity, delivery date, assigned driver).
 */

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { getDrivers, saveOrder, loadDriversFromCloud } from '../../utils/storeOwnerStorage';
import { getActiveConnections, loadConnectionsFromCloud } from '../../utils/connectionStorage';
import { sendConnectionOrder } from '../../utils/connectionOrderStorage';
import { saveMyDemand } from '../../utils/marketplaceStorage';
import { getBusinessName, getBusinessPhone } from '../../utils/storage';
import { getCurrentPosition } from '../../utils/geo';
import { canSaveGuestEntry, isGuest } from '../../utils/guestMode';
import { isTutorialActive } from '../../utils/tutorialState';
import { GuestCapModal, GuestBanner } from '../../components/auth/GuestUpsell';
import AppFooter from '../../components/navigation/AppFooter';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

export default function NewRequest({ onOpenDrawer, onNav, onBack }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [productName,   setProductName]   = useState('');
  const [quantity,      setQuantity]      = useState('');
  const [price,         setPrice]         = useState('');
  const [deliveryDate,  setDeliveryDate]  = useState('');
  const [driverId,      setDriverId]      = useState('');
  const [notes,         setNotes]         = useState('');
  const [errors,        setErrors]        = useState({});
  const [submitted,     setSubmitted]     = useState(false);
  const [guestWall,     setGuestWall]     = useState(false);

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

  /** Driver's display name on a connection, from the store's side. */
  function connDriverName(c) {
    return (c.inviterRole === 'driver' ? c.inviterName : c.redeemerName) || 'Connected driver';
  }

  function validate() {
    const e = {};
    if (!productName.trim()) e.productName = 'Product name is required.';
    if (!quantity || Number(quantity) <= 0) e.quantity = 'Enter a valid quantity.';
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
      if (isGuest()) { setGuestWall(true); return; }
      const conn = conns.find(c => `conn:${c.id}` === driverId);
      if (conn) {
        sendConnectionOrder(conn, {
          productName:  productName.trim(),
          quantity:     Number(quantity),
          price:        Number(price) || 0,
          deliveryDate,
          notes:        notes.trim(),
          storeName:    getBusinessName() || 'A store',
          driverName:   connDriverName(conn),
        });
        setSubmitted(true);
        setTimeout(() => {
          setProductName(''); setQuantity(''); setPrice(''); setDeliveryDate('');
          setDriverId(''); setNotes(''); setErrors({}); setSubmitted(false);
          onNav('so-orders');
        }, 700);
        return;
      }
    }

    const driver = drivers.find(d => d.id === driverId);
    const order = {
      id: uid(),
      productName: productName.trim(),
      quantity: Number(quantity),
      price: Number(price) || 0,
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
    // driver keeps it a private handoff (not published). Tutorial demo requests
    // must never reach the shared marketplace — every new store owner's tour
    // would otherwise publish a junk open order that real drivers can claim.
    if (!driverId && !isTutorialActive()) {
      saveMyDemand({
        id: order.id,
        storeName:   getBusinessName()  || 'A store',
        storePhone:  getBusinessPhone() || '',
        productName: order.productName,
        quantity:    order.quantity,
        targetPrice: order.price,
        neededBy:    order.deliveryDate,
        notes:       order.notes,
        status:      'open',
        lat:         coords.current ? coords.current.lat : null,
        lng:         coords.current ? coords.current.lng : null,
      });
    }

    setSubmitted(true);

    // Reset form after a brief confirmation flash
    setTimeout(() => {
      setProductName(''); setQuantity(''); setPrice(''); setDeliveryDate('');
      setDriverId(''); setNotes(''); setErrors({}); setSubmitted(false);
      onNav('so-orders');
    }, 700);
  }

  const inp = {
    background: C.inputBg, borderColor: C.inputBorder, color: C.text,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: C.bg }}>

      <GuestCapModal open={guestWall} onClose={() => setGuestWall(false)} />

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

        {/* Product */}
        <div style={{ ...s.card(C) }}>
          <p style={s.sectionLabel(C)}>What do you need?</p>

          <label data-tutorial="so-label-product" style={s.label(C)}>Product Name</label>
          <input
            data-tutorial="so-request-product"
            style={{ ...s.input, ...inp, borderColor: errors.productName ? C.danger : C.inputBorder }}
            placeholder="e.g. Whole Milk 1 Gal"
            value={productName}
            onChange={e => { setProductName(e.target.value); setErrors(v => ({ ...v, productName: '' })); }}
          />
          {errors.productName && <p style={s.error(C)}>{errors.productName}</p>}

          <label data-tutorial="so-label-qty" style={{ ...s.label(C), marginTop: 14 }}>Quantity</label>
          <input
            data-tutorial="so-request-qty"
            type="number"
            min="1"
            style={{ ...s.input, ...inp, borderColor: errors.quantity ? C.danger : C.inputBorder }}
            placeholder="e.g. 10"
            value={quantity}
            onChange={e => { setQuantity(e.target.value); setErrors(v => ({ ...v, quantity: '' })); }}
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
          {Number(quantity) > 0 && Number(price) > 0 && (
            <p style={{ fontSize: 13, fontWeight: 600, color: C.textSub, margin: '6px 0 0' }}>
              Estimated total: <span style={{ color: C.text }}>${(Number(quantity) * Number(price)).toFixed(2)}</span>
            </p>
          )}
        </div>

        {/* Delivery date */}
        <div style={{ ...s.card(C) }}>
          <p style={s.sectionLabel(C)}>When do you need it?</p>

          <label data-tutorial="so-label-date" style={s.label(C)}>Requested Delivery Date</label>
          <input
            data-tutorial="so-request-date"
            type="date"
            style={{ ...s.input, ...inp, borderColor: errors.deliveryDate ? C.danger : C.inputBorder }}
            value={deliveryDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={e => { setDeliveryDate(e.target.value); setErrors(v => ({ ...v, deliveryDate: '' })); }}
          />
          {errors.deliveryDate && <p style={s.error(C)}>{errors.deliveryDate}</p>}
        </div>

        {/* Driver */}
        <div style={{ ...s.card(C) }}>
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
                  <option key={`conn:${c.id}`} value={`conn:${c.id}`}>🔗 {connDriverName(c)} — connected</option>
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
