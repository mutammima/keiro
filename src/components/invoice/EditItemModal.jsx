import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

export default function EditItemModal({ item, onSave, onClose }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [name,  setName]  = useState(item.name);
  const [qty,   setQty]   = useState(String(item.qty));
  const [price, setPrice] = useState(String(item.price));
  const [error, setError] = useState('');

  function handleSave() {
    setError('');
    if (!name.trim()) return setError('Product name required.');
    const qtyNum = Number(qty), priceNum = Number(price);
    if (!qty || isNaN(qtyNum) || qtyNum <= 0) return setError('Enter a valid quantity.');
    if (price === '' || isNaN(priceNum) || priceNum < 0) return setError('Enter a valid price.');
    onSave({ ...item, name: name.trim(), qty: qtyNum, price: priceNum });
  }

  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.sheet, background: C.card, borderTopColor: C.cardBorder }} onClick={e => e.stopPropagation()}>
        <div style={{ ...s.handle, background: C.inputBorder }} />
        <p style={{ ...s.title, color: C.text }}>Edit Item</p>

        <label style={{ ...s.label, color: C.textSub }}>Product Name</label>
        <input style={{ ...s.input, ...inp }} value={name} onChange={e => setName(e.target.value)} autoFocus />

        <div style={s.row}>
          <div style={{ flex: 1 }}>
            <label style={{ ...s.label, color: C.textSub }}>Quantity</label>
            <input style={{ ...s.input, ...inp }} inputMode="decimal" type="number" min="0"
              value={qty} onChange={e => setQty(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ ...s.label, color: C.textSub }}>Unit Price ($)</label>
            <input style={{ ...s.input, ...inp }} inputMode="decimal" type="number" min="0" step="0.01"
              value={price} onChange={e => setPrice(e.target.value)} />
          </div>
        </div>

        {error && <p style={{ ...s.error, color: C.danger }}>{error}</p>}

        <div style={s.btnRow}>
          <button style={{ ...s.cancelBtn, background: C.rowBg, color: C.textSub }} onClick={onClose}>
            Cancel
          </button>
          <button style={s.saveBtn} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 3000, display: 'flex', alignItems: 'flex-end',
  },
  sheet: {
    borderRadius: '16px 16px 0 0',
    borderTop: '1px solid',
    padding: '10px 18px 40px',
    paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
    width: '100%', boxSizing: 'border-box',
  },
  handle: { width: 36, height: 3, borderRadius: 2, margin: '0 auto 14px' },
  title: { fontSize: 16, fontWeight: 700, margin: '0 0 14px', textAlign: 'center' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, letterSpacing: 0.1 },
  input: {
    width: '100%', boxSizing: 'border-box', height: 44,
    fontSize: 15, padding: '0 12px',
    border: '1px solid', borderRadius: 8,
    outline: 'none', marginBottom: 10, WebkitAppearance: 'none',
  },
  row: { display: 'flex', gap: 10 },
  error: { fontSize: 13, margin: '0 0 8px', fontWeight: 600 },
  btnRow: { display: 'flex', gap: 10, marginTop: 6 },
  cancelBtn: {
    flex: 1, height: 48, border: 'none', borderRadius: 10,
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  saveBtn: {
    flex: 2, height: 48, background: ACCENT, border: 'none',
    borderRadius: 10, fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer',
  },
};
