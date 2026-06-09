/**
 * MyListings — driver-side supply editor (overlay page).
 *
 * A driver publishes the products they carry, each with a price + unit, into the
 * shared marketplace. Store owners on the other side of the network discover
 * these listings when they need that product. Cloud-synced via
 * marketplace_listings (see marketplaceStorage.js).
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { getMyListings, saveMyListing, deleteMyListing, loadMyListingsFromCloud } from '../../utils/marketplaceStorage';
import { getBusinessName, getBusinessPhone } from '../../utils/storage';
import { getCurrentPosition } from '../../utils/geo';
import AppFooter from '../../components/navigation/AppFooter';

const UNITS = ['each', 'case', 'box', 'gal', 'lb', 'pack'];

export default function MyListings({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [listings, setListings] = useState(() => getMyListings());
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Add/edit form
  const [editingId, setEditingId] = useState(null);
  const [product, setProduct] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('each');
  const [error, setError] = useState('');

  // Best-effort device location, captured once and stamped on each saved listing
  // so stores can sort drivers by "near me". Null when location is unavailable.
  const coords = useRef(null);

  useEffect(() => {
    loadMyListingsFromCloud().then(setListings).catch(() => {});
    getCurrentPosition().then(c => { if (c) coords.current = c; }).catch(() => {});
  }, []);

  function resetForm() {
    setEditingId(null); setProduct(''); setPrice(''); setUnit('each'); setError('');
  }

  function handleSave() {
    if (!product.trim()) { setError('Product name is required.'); return; }
    if (price !== '' && Number(price) < 0) { setError('Price can’t be negative.'); return; }

    const base = editingId ? listings.find(l => l.id === editingId) : {};
    const saved = saveMyListing({
      ...base,
      id: editingId || undefined,
      driverName: getBusinessName() || 'My Business',
      driverPhone: getBusinessPhone() || '',
      productName: product.trim(),
      price: Number(price) || 0,
      unit,
      active: true,
      lat: coords.current ? coords.current.lat : (base.lat ?? null),
      lng: coords.current ? coords.current.lng : (base.lng ?? null),
    });
    setListings(prev => {
      const idx = prev.findIndex(l => l.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    resetForm();
  }

  function startEdit(l) {
    setEditingId(l.id); setProduct(l.productName); setPrice(l.price ? String(l.price) : ''); setUnit(l.unit || 'each'); setError('');
  }

  function handleDelete() {
    if (!confirmDelete) return;
    deleteMyListing(confirmDelete.id);
    setListings(prev => prev.filter(l => l.id !== confirmDelete.id));
    if (editingId === confirmDelete.id) resetForm();
    setConfirmDelete(null);
  }

  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: C.bg, overflowX: 'clip' }}>

      {/* Header */}
      <div style={{ ...glassStyle(dark), padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onOpenDrawer} style={s.iconBtn(C)}>&#9776;</button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center' }}>My Listings</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ padding: '16px 16px 100px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <p style={{ fontSize: 13, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
          List the products you carry and your price. Stores that need these will be able to find you in the marketplace.
        </p>

        {/* Add / edit form */}
        <div style={s.card(C)}>
          <p style={s.sectionLabel(C)}>{editingId ? 'Edit Listing' : 'Add a Product'}</p>

          <label style={s.label(C)}>Product</label>
          <input
            style={{ ...s.input, ...inp, borderColor: error ? C.danger : C.inputBorder }}
            placeholder="e.g. Whole Milk 1 Gal"
            value={product}
            onChange={e => { setProduct(e.target.value); setError(''); }}
          />

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={s.label(C)}>Price <span style={{ color: C.textMuted, fontWeight: 400, fontSize: 11 }}>optional</span></label>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                style={{ ...s.input, ...inp }}
                placeholder="e.g. 3.50"
                value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </div>
            <div style={{ width: 120 }}>
              <label style={s.label(C)}>Unit</label>
              <select style={{ ...s.input, ...inp }} value={unit} onChange={e => setUnit(e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>per {u}</option>)}
              </select>
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: C.danger, margin: '8px 0 0', fontWeight: 600 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={handleSave} style={{ ...s.accentBtn, flex: 1 }}>
              {editingId ? 'Save Changes' : '+ Add Listing'}
            </button>
            {editingId && (
              <button onClick={resetForm} style={{ ...s.outlineBtn(C), color: C.textSub, borderColor: C.inputBorder }}>Cancel</button>
            )}
          </div>
        </div>

        {/* Empty state */}
        {listings.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 30 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>No listings yet</p>
            <p style={{ fontSize: 13, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
              Add the first product you carry above to appear in the marketplace.
            </p>
          </div>
        )}

        {/* Listing cards */}
        {listings.map(l => (
          <div key={l.id} style={{ ...s.card(C), display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{l.productName}</div>
              <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>
                {l.price > 0 ? `$${Number(l.price).toFixed(2)} per ${l.unit}` : `Price on request · per ${l.unit}`}
              </div>
            </div>
            <button onClick={() => startEdit(l)} style={{ ...s.smallBtn(C), color: ACCENT, borderColor: ACCENT }}>Edit</button>
            <button onClick={() => setConfirmDelete({ id: l.id, name: l.productName })} style={{ ...s.smallBtn(C), color: C.danger, borderColor: C.danger }}>Remove</button>
          </div>
        ))}

        <AppFooter onNav={onNav} />
      </div>

      {/* Delete confirm */}
      {confirmDelete && createPortal(
        <div style={s.overlay} onClick={() => setConfirmDelete(null)}>
          <div style={s.modal(C)} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>Remove listing?</p>
            <p style={{ fontSize: 14, color: C.textSub, margin: '0 0 20px', lineHeight: 1.5 }}>
              Remove "{confirmDelete.name}" from the marketplace? Stores will no longer see it.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...s.modalBtn(C), background: C.inputBg, color: C.text, borderColor: C.inputBorder }} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button style={{ ...s.modalBtn(C), background: C.danger, color: '#fff', borderColor: C.danger }} onClick={handleDelete}>Remove</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const s = {
  card: (C) => ({ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18, padding: '16px 18px' }),
  sectionLabel: (C) => ({ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textMuted, margin: '0 0 12px' }),
  label: (C) => ({ display: 'block', fontSize: 13, fontWeight: 500, color: C.textSub, marginBottom: 6 }),
  input: { width: '100%', boxSizing: 'border-box', height: 46, fontSize: 16, padding: '0 14px', border: '1px solid', borderRadius: 12, outline: 'none', WebkitAppearance: 'none' },
  iconBtn: (C) => ({ width: 36, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: C.text, padding: '4px 6px', WebkitTapHighlightColor: 'transparent', lineHeight: 1, textAlign: 'left' }),
  accentBtn: { background: ACCENT, border: 'none', color: '#fff', padding: '11px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  outlineBtn: (C) => ({ background: 'none', border: '1.5px solid', borderRadius: 12, padding: '11px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }),
  smallBtn: (C) => ({ background: 'none', border: '1.5px solid', borderRadius: 10, padding: '6px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }),
  overlay: { position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: (C) => ({ width: '100%', maxWidth: 340, borderRadius: 18, border: `1px solid ${C.cardBorder}`, background: C.card, padding: '22px 20px 18px', boxShadow: '0 16px 48px rgba(0,0,0,0.35)' }),
  modalBtn: (C) => ({ flex: 1, height: 46, borderRadius: 12, border: '1px solid', fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }),
};
