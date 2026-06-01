import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';
import AppFooter from '../components/navigation/AppFooter';
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

/** Group a sorted array of products by first letter */
function groupByLetter(products) {
  const map = {};
  for (const p of products) {
    const letter = p.name[0]?.toUpperCase() ?? '#';
    if (!map[letter]) map[letter] = [];
    map[letter].push(p);
  }
  // Return as sorted array of { letter, items }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, items]) => ({ letter, items }));
}

export default function Products({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const bizName = getBusinessName() || 'J&Y Distributions';
  const [catalog, setCatalog] = useState({});
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [editingBarcode, setEditingBarcode] = useState(null);
  const [editName, setEditName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');

  useEffect(() => {
    getAllProducts().then(c => { setCatalog(c || {}); setLoadingCatalog(false); }).catch(() => setLoadingCatalog(false));
  }, []);

  const products = Object.entries(catalog)
    .map(([barcode, data]) => ({ barcode, name: data.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const groups = groupByLetter(products);

  function startEdit(p) { setEditingBarcode(p.barcode); setEditName(p.name); }

  async function saveEdit() {
    if (!editName.trim()) return;
    const existing = catalog[editingBarcode];
    await updateProduct(editingBarcode, editName.trim(), existing?.lastPrice ?? 0);
    const updated = await getAllProducts();
    setCatalog(updated || {});
    setEditingBarcode(null);
  }

  async function handleDelete(barcode) {
    await deleteProduct(barcode);
    const updated = await getAllProducts();
    setCatalog(updated || {});
  }

  async function handleClearAll() {
    if (!window.confirm('Delete all products? This cannot be undone.')) return;
    await clearAllProducts();
    setCatalog({});
  }

  async function handleAddProduct() {
    setAddError('');
    if (!newName.trim()) return setAddError('Enter a product name.');
    await saveProductBarcode('manual_' + uid(), newName.trim(), 0);
    saveProductName(newName.trim());
    const updated = await getAllProducts();
    setCatalog(updated || {});
    setNewName(''); setShowAdd(false);
  }

  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  return (
    <div style={{ ...s.page, background: C.bg }}>
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <div style={{ width: 36 }} />
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

        {loadingCatalog ? (
          <div style={s.empty}>
            <p style={{ ...s.emptyText, color: C.textMuted }}>Loading products…</p>
          </div>
        ) : products.length === 0 && !showAdd ? (
          <div style={s.empty}>
            <p style={{ ...s.emptyText, color: C.textSub }}>No products yet.</p>
            <p style={{ ...s.emptySubText, color: C.textMuted }}>
              Products save automatically when you add items to invoices. You can also add them manually above.
            </p>
          </div>
        ) : groups.length > 0 && (
          <div>
            {/* Count + Clear All header */}
            <div style={s.listHeader}>
              <p style={{ ...s.sectionLabel, color: C.textMuted, margin: 0 }}>
                {products.length} Product{products.length !== 1 ? 's' : ''}
              </p>
              <button style={{ ...s.clearBtn, color: C.danger }} onClick={handleClearAll}>
                Clear All
              </button>
            </div>

            {/* Alphabetical sections */}
            {groups.map(({ letter, items }) => (
              <div key={letter} style={{ marginBottom: 4 }}>
                {/* Letter index header */}
                <div style={{ ...s.letterHeader, color: C.textMuted, borderBottomColor: C.divider }}>
                  {letter}
                </div>
                <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder, padding: '0 18px' }}>
                  {items.map((p, idx) => (
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
                            <button style={{ ...s.iconBtn, color: C.danger, fontSize: 12, fontWeight: 600 }} onClick={() => handleDelete(p.barcode)}>Remove</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <AppFooter onNav={onNav} />
      </div>
    </div>
  );
}

const s = {
  page: { display: 'flex', flexDirection: 'column', overflowX: 'hidden' },
  header: {
    position: 'sticky', top: 0, zIndex: 100,
    padding: '14px 20px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', gap: 14,
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', padding: '3px 4px',
    WebkitTapHighlightColor: 'transparent', flexShrink: 0,
  },
  title: { flex: 1, fontSize: 18, fontWeight: 700, textAlign: 'center', letterSpacing: 0.2 },
  addBtn: {
    background: ACCENT, border: 'none', color: '#fff',
    fontWeight: 600, fontSize: 13, padding: '7px 16px',
    borderRadius: 10, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  body: {
    padding: '14px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  card: { borderRadius: 18, border: '1px solid' },
  letterHeader: {
    fontSize: 12, fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.1em', padding: '10px 4px 4px',
    borderBottom: '1px solid',
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px',
  },
  fieldLabel: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: '#888888' },
  input: {
    width: '100%', boxSizing: 'border-box', height: 46,
    fontSize: 15, padding: '0 14px',
    border: '1px solid', borderRadius: 12,
    outline: 'none', WebkitAppearance: 'none', marginBottom: 4,
  },
  error: { fontSize: 13, margin: '4px 0 0', fontWeight: 600 },
  saveBtn: {
    width: '100%', marginTop: 12, height: 48,
    background: ACCENT, border: 'none', borderRadius: 14,
    fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(74,123,247,0.3)',
  },
  listHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
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
