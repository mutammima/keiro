import { useState, useEffect, useRef, useCallback } from 'react';
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

/**
 * SwipeableRow — swipe left to reveal a red Remove strip; release to delete.
 *
 * iOS quirk: the parent tab content div has touchAction:'pan-y', which causes
 * the browser to fire touchcancel for horizontal gestures before JS can commit
 * to the swipe. Fix: axis-lock state machine (same pattern as App.jsx's tab
 * swipe). We only call e.preventDefault() *after* confirming the gesture is
 * a left-swipe, and we treat touchcancel as "abort → snap back" so it never
 * accidentally triggers a delete.
 *
 * data-swipe-item on the outer div tells App.jsx's handleStart to skip
 * tab-switching for touches that originate inside a swipeable row.
 */
function SwipeableRow({ onDelete, cardBg, children }) {
  const rowRef    = useRef(null);
  const startRef  = useRef(null);   // { x, y } — set on touchstart, cleared on end
  const dirRef    = useRef(null);   // null | 'h' (left) | 'v' — axis lock
  const offsetRef = useRef(0);      // live translateX in px

  const [offsetX,  setOffsetX]  = useState(0);
  const [snapping, setSnapping] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    function reset(snapBack) {
      const committed = dirRef.current === 'h';
      startRef.current = null;
      dirRef.current   = null;
      setSnapping(true);
      if (committed && snapBack) setOffsetX(0);
      offsetRef.current = 0;
    }

    function onStart(e) {
      startRef.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      offsetRef.current = 0;
      dirRef.current    = null;
      setSnapping(false);
      setDeleting(false);
    }

    function onMove(e) {
      if (!startRef.current) return;

      const dx = e.touches[0].clientX - startRef.current.x;
      const dy = e.touches[0].clientY - startRef.current.y;

      // ── Axis-lock: wait for 6 px of movement before committing ──────────
      if (dirRef.current === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; // too early to decide
        // Require dx to be both leftward AND horizontally dominant
        dirRef.current = (dx < 0 && Math.abs(dx) > Math.abs(dy)) ? 'h' : 'v';
      }

      if (dirRef.current !== 'h') return; // vertical scroll — browser handles it

      // ── Confirmed left-swipe: take over this gesture ─────────────────────
      // preventDefault stops the browser from also vertical-scrolling while
      // we animate the row sideways (listener is passive:false so this works).
      e.preventDefault();

      const clamped = Math.max(-110, dx);
      offsetRef.current = clamped;
      setOffsetX(clamped);
    }

    function onEnd() {
      if (!startRef.current) return;
      const wasH    = dirRef.current === 'h';
      const offset  = offsetRef.current;
      reset(false);

      if (wasH && offset < -55) {
        // Swiped past the threshold — animate off-screen then delete
        setOffsetX(-480);
        setDeleting(true);
        setTimeout(onDelete, 260);
      } else {
        setOffsetX(0); // snap back
      }
    }

    // touchcancel = iOS aborted the gesture (e.g. pan-y took over, system UI,
    // incoming call).  Always snap back — never delete on a cancelled gesture.
    function onCancel() {
      if (!startRef.current) return;
      reset(true);
    }

    el.addEventListener('touchstart',  onStart,  { passive: true  });
    el.addEventListener('touchmove',   onMove,   { passive: false });
    el.addEventListener('touchend',    onEnd,    { passive: true  });
    el.addEventListener('touchcancel', onCancel, { passive: true  });

    return () => {
      el.removeEventListener('touchstart',  onStart);
      el.removeEventListener('touchmove',   onMove);
      el.removeEventListener('touchend',    onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [onDelete]);

  return (
    <div
      ref={rowRef}
      data-swipe-item
      style={{
        position: 'relative',
        overflow: 'hidden',
        opacity: deleting ? 0 : 1,
        transition: deleting ? 'opacity 0.26s ease' : 'none',
      }}
    >
      {/* Red strip revealed behind the row when swiping left */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 110,
        background: '#ef4444',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: 0.3,
        userSelect: 'none', pointerEvents: 'none',
      }}>Remove</div>

      {/* Sliding foreground — same bg as the card to cover the strip at rest */}
      <div style={{
        transform: `translateX(${offsetX}px)`,
        transition: snapping ? 'transform 0.22s cubic-bezier(0.4,0,0.2,1)' : 'none',
        background: cardBg,
        position: 'relative', zIndex: 1,
      }}>
        {children}
      </div>
    </div>
  );
}

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
              placeholder="e.g. GMan V Cut T-Shirt"
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
          <div data-tutorial="products-list">
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
                        <SwipeableRow onDelete={() => handleDelete(p.barcode)} cardBg={C.card}>
                          <div style={s.productRow}>
                            <span style={{ ...s.productName, color: C.text }}>{p.name}</span>
                            {!p.barcode.startsWith('manual_') && (
                              <span style={{ fontSize: 12, color: C.textMuted }} title="Barcode item">📷</span>
                            )}
                            <div style={s.actions}>
                              <button style={{ ...s.iconBtn, color: C.textMuted }} onClick={() => startEdit(p)}>✎</button>
                            </div>
                          </div>
                        </SwipeableRow>
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
