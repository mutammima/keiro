import { useState } from 'react';
import {
  getAllProducts,
  saveProductBarcode,
  updateProduct,
  deleteProduct,
  getProductNames,
  saveProductName,
} from '../utils/storage';

function uid() {
  return '_' + Math.random().toString(36).slice(2);
}

export default function Products({ onOpenDrawer }) {
  const [catalog, setCatalog] = useState(() => getAllProducts()); // { barcode: { name, lastPrice } }
  const [editingBarcode, setEditingBarcode] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');

  // Add new product form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [addError, setAddError] = useState('');

  const products = Object.entries(catalog).map(([barcode, data]) => ({
    barcode,
    name: data.name,
    price: data.lastPrice,
  })).sort((a, b) => a.name.localeCompare(b.name));

  function startEdit(p) {
    setEditingBarcode(p.barcode);
    setEditName(p.name);
    setEditPrice(String(p.price));
  }

  function saveEdit() {
    if (!editName.trim()) return;
    const priceNum = Number(editPrice);
    if (isNaN(priceNum) || priceNum < 0) return;
    updateProduct(editingBarcode, editName.trim(), priceNum);
    setCatalog(getAllProducts());
    setEditingBarcode(null);
  }

  function handleDelete(barcode) {
    deleteProduct(barcode);
    setCatalog(getAllProducts());
  }

  function handleAddProduct() {
    setAddError('');
    if (!newName.trim()) return setAddError('Enter a product name.');
    const priceNum = Number(newPrice);
    if (newPrice !== '' && (isNaN(priceNum) || priceNum < 0)) return setAddError('Enter a valid price.');
    const barcode = 'manual_' + uid();
    saveProductBarcode(barcode, newName.trim(), priceNum || 0);
    saveProductName(newName.trim());
    setCatalog(getAllProducts());
    setNewName(''); setNewPrice(''); setShowAdd(false);
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.hamburger} onClick={onOpenDrawer} aria-label="Open menu">☰</button>
        <span style={styles.title}>Products</span>
        <button style={styles.addBtn} onClick={() => setShowAdd(v => !v)}>
          {showAdd ? '✕' : '+ Add'}
        </button>
      </div>

      <div style={styles.body}>
        {/* Add product form */}
        {showAdd && (
          <div style={styles.card}>
            <p style={styles.sectionTitle}>New Product</p>
            <label style={styles.label}>Product Name *</label>
            <input
              style={styles.input}
              placeholder="e.g. Marlboro Reds"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
            <label style={styles.label}>Default Price ($)</label>
            <input
              style={{ ...styles.input, marginBottom: 0 }}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
            />
            {addError && <p style={styles.error}>{addError}</p>}
            <button style={styles.saveNewBtn} onClick={handleAddProduct}>Save Product</button>
          </div>
        )}

        {products.length === 0 && !showAdd ? (
          <div style={styles.empty}>
            <span style={{ fontSize: 48 }}>📦</span>
            <p style={styles.emptyText}>No products yet.</p>
            <p style={styles.emptySubText}>Products are saved automatically when you scan a barcode or add items to invoices. You can also add them manually above.</p>
          </div>
        ) : (
          <div style={styles.card}>
            <p style={styles.sectionTitle}>Saved Products ({products.length})</p>
            <div style={styles.list}>
              {products.map((p, idx) => (
                <div key={p.barcode}>
                  {idx > 0 && <div style={styles.divider} />}
                  {editingBarcode === p.barcode ? (
                    <div style={styles.editRow}>
                      <input
                        style={styles.editInput}
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                      />
                      <input
                        style={{ ...styles.editInput, width: 80, flexShrink: 0 }}
                        inputMode="decimal"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editPrice}
                        onChange={e => setEditPrice(e.target.value)}
                      />
                      <button style={styles.iconBtn} onClick={saveEdit}>✓</button>
                      <button style={{ ...styles.iconBtn, color: '#aaa' }} onClick={() => setEditingBarcode(null)}>✕</button>
                    </div>
                  ) : (
                    <div style={styles.productRow}>
                      <div style={styles.productInfo}>
                        <span style={styles.productName}>{p.name}</span>
                        <span style={styles.productPrice}>${Number(p.price).toFixed(2)}</span>
                        {!p.barcode.startsWith('manual_') && (
                          <span style={styles.barcodeTag}>📷 {p.barcode}</span>
                        )}
                      </div>
                      <div style={styles.productActions}>
                        <button style={styles.iconBtn} onClick={() => startEdit(p)}>✎</button>
                        <button style={{ ...styles.iconBtn, color: '#e53e3e' }} onClick={() => handleDelete(p.barcode)}>🗑</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.infoBox}>
          <p style={styles.infoText}>
            💡 Products are automatically saved when you scan a barcode or add items to an invoice. Next time you type that product name, it'll autofill. Next time you scan the barcode, the name and price will pre-fill instantly.
          </p>
        </div>
      </div>
    </div>
  );
}

const ACCENT = '#1a73e8';

const styles = {
  page: {
    minHeight: '100dvh',
    background: '#f2f2f7',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    background: '#fff',
    borderBottom: '1px solid #e5e5e5',
    padding: '14px 16px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  hamburger: {
    background: 'none',
    border: 'none',
    fontSize: 24,
    color: '#333',
    cursor: 'pointer',
    padding: '2px 4px',
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 800,
    color: '#111',
    textAlign: 'center',
  },
  addBtn: {
    background: ACCENT,
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    padding: '8px 14px',
    borderRadius: 20,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  body: {
    padding: '16px 16px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    maxWidth: 480,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: 18,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#444',
    margin: '0 0 14px',
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#444',
    marginBottom: 4,
    marginTop: 12,
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
    WebkitAppearance: 'none',
    marginBottom: 4,
  },
  error: { color: '#c53030', fontSize: 13, margin: '6px 0 0', fontWeight: 600 },
  saveNewBtn: {
    width: '100%',
    marginTop: 14,
    height: 52,
    background: ACCENT,
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
  },
  list: { display: 'flex', flexDirection: 'column' },
  divider: { height: 1, background: '#f5f5f5', margin: '4px 0' },
  productRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
    gap: 8,
  },
  productInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#111',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  productPrice: { fontSize: 14, color: '#1a73e8', fontWeight: 700 },
  barcodeTag: {
    fontSize: 11,
    color: '#aaa',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  productActions: { display: 'flex', gap: 4, flexShrink: 0 },
  iconBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    color: '#888',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    padding: 0,
    WebkitTapHighlightColor: 'transparent',
  },
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 0',
  },
  editInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    padding: '0 10px',
    border: '1.5px solid #1a73e8',
    borderRadius: 8,
    background: '#f0f7ff',
    color: '#111',
    outline: 'none',
    minWidth: 0,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
    textAlign: 'center',
  },
  emptyText: { fontSize: 18, fontWeight: 700, color: '#555', margin: 0 },
  emptySubText: { fontSize: 13, color: '#aaa', margin: 0, maxWidth: 300, lineHeight: 1.5 },
  infoBox: {
    background: '#e8f0fe',
    borderRadius: 12,
    padding: '14px 16px',
  },
  infoText: {
    fontSize: 13,
    color: '#1a56c4',
    margin: 0,
    lineHeight: 1.6,
  },
};
