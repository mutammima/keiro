/**
 * FindDrivers — store-owner-side supply feed (overlay page).
 *
 * The mirror image of the driver Marketplace: a store owner searches for a
 * product and sees which drivers across the network carry it, at what price.
 * Drivers the store has ordered from before are tagged, so a store can favour
 * known, trusted suppliers. Reads the shared marketplace_listings table.
 */

import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { loadAllListingsFromCloud, getAllListings, productMatches } from '../../utils/marketplaceStorage';
import { getOrders, loadOrdersFromCloud } from '../../utils/storeOwnerStorage';
import { getConnections, loadConnectionsFromCloud, requestConnection, getCachedUid } from '../../utils/connectionStorage';
import { getBusinessName } from '../../utils/storage';
import { isGuest } from '../../utils/guestMode';
import { GuestCapModal } from '../../components/auth/GuestUpsell';
import { buildWhatsAppUrl } from '../../utils/invoiceUtils';
import { getCurrentPosition, haversineMiles, formatDistance } from '../../utils/geo';
import AppFooter from '../../components/navigation/AppFooter';

export default function FindDrivers({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [listings, setListings] = useState(() => getAllListings());
  const [orders, setOrders] = useState(() => getOrders());
  const [conns, setConns] = useState(() => getConnections());
  const [connectingId, setConnectingId] = useState(null);
  const [gate, setGate] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [here, setHere] = useState(null);
  const [locReady, setLocReady] = useState(false);

  useEffect(() => {
    Promise.all([loadAllListingsFromCloud(), loadOrdersFromCloud()])
      .then(([l, o]) => { setListings(l); setOrders(o); })
      .catch(() => {})
      .finally(() => setLoading(false));
    loadConnectionsFromCloud().then(setConns).catch(() => {});
    getCurrentPosition()
      .then(c => setHere(c))
      .catch(() => {})
      .finally(() => setLocReady(true));
  }, []);

  /** Existing non-declined connection (any state) with this user, or null. */
  function connWith(userId) {
    if (!userId) return null;
    return conns.find(c => c.status !== 'declined' && (c.driverUserId === userId || c.storeUserId === userId)) || null;
  }

  async function handleConnect(l) {
    if (isGuest()) { setGate(true); return; } // a request needs a session to reach the driver
    setConnectingId(l.id);
    await requestConnection('store_owner', { userId: l.userId, name: l.driverName || 'A driver' }, getBusinessName() || '');
    setConns(getConnections());
    setConnectingId(null);
  }

  // Miles from the store to a driver, or null when either lacks coords.
  function distOf(listing) {
    return haversineMiles(here, listing);
  }

  // Names of drivers this store has ordered from before (for the trust tag).
  const knownDrivers = useMemo(() => {
    const set = new Set();
    orders.forEach(o => { if (o.driverName && o.driverName !== 'Unassigned') set.add(o.driverName.trim().toLowerCase()); });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // Product chips from the store's own recent orders for one-tap searching.
  const orderProducts = useMemo(() => {
    const seen = new Set(); const out = [];
    orders.forEach(o => {
      const k = (o.productName || '').trim().toLowerCase();
      if (k && !seen.has(k)) { seen.add(k); out.push(o.productName.trim()); }
    });
    return out.slice(0, 6);
  }, [orders]);

  const results = useMemo(() => {
    const q = query.trim();
    const list = q ? listings.filter(l => productMatches(l.productName, q)) : listings;
    // Known drivers first, then nearest, then cheapest.
    return [...list].sort((a, b) => {
      const ak = knownDrivers.has((a.driverName || '').trim().toLowerCase());
      const bk = knownDrivers.has((b.driverName || '').trim().toLowerCase());
      if (ak !== bk) return bk - ak;
      const da = distOf(a), db = distOf(b);
      const ka = da == null ? Infinity : da;
      const kb = db == null ? Infinity : db;
      if (ka !== kb) return ka - kb;
      return (a.price || 0) - (b.price || 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, query, knownDrivers, here]);

  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: C.bg, overflowX: 'clip' }}>

      {/* Header */}
      <div style={{ ...glassStyle(dark), padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onOpenDrawer} style={s.iconBtn(C)}>&#9776;</button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center' }}>Find Drivers</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ padding: '14px 16px 100px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Search */}
        <input
          style={{ ...s.input, ...inp }}
          placeholder="Search a product, e.g. Whole Milk"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        {/* Quick product chips from past orders */}
        {orderProducts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {orderProducts.map(p => (
              <button key={p} onClick={() => setQuery(p)} style={{
                fontSize: 12, fontWeight: 600, color: query === p ? '#fff' : C.textSub,
                background: query === p ? ACCENT : C.inputBg, border: `1px solid ${query === p ? ACCENT : C.inputBorder}`,
                borderRadius: 20, padding: '5px 12px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}>{p}</button>
            ))}
          </div>
        )}

        {locReady && !here && listings.length > 0 && (
          <p style={{ fontSize: 12, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
            Enable location to sort drivers by how close they are to you.
          </p>
        )}

        {/* Loading / empty */}
        {loading && listings.length === 0 && (
          <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, paddingTop: 30 }}>Loading drivers…</p>
        )}
        {!loading && results.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>No drivers found</p>
            <p style={{ fontSize: 13, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
              {query ? `No drivers list "${query}" yet.` : 'No driver listings in the marketplace yet.'}
            </p>
          </div>
        )}

        {/* Listing results */}
        {results.map(l => {
          const known = knownDrivers.has((l.driverName || '').trim().toLowerCase());
          return (
            <div key={l.id} style={s.card(C)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{l.productName}</div>
                  <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>
                    {l.driverName || 'A driver'}
                    {distOf(l) != null && <span style={{ color: ACCENT, fontWeight: 600 }}> · {formatDistance(distOf(l))}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>
                    {l.price > 0 ? `$${Number(l.price).toFixed(2)}` : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>per {l.unit}</div>
                </div>
              </div>

              {known && (
                <div style={{ marginTop: 10 }}>
                  <span style={s.knownTag}>✓ You’ve ordered from them before</span>
                </div>
              )}

              {(() => {
                const isSelf = l.userId && l.userId === getCachedUid();
                const conn = connWith(l.userId);
                return (
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    {!isSelf && (
                      conn?.status === 'active' ? (
                        <span style={{ ...s.connectedTag, flex: 1 }}>✓ Connected</span>
                      ) : conn ? (
                        <span style={{ ...s.requestedTag(C), flex: 1 }}>Requested ✓</span>
                      ) : (
                        <button
                          onClick={() => handleConnect(l)}
                          disabled={connectingId === l.id || !l.userId}
                          style={{ ...s.outlineBtn, flex: 1, opacity: connectingId === l.id ? 0.6 : 1 }}
                        >
                          {connectingId === l.id ? 'Requesting…' : 'Connect'}
                        </button>
                      )
                    )}
                    {l.driverPhone && (
                      <a
                        href={buildWhatsAppUrl(l.driverPhone, `Hi, do you have ${l.productName} available? I'd like to place an order.`)}
                        target="_blank" rel="noopener noreferrer"
                        style={{ ...s.accentBtn, flex: 1, textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        Message driver
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}

        <AppFooter onNav={onNav} />
      </div>

      <GuestCapModal
        open={gate}
        onClose={() => setGate(false)}
        title="Account required"
        subtitle="You need a free account to connect with drivers. Create one to continue — your local data comes with you."
      />
    </div>
  );
}

const s = {
  card: (C) => ({ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18, padding: '16px 18px' }),
  input: { width: '100%', boxSizing: 'border-box', height: 46, fontSize: 16, padding: '0 14px', border: '1px solid', borderRadius: 12, outline: 'none', WebkitAppearance: 'none' },
  iconBtn: (C) => ({ width: 36, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: C.text, padding: '4px 6px', WebkitTapHighlightColor: 'transparent', lineHeight: 1, textAlign: 'left' }),
  accentBtn: { background: ACCENT, border: 'none', color: '#fff', padding: '11px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  outlineBtn: { background: 'none', border: `1.5px solid ${ACCENT}`, color: ACCENT, padding: '10px 16px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  connectedTag: { fontSize: 13, fontWeight: 700, color: '#2ECC8A', background: 'rgba(46,204,138,0.12)', border: '1px solid rgba(46,204,138,0.3)', borderRadius: 12, padding: '11px 16px', textAlign: 'center' },
  requestedTag: (C) => ({ fontSize: 13, fontWeight: 700, color: C.textMuted, background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 12, padding: '11px 16px', textAlign: 'center' }),
  knownTag: { fontSize: 11.5, fontWeight: 700, color: '#2ECC8A', background: 'rgba(46,204,138,0.12)', border: '1px solid rgba(46,204,138,0.3)', borderRadius: 8, padding: '4px 10px', display: 'inline-block' },
};
