/**
 * NewRequest — Tab 1 for Store Owner role.
 * Creates an order request (product, quantity, delivery date, assigned driver).
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { getDrivers, saveOrder, loadDriversFromCloud } from '../../utils/storeOwnerStorage';
import AppFooter from '../../components/navigation/AppFooter';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

export default function NewRequest({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [productName,   setProductName]   = useState('');
  const [quantity,      setQuantity]      = useState('');
  const [deliveryDate,  setDeliveryDate]  = useState('');
  const [driverId,      setDriverId]      = useState('');
  const [notes,         setNotes]         = useState('');
  const [errors,        setErrors]        = useState({});
  const [submitted,     setSubmitted]     = useState(false);

  const [drivers, setDrivers] = useState(() => getDrivers());

  useEffect(() => {
    loadDriversFromCloud().then(list => setDrivers(list)).catch(() => {});
  }, []);

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

    const driver = drivers.find(d => d.id === driverId);
    const order = {
      id: uid(),
      productName: productName.trim(),
      quantity: Number(quantity),
      deliveryDate,
      driverId: driverId || null,
      driverName: driver ? driver.name : 'Unassigned',
      status: 'pending',
      createdAt: new Date().toISOString(),
      notes: notes.trim(),
    };

    saveOrder(order);
    setSubmitted(true);

    // Reset form after a brief confirmation flash
    setTimeout(() => {
      setProductName(''); setQuantity(''); setDeliveryDate('');
      setDriverId(''); setNotes(''); setErrors({}); setSubmitted(false);
      onNav('so-orders');
    }, 700);
  }

  const inp = {
    background: C.inputBg, borderColor: C.inputBorder, color: C.text,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: C.bg }}>

      {/* Header */}
      <div style={{ ...glassStyle(dark), padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onOpenDrawer} style={s.iconBtn(C)}>☰</button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center' }}>New Request</span>
        <div style={{ width: 36 }} />
      </div>

      {/* Form */}
      <div style={{ padding: '16px 16px 100px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Product */}
        <div style={{ ...s.card(C) }}>
          <p style={s.sectionLabel(C)}>What do you need?</p>

          <label style={s.label(C)}>Product Name</label>
          <input
            style={{ ...s.input, ...inp, borderColor: errors.productName ? C.danger : C.inputBorder }}
            placeholder="e.g. Whole Milk 1 Gal"
            value={productName}
            onChange={e => { setProductName(e.target.value); setErrors(v => ({ ...v, productName: '' })); }}
          />
          {errors.productName && <p style={s.error(C)}>{errors.productName}</p>}

          <label style={{ ...s.label(C), marginTop: 14 }}>Quantity</label>
          <input
            type="number"
            min="1"
            style={{ ...s.input, ...inp, borderColor: errors.quantity ? C.danger : C.inputBorder }}
            placeholder="e.g. 10"
            value={quantity}
            onChange={e => { setQuantity(e.target.value); setErrors(v => ({ ...v, quantity: '' })); }}
          />
          {errors.quantity && <p style={s.error(C)}>{errors.quantity}</p>}
        </div>

        {/* Delivery date */}
        <div style={{ ...s.card(C) }}>
          <p style={s.sectionLabel(C)}>When do you need it?</p>

          <label style={s.label(C)}>Requested Delivery Date</label>
          <input
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

          {drivers.length === 0 ? (
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
            <select
              style={{ ...s.input, ...inp }}
              value={driverId}
              onChange={e => setDriverId(e.target.value)}
            >
              <option value="">No driver assigned</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
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
