import { useState } from 'react';

/**
 * Bottom-sheet modal for editing an existing invoice item.
 *
 * Props:
 *   item: { id, name, qty, price }
 *   onSave(updatedItem)
 *   onClose()
 */
export default function EditItemModal({ item, onSave, onClose }) {
  const [name,  setName]  = useState(item.name);
  const [qty,   setQty]   = useState(String(item.qty));
  const [price, setPrice] = useState(String(item.price));
  const [error, setError] = useState('');

  function handleSave() {
    setError('');
    if (!name.trim()) return setError('Product name required.');
    const qtyNum = Number(qty);
    const priceNum = Number(price);
    if (!qty || isNaN(qtyNum) || qtyNum <= 0) return setError('Enter a valid quantity.');
    if (price === '' || isNaN(priceNum) || priceNum < 0) return setError('Enter a valid price.');
    onSave({ ...item, name: name.trim(), qty: qtyNum, price: priceNum });
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={e => e.stopPropagation()}>
        <div style={styles.handle} />
        <p style={styles.title}>Edit Item</p>

        <label style={styles.label}>Product Name</label>
        <input
          style={styles.input}
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Quantity</label>
            <input
              style={styles.input}
              inputMode="decimal"
              type="number"
              min="0"
              value={qty}
              onChange={e => setQty(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Unit Price ($)</label>
            <input
              style={styles.input}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
            />
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.btnRow}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={styles.saveBtn} onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    zIndex: 3000,
    display: 'flex',
    alignItems: 'flex-end',
  },
  sheet: {
    background: '#fff',
    borderRadius: '20px 20px 0 0',
    padding: '12px 20px 40px',
    paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
    width: '100%',
    boxSizing: 'border-box',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    background: '#ddd',
    margin: '0 auto 16px',
  },
  title: {
    fontSize: 18,
    fontWeight: 800,
    color: '#111',
    margin: '0 0 16px',
    textAlign: 'center',
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#444',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    height: 52,
    fontSize: 16,
    padding: '0 14px',
    border: '1.5px solid #ddd',
    borderRadius: 10,
    background: '#fafafa',
    color: '#111',
    outline: 'none',
    marginBottom: 12,
    WebkitAppearance: 'none',
  },
  row: {
    display: 'flex',
    gap: 12,
  },
  error: {
    color: '#c53030',
    fontSize: 14,
    margin: '0 0 8px',
    fontWeight: 600,
  },
  btnRow: {
    display: 'flex',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    background: '#f0f0f0',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    color: '#555',
    cursor: 'pointer',
  },
  saveBtn: {
    flex: 2,
    height: 52,
    background: '#1a73e8',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
  },
};
