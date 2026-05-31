import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';
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
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [catalog, setCatalog] = useState(() => getAllProducts());
  const [editingBarcode, setEditingBarcode] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');

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
    <div style={{ ...s.page, background: C.bg }}>
      <div style={{ ...s.header, background: C.header, borderBottomColor: C.headerBorder }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer} aria-label="Open menu">☰</button>
        <span style={{ ...s.title, color: C.text }}>Products</span>
        <button
          style={{ ...s.addBtn }}
          onClick={() => setShowAdd(v => !v)}
        >
          {showAdd ? '✕' : '+ Add'}
        </button>
      </div>

      <div style={s.body}>
        {showAdd && (
          <div style={{ ...s.card, background: C.card }}>
            <p style={{ ...s.sectionTitle, color: C.textSub }}>New Product</p>
            <label style={{ ...s.label, color: C.textSub }}>Product Name *</label>
            <input
              style={{ ...s.input, background: C.inputBg, borderColor: C.inputBorder, color: C.text }}
              placeholder="e.g. Marlboro Reds"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
            <label style={{ ...s.label, color: C.textSub }}>Default Price ($)</label>
            <input
              style={{ ...s.input, background: C.inputBg, borderColor: C.inputBorder, color: C.text, marginBottom: 0 }}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
            />
            {addError && <p style={{ ...s.error, color: C.danger }}>{addError}</p>}
            <button style={s.saveNewBtn} onClick={handleAddProduct}>Save Product</button>
          </div>
        )}

        {products.length === 0 && !showAdd ? (
          <div style={s.empty}>
            <span style={{ fontSize: 48 }}>📦</span>
            <p style={{ ...s.emptyText, color: C.textSub }}>No products yet.</p>
            <p style={{ ...s.emptySubText, color: C.textMuted }}>
              Products are saved automatically when you add items to invoices or scan a barcode. You can also add them manually above.
            </p>
          </div>
        ) : (
          products.length > 0 && (
            <div style={{ ...s.card, background: C.card }}>
              <p style={{ ...s.sectionTitle, color: C.textSub }}>Saved Products ({products.length})</p>
              <div style={s.list}>
                {products.map((p, idx) => (
                  <div key={p.barcode}>
                    {idx > 0 && <div style={{ ...s.divider, background: C.divider }} />}
                    {editingBarcode === p.barcode ? (
                      <div style={s.editRow}>
                        <input
                          style={{ ...s.editInput, borderColor: ACCENT, background: C.inputBg, color: C.text }}
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          autoFocus
                        />
                        <input
                          style={{ ...s.editInput, width: 80, flexShrink: 0, borderColor: ACCENT, background: C.inputBg, color: C.text }}
                          inputMode="decimal"
                          type="number"
                          min="0"
                          step="0.01"
                          value={editPrice}
                          onChange={e => setEditPrice(e.target.value)}
                        />
                        <button style={{ ...s.iconBtn, color: ACCENT }} onClick={saveEdit}>✓</button>
                        <button style={{ ...s.iconBtn, color: C.textMuted }} onClick={() => setEditingBarcode(null)}>✕</button>
                      </div>
                    ) : (
                      <div style={s.productRow}>
                        <div style={s.productInfo}>
                          <span style={{ ...s.productName, color: C.text }}>{p.name}</span>
                          <span style={{ ...s.productPrice }}>${Number(p.price).toFixed(2)}</span>
                          {!p.barcode.startsWith('manual_') && (
                            <span style={{ ...s.barcodeTag, color: C.textMuted }}>📷 {p.barcode}</span>
                          )}
                        </div>
                        <div style={s.productActions}>
                          <button style={{ ...s.iconBtn, color: C.textLight }} onClick={() => startEdit(p)}>✎</button>
                          <button style={{ ...s.iconBtn, color: C.danger }} onClick={() => handleDelete(p.barcode)}>🗑</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        <div style={{ ...s.infoBox, background: C.infoBox }}>
          <p style={{ ...s.infoText, color: C.infoText }}>
            Products are automatically saved when you add items to an invoice. Next time you type that product name, it will autofill with the price.
          </p>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    borderBottom: '1px solid',
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
    cursor: 'pointer',
    padding: '2px 4px',
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 800,
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
    borderRadius: 16,
    padding: 18,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    margin: '0 0 14px',
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    height: 52,
    fontSize: 16,
    padding: '0 14px',
    border: '1.5px solid',
    borderRadius: 10,
    outline: 'none',
    WebkitAppearance: 'none',
    marginBottom: 4,
  },
  error: { fontSize: 13, margin: '6px 0 0', fontWeight: 600 },
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
  divider: { height: 1, margin: '4px 0' },
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
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  productPrice: { fontSize: 14, color: ACCENT, fontWeight: 700 },
  barcodeTag: {
    fontSize: 11,
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
    border: '1.5px solid',
    borderRadius: 8,
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
  emptyText: { fontSize: 18, fontWeight: 700, margin: 0 },
  emptySubText: { fontSize: 13, margin: 0, maxWidth: 300, lineHeight: 1.5 },
  infoBox: {
    borderRadius: 12,
    padding: '14px 16px',
  },
  infoText: {
    fontSize: 13,
    margin: 0,
    lineHeight: 1.6,
  },
};
