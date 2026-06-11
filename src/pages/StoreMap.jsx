/**
 * Store Info — lists every unique store from invoice history.
 * • Pinned stores shown at top with ★
 * • Swipe left on any row to reveal Edit button
 * • Edit sheet lets you update address + phone; saved in localStorage
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';
import { getInvoices, getPinnedStores, togglePinnedStore, saveStoreDetails, lsGet } from '../utils/storage';

// ── Shared store overrides — reads from the same keys as the main app ──────────
// Falls back to legacy inv_store_overrides for data written before this fix.
function loadOverrides() {
  const phones = lsGet('inv_store_phones', {});
  const addrs  = lsGet('inv_store_addrs',  {});
  const legacy = (() => { try { return JSON.parse(localStorage.getItem('inv_store_overrides')) || {}; } catch { return {}; } })();
  // Merge: main app keys take precedence over legacy key
  const all = {};
  for (const [name, val] of Object.entries(legacy)) {
    all[name] = { address: val.address || '', phone: val.phone || '' };
  }
  for (const [name, phone] of Object.entries(phones)) {
    all[name] = { ...(all[name] || {}), phone };
  }
  for (const [name, address] of Object.entries(addrs)) {
    all[name] = { ...(all[name] || {}), address };
  }
  return all;
}

// ── Open native maps ──────────────────────────────────────────────────────────
function openMaps(address, name) {
  const query = encodeURIComponent(`${name} ${address}`);
  const isApple = /iPad|iPhone|iPod|Mac/.test(navigator.userAgent) && !window.MSStream;
  const url = isApple
    ? `maps://maps.apple.com/?q=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
  window.open(url, '_blank');
}

// ── Swipeable row ─────────────────────────────────────────────────────────────
const REVEAL = 80; // px to reveal the edit button

function SwipeRow({ children, onEdit, dark, C }) {
  const [offsetX, setOffsetX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const startX  = useRef(null);
  const startY  = useRef(null);
  const locked  = useRef(null); // 'h' | 'v' | null
  const rowRef  = useRef(null);

  function onTouchStart(e) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    locked.current = null;
  }

  function onTouchMove(e) {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (locked.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      locked.current = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'h' : 'v';
    }
    if (locked.current !== 'h') return;
    e.stopPropagation();

    // Only allow swiping left (negative dx)
    const clamped = Math.max(-REVEAL, Math.min(0, dx + (offsetX < 0 ? offsetX : 0)));
    setAnimating(false);
    setOffsetX(clamped);
  }

  function onTouchEnd() {
    if (locked.current !== 'h') { startX.current = null; return; }
    startX.current = null;
    setAnimating(true);
    // Snap: if dragged more than half of REVEAL, open fully; else close
    if (offsetX < -(REVEAL / 2)) {
      setOffsetX(-REVEAL);
    } else {
      setOffsetX(0);
    }
  }

  function close() { setAnimating(true); setOffsetX(0); }

  return (
    <div ref={rowRef} style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Edit action behind the row */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: REVEAL,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: ACCENT,
      }}>
        <button
          onClick={() => { close(); onEdit(); }}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '0 12px', height: '100%', WebkitTapHighlightColor: 'transparent' }}
        >
          Edit
        </button>
      </div>

      {/* Sliding foreground */}
      <div
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: animating ? 'transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)' : 'none',
          willChange: 'transform',
          background: C.card,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (offsetX !== 0) { close(); } }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Edit modal ─────────────────────────────────────────────────────────────────
