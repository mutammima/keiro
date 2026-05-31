import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';
import {
  getAllProducts,
  saveProductBarcode,
  updateProduct,
  deleteProduct,
  clearAllProducts,
  saveProductName,
  getBusinessName,
} from '../utils/storage';

function uid() { return '_' + Math.random().toString(36).slice(2); }

export default function Products({ onOpenDrawer }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const bizName = getBusinessName() || 'J&Y Distributions';
  const [catalog, setCatalog] = useState(() => getAllProducts());
  const [editingBarcode, setEditingBarcode] = useState(null);
  const [editName, setEditName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');

  const products = Object.entries(catalog)
    .map(([barcode, data]) => ({ barcode, name: data.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  function startEdit(p) { setEditingBarcode(p.barcode); setEditName(p.name); }

  function saveEdit() {
    if (!editName.trim()) return;
    const existing = catalog[editingBarcode];
    updateProduct(editingBarcode, editName.trim(), existing?.lastPrice ?? 0);
    setCatalog(getAllProducts()); setEditingBarcode(null);
  }

  function handleDelete(barcode) {
    deleteProduct(barcode); setCatalog(getAllProducts());
  }

  function handleClearAll() {
    if (!window.confirm('Delete all products? This cannot be undone.')) return;
    clearAllProducts(); setCatalog({});
  }

  function handleAddProduct() {
    setAddError('');
    if (!newName.trim()) return setAddError('Enter a product name.');
    saveProductBarcode('manual_' + uid(), newName.trim(), 0);
    saveProductName(newName.trim());
    setCatalog(getAllProducts());
    setNewName(''); setShowAdd(false);
  }

  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  return (
    <div style={{ ...s.page, background: C.bg }}>
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer}>☰</button>
        <span style={{ ...s.title, color: C.text }}>{bizName}</span>
        <button style={s.addBtn} onClick={() => { setShowAdd(v => !v); setAddError(''); }}>
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      <div style={s.body}>
        {showAdd && (
          <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
            <p style={{ ...s.sectionLabel, color: C.textMuted }}>New Product</p>
            <label style={{ ...s.fieldLabel, color: C.textSub }}>Product Name</label>
            <input
              style={{ ...s.input, ...inp }}
              placeholder="e.g. Marlboro Reds"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddProduct()}
              autoFocus
            />
            {addError && <p style={{ ...s.error, color: C.danger }}>{addError}</p>}
            <button style={s.saveBtn} onClick={handleAddProduct}>Save Product</button>
          </div>
        )}

        {products.length === 0 && !showAdd ? (
          <div style={s.empty}>
            <p style={{ ...s.emptyText, color: C.textSub }}>No products yet.</p>
            <p style={{ ...s.emptySubText, color: C.textMuted }}>
              Products save automatically when you add items to invoices. You can also add them manually above.
            </p>
          </div>
        ) : products.length > 0 && (
          <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
            <div style={s.listHeader}>
              <p style={{ ...s.sectionLabel, color: C.textMuted, margin: 0 }}>
                {products.length} Product{products.length !== 1 ? 's' : ''}
              </p>
              <button style={{ ...s.clearBtn, color: C.danger }} onClick={handleClearAll}>
                Clear All
              </button>
            </div>
            {products.map((p, idx) => (
              <div key={p.barcode}>
                {idx > 0 && <div style={{ ...s.divider, background: C.divider }} />}
                {editingBarcode === p.barcode ? (
                  <div style={s.editRow}>
                    <input
                      style={{ ...s.input, ...inp, borderColor: ACCENT, flex: 1, marginBottom: 0 }}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingBarcode(null); }}
                      autoFocus
                    />
                    <button style={{ ...s.iconBtn, color: ACCENT }} onClick={saveEdit}>✓</button>
                    <button style={{ ...s.iconBtn, color: C.textMuted }} onClick={() => setEditingBarcode(null)}>✕</button>
                  </div>
                ) : (
                  <div style={s.productRow}>
                    <span style={{ ...s.productName, color: C.text }}>{p.name}</span>
                    {!p.barcode.startsWith('manual_') && (
                      <span style={{ fontSize: 12, color: C.textMuted }} title="Barcode item">📷</span>
                    )}
                    <div style={s.actions}>
                      <button style={{ ...s.iconBtn, color: C.textMuted }} onClick={() => startEdit(p)}>✎</button>
                      <button style={{ ...s.iconBtn, color: C.danger }} onClick={() => handleDelete(p.barcode)}>🗑</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' },
  header: {
    padding: '12px 16px 10px',
    paddingTop: 'max(12px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', padding: '3px 4px',
    WebkitTapHighlightColor: 'transparent', flexShrink: 0,
  },
  title: { flex: 1, fontSize: 17, fontWeight: 700, textAlign: 'center' },
  addBtn: {
    background: ACCENT, border: 'none', color: '#fff',
    fontWeight: 600, fontSize: 13, padding: '6px 14px',
    borderRadius: 8, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  body: {
    padding: '14px 16px 48px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  card: { borderRadius: 12, padding: '14px 16px', border: '1px solid' },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px',
  },
  fieldLabel: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 },
  input: {
    width: '100%', boxSizing: 'border-box', height: 44,
    fontSize: 15, padding: '0 12px',
    border: '1px solid', borderRadius: 8,
    outline: 'none', WebkitAppearance: 'none', marginBottom: 4,
  },
  error: { fontSize: 13, margin: '4px 0 0', fontWeight: 600 },
  saveBtn: {
    width: '100%', marginTop: 10, height: 44,
    background: ACCENT, border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer',
  },
  listHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4,
  },
  clearBtn: {
    background: 'none', border: 'none', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', padding: '2px 0', WebkitTapHighlightColor: 'transparent',
  },
  divider: { height: 1, margin: '0' },
  productRow: {
    display: 'flex', alignItems: 'center',
    padding: '11px 0', gap: 8,
  },
  productName: {
    flex: 1, fontSize: 15, fontWeight: 500,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  actions: { display: 'flex', gap: 2, flexShrink: 0 },
  iconBtn: {
    background: 'none', border: 'none', fontSize: 17,
    cursor: 'pointer', width: 34, height: 34,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, padding: 0, WebkitTapHighlightColor: 'transparent',
  },
  editRow: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0',
  },
  empty: {
    paddingTop: 60, textAlign: 'center', display: 'flex',
    flexDirection: 'column', alignItems: 'center', gap: 6,
  },
  emptyText: { fontSize: 17, fontWeight: 700, margin: 0 },
  emptySubText: { fontSize: 13, margin: 0, maxWidth: 280, lineHeight: 1.5 },
};
