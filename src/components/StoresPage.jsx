/**
 * StoresPage — lists all stores visited with:
 *   • Outstanding balance (unpaid total)
 *   • Phone number (tap to call)
 *   • Address with map link
 *   • Tap to view full store history
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';
import { getInvoices, getStorePhone, getStoreAddress } from '../utils/storage';
import AppFooter from './AppFooter';

function subtotal(inv) {
  return (inv.items || []).reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
}

export default function StoresPage({ onOpenDrawer, onNav, onSelectStore }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [stores, setStores]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    async function load() {
      const invoices = await getInvoices().catch(() => []);
      // Build per-store map
      const map = {};
      for (const inv of invoices) {
        const name = inv.storeName || inv.store_name || '';
        if (!name) continue;
        if (!map[name]) map[name] = { name, invoices: [] };
        map[name].invoices.push(inv);
      }

      // Enrich with phone + address
      const list = await Promise.all(
        Object.values(map).map(async store => {
          const phone   = await getStorePhone(store.name).catch(() => '');
          const address = await getStoreAddress(store.name).catch(() => '');
          const unpaid  = store.invoices
            .filter(i => (i.paymentStatus || i.payment_status || 'unpaid') !== 'paid')
            .reduce((s, i) => s + subtotal(i), 0);
          const lastDate = store.invoices[0]?.date || '';
          return { ...store, phone, address, unpaid, lastDate };
        })
      );

      // Sort by most recently invoiced
      list.sort((a, b) => {
        const da = new Date(a.lastDate), db = new Date(b.lastDate);
        return db - da;
      });

      setStores(list);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = search.trim()
    ? stores.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : stores;

  const inp = { background: C.inputBg, border: `1px solid ${C.inputBorder}`, color: C.text };

  return (
    <div style={{ ...s.page, background: C.bg }}>
      {/* Header */}
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer}>☰</button>
        <span style={{ ...s.title, color: C.text }}>Stores</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>
        {/* Search */}
        <input
          style={{ ...s.searchInput, ...inp }}
          placeholder="Search stores…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {loading ? (
          <p style={{ color: C.textMuted, textAlign: 'center', paddingTop: 40 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>
            <p style={{ ...s.emptyTitle, color: C.textSub }}>
              {search ? 'No stores match.' : 'No stores yet.'}
            </p>
            {!search && (
              <p style={{ ...s.emptyDesc, color: C.textMuted }}>
                Stores appear here automatically when you generate invoices.
              </p>
            )}
          </div>
        ) : (
          <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
            {filtered.map((store, idx) => (
              <div key={store.name}>
                {idx > 0 && <div style={{ height: 1, background: C.divider }} />}
                <div style={s.storeRow}>
                  {/* Main tap area → store detail */}
                  <button
                    style={{ ...s.storeMain, color: 'inherit' }}
                    onClick={() => onSelectStore(store.name)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <p style={{ ...s.storeName, color: C.text }}>{store.name}</p>
                      {store.unpaid > 0 && (
                        <span style={{ ...s.badge, background: '#7c2d12', color: '#fca5a5' }}>
                          ${store.unpaid.toFixed(2)} owed
                        </span>
                      )}
                    </div>
                    <p style={{ ...s.storeMeta, color: C.textMuted }}>
                      {store.invoices.length} invoice{store.invoices.length !== 1 ? 's' : ''}
                      {store.lastDate ? ` · Last: ${store.lastDate}` : ''}
                    </p>
                    {store.address ? (
                      <p style={{ ...s.storeAddr, color: C.textMuted }}>{store.address}</p>
                    ) : null}
                  </button>

                  {/* Action icons */}
                  <div style={s.actions}>
                    {store.phone ? (
                      <a
                        href={`tel:${store.phone.replace(/[^+\d]/g, '')}`}
                        style={{ ...s.actionBtn, background: C.rowBg, color: ACCENT }}
                        title={store.phone}
                      >
                        📞
                      </a>
                    ) : null}
                    {store.address ? (
                      <a
                        href={`https://maps.apple.com/?q=${encodeURIComponent(store.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...s.actionBtn, background: C.rowBg, color: ACCENT }}
                        title="Open in Maps"
                      >
                        📍
                      </a>
                    ) : null}
                  </div>
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
  page: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' },
  header: {
    padding: '14px 20px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', padding: '3px 4px',
    WebkitTapHighlightColor: 'transparent',
  },
  title: { fontSize: 17, fontWeight: 700, textAlign: 'center', flex: 1 },
  body: {
    padding: '12px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  searchInput: {
    width: '100%', boxSizing: 'border-box', height: 46,
    fontSize: 15, padding: '0 14px',
    borderRadius: 14,
    outline: 'none', WebkitAppearance: 'none',
  },
  card: { borderRadius: 18, padding: '4px 18px', border: '1px solid' },
  storeRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '4px 0',
  },
  storeMain: {
    flex: 1, background: 'none', border: 'none',
    textAlign: 'left', cursor: 'pointer',
    padding: '10px 0',
    WebkitTapHighlightColor: 'transparent',
  },
  storeName: { fontSize: 15, fontWeight: 700, margin: '0 0 3px' },
  storeMeta: { fontSize: 12, margin: '0 0 2px', lineHeight: 1.4 },
  storeAddr: { fontSize: 12, margin: 0, lineHeight: 1.4, fontStyle: 'italic' },
  badge: {
    fontSize: 11, fontWeight: 700, padding: '3px 8px',
    borderRadius: 8, flexShrink: 0,
  },
  actions: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, textDecoration: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  empty: {
    paddingTop: 60, textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: 700, margin: 0 },
  emptyDesc: { fontSize: 13, margin: 0, maxWidth: 280, lineHeight: 1.5 },
};