function EditSheet({ store, C, dark, onSave, onClose }) {
  const [address, setAddress] = useState(store.address || '');
  const [phone,   setPhone]   = useState(store.phone   || '');
  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  function handleSave() {
    // Persist to shared storage (Supabase + localStorage) so New Invoice form picks it up
    saveStoreDetails(store.name, phone.trim(), address.trim()).catch(e => console.error('saveStoreDetails', e));
    onSave({ address: address.trim(), phone: phone.trim() });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div style={{ width: '100%', background: C.card, borderRadius: '20px 20px 0 0', padding: '0 0 max(24px,env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.divider, margin: '12px auto 0' }} />
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 12px', borderBottom: `1px solid ${C.divider}` }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Edit Store Info</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 16, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        {/* Store name (read-only) */}
        <div style={{ padding: '16px 20px 0' }}>
          <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px' }}>Store</p>
          <p style={{ color: C.text, fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>{store.name}</p>

          <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>Address</p>
          <input
            style={{ ...inputStyle, ...inp }}
            placeholder="123 Main St, City, State"
            value={address}
            onChange={e => setAddress(e.target.value)}
          />

          <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '12px 0 6px' }}>Phone</p>
          <input
            style={{ ...inputStyle, ...inp }}
            placeholder="+1 (555) 000-0000"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />

          <button onClick={handleSave} style={{ width: '100%', height: 50, background: ACCENT, border: 'none', borderRadius: 14, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 16, WebkitTapHighlightColor: 'transparent' }}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', height: 46,
  fontSize: 15, padding: '0 14px',
  border: '1px solid', borderRadius: 12,
  outline: 'none', WebkitAppearance: 'none',
  fontFamily: 'inherit',
};

// ── Map preview ───────────────────────────────────────────────────────────────
/**
 * Uses Nominatim (OpenStreetMap's free geocoder, no API key) to resolve the
 * address to lat/lon, then renders an OSM embed iframe centered on that point.
 * Falls back to a "could not find" message if geocoding fails.
 */
function MapPreview({ address, name, dark }) {
  const [show,   setShow]   = useState(false);
  const [coords, setCoords] = useState(null);   // { lat, lon } | null
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'ok' | 'error'

  // Geocode with Nominatim the first time the map is expanded
  useEffect(() => {
    if (!show || status !== 'idle') return;
    if (!address) { setStatus('error'); return; }
    setStatus('loading');
    const query = encodeURIComponent(address);
    fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'Keiro/1.0' },
    })
      .then(r => r.json())
      .then(data => {
        if (data && data[0]) {
          setCoords({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
          setStatus('ok');
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [show, address, status]);

  // Build the OSM embed URL from coordinates
  const osmSrc = useMemo(() => {
    if (!coords) return null;
    const { lat, lon } = coords;
    const delta = 0.008; // ~800m bounding box
    return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - delta},${lat - delta},${lon + delta},${lat + delta}&layer=mapnik&marker=${lat},${lon}`;
  }, [coords]);

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setShow(v => !v)}
        style={{
          background: 'none', border: 'none', padding: 0,
          color: ACCENT, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ fontSize: 14 }}>⌖</span>
        {show ? 'Hide map' : 'Show map'}
      </button>

      {show && (
        <div style={{
          marginTop: 8, borderRadius: 12, overflow: 'hidden',
          border: `1px solid ${dark ? '#2a2a2a' : '#e4e4e7'}`,
          height: 160, position: 'relative',
          background: dark ? '#1a1a1a' : '#f4f4f5',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {status === 'loading' && (
            <span style={{ color: dark ? '#666' : '#aaa', fontSize: 13 }}>Finding address…</span>
          )}
          {status === 'error' && (
            <span style={{ color: dark ? '#666' : '#aaa', fontSize: 13, textAlign: 'center', padding: '0 16px' }}>
              Could not locate "{address}"
            </span>
          )}
          {status === 'ok' && osmSrc && (
            <>
              <iframe
                title={`Map for ${name}`}
                src={osmSrc}
                width="100%"
                height="100%"
                style={{ border: 0, display: 'block', position: 'absolute', inset: 0 }}
                loading="lazy"
                onTouchStart={e => e.stopPropagation()}
              />
              {/* Tap-to-open overlay — tapping opens in the native maps app */}
              <div
                style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
                onClick={() => openMaps(address, name)}
                title="Tap to open in Maps"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Store card content ─────────────────────────────────────────────────────────
function StoreCard({ store, pinned, onTogglePin, C, dark }) {
  return (
    <div style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <p style={{ color: C.text, fontSize: 15, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store.name}</p>
            <button
              onClick={onTogglePin}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 16, cursor: 'pointer', flexShrink: 0, lineHeight: 1, WebkitTapHighlightColor: 'transparent', color: pinned ? '#f59e0b' : C.textLight }}
              title={pinned ? 'Unpin store' : 'Pin store'}
            >
              {pinned ? '★' : '☆'}
            </button>
          </div>
          {store.address ? (
            <p style={{ color: C.textMuted, fontSize: 13, margin: '0 0 2px', lineHeight: 1.4 }}>{store.address}</p>
          ) : (
            <p style={{ color: C.textLight, fontSize: 12, margin: '0 0 2px', fontStyle: 'italic' }}>No address on file — swipe left to add</p>
          )}
          {store.phone && <p style={{ color: C.textMuted, fontSize: 12, margin: '0 0 2px' }}>{store.phone}</p>}
          <p style={{ color: C.textLight, fontSize: 11, margin: '4px 0 0' }}>
            {store.invoiceCount} invoice{store.invoiceCount !== 1 ? 's' : ''}
            {store.lastDate ? `  ·  Last: ${store.lastDate}` : ''}
          </p>
          {/* Inline map preview */}
          {store.address && <MapPreview address={store.address} name={store.name} dark={dark} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          {store.address && (
            <button
              onClick={() => openMaps(store.address, store.name)}
              style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700, padding: '7px 14px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              Directions
            </button>
          )}
          {store.phone && (
            <a href={`tel:${store.phone}`} style={{ display: 'block', textAlign: 'center', background: C.nestedCard || C.divider, color: C.text, borderRadius: 10, fontSize: 12, fontWeight: 700, padding: '7px 14px', textDecoration: 'none' }}>
              ☎ Call
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function StoreMap({ onOpenDrawer }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [stores,   setStores]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [pinned,   setPinned]   = useState(() => getPinnedStores());
  const [editing,  setEditing]  = useState(null); // store object being edited
  const overrides = useRef(loadOverrides());

  useEffect(() => {
    getInvoices().then(list => {
      const ov  = loadOverrides();
      overrides.current = ov;
      const map = {};
      for (const inv of (list || [])) {
        const name = inv.storeName || inv.store_name || '';
        if (!name) continue;
        if (!map[name]) {
          map[name] = {
            name,
            address: inv.storeAddress || inv.store_address || '',
            phone:   inv.storePhone   || inv.store_phone   || '',
            invoiceCount: 0,
            lastDate: '',
          };
        }
        map[name].invoiceCount++;
        if (!map[name].address && (inv.storeAddress || inv.store_address)) {
          map[name].address = inv.storeAddress || inv.store_address;
        }
        if (inv.date && (!map[name].lastDate || inv.date > map[name].lastDate)) {
          map[name].lastDate = inv.date;
        }
      }
      // Apply saved overrides on top of invoice data
      for (const [name, data] of Object.entries(ov)) {
        if (map[name]) {
          if (data.address !== undefined) map[name].address = data.address;
          if (data.phone   !== undefined) map[name].phone   = data.phone;
        }
      }
      const sorted = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
      setStores(sorted);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function handleTogglePin(name) {
    const next = togglePinnedStore(name);
    setPinned(next);
  }

  function handleSaveEdit({ address, phone }) {
    setStores(prev => prev.map(s => s.name === editing.name ? { ...s, address, phone } : s));
    setEditing(null);
  }

  const pinnedSet  = new Set(pinned);
  const lowSearch  = search.toLowerCase();
  const allFiltered = stores.filter(s =>
    s.name.toLowerCase().includes(lowSearch) ||
    s.address.toLowerCase().includes(lowSearch)
  );

  const pinnedStores  = allFiltered.filter(s => pinnedSet.has(s.name));
  const regularStores = allFiltered.filter(s => !pinnedSet.has(s.name));

  function renderGroup(list, label) {
    if (list.length === 0) return null;
    return (
      <div>
        {label && (
          <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px 2px' }}>
            {label}
          </p>
        )}
        <div style={{ borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.cardBorder || C.divider}` }}>
          {list.map((store, idx) => (
            <div key={store.name}>
              {idx > 0 && <div style={{ height: 1, background: C.divider }} />}
              <SwipeRow onEdit={() => setEditing(store)} dark={dark} C={C}>
                <StoreCard
                  store={store}
                  pinned={pinnedSet.has(store.name)}
                  onTogglePin={() => handleTogglePin(store.name)}
                  C={C}
                  dark={dark}
                />
              </SwipeRow>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', background: C.bg }}>
      {/* Header */}
      <div style={{ ...glassStyle(dark), padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.text, padding: '3px 4px', WebkitTapHighlightColor: 'transparent' }} onClick={onOpenDrawer}>☰</button>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700, color: C.text, textAlign: 'center' }}>Store Info</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ padding: '12px 16px 88px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Search */}
        <input
          style={{ width: '100%', boxSizing: 'border-box', height: 44, fontSize: 15, padding: '0 14px', background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 12, outline: 'none', color: C.text, fontFamily: 'inherit' }}
          placeholder="Search stores or addresses…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Swipe hint */}
        {!loading && stores.length > 0 && (
          <p style={{ color: C.textLight, fontSize: 12, margin: '-4px 0 -4px', textAlign: 'center' }}>
            ← Swipe left on a store to edit
          </p>
        )}

        {loading ? (
          <p style={{ color: C.textMuted, textAlign: 'center', paddingTop: 40 }}>Loading…</p>
        ) : stores.length === 0 ? (
          <div style={{ paddingTop: 60, textAlign: 'center' }}>
            <p style={{ color: C.textSub, fontSize: 17, fontWeight: 700, margin: 0 }}>No stores yet.</p>
            <p style={{ color: C.textMuted, fontSize: 13, margin: '8px 0 0', lineHeight: 1.5 }}>
              Stores appear here automatically once you start creating invoices.
            </p>
          </div>
        ) : allFiltered.length === 0 ? (
          <p style={{ color: C.textMuted, textAlign: 'center', paddingTop: 20, fontSize: 14 }}>No stores match "{search}"</p>
        ) : (
          <>
            {renderGroup(pinnedStores, pinnedStores.length > 0 ? '★ Pinned' : null)}
            {renderGroup(regularStores, pinnedStores.length > 0 && regularStores.length > 0 ? 'All Stores' : null)}
          </>
        )}
      </div>

      {/* Edit sheet */}
      {editing && (
        <EditSheet
          store={editing}
          C={C}
          dark={dark}
          onSave={handleSaveEdit}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
