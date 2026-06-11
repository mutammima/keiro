/**
 * Marketplace — driver-side demand feed (overlay page).
 *
 * Shows open orders that stores across the network have posted. By default it
 * highlights orders that match the products the driver carries (their listings),
 * so a driver can see at a glance "who needs what I have." A driver can accept
 * an open order, which claims it via the shared marketplace_demand table.
 */

import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import {
  loadAllDemandFromCloud, getAllDemand,
  loadMyListingsFromCloud, getMyListings,
  productMatches, claimDemand,
} from '../../utils/marketplaceStorage';
import { getConnections, loadConnectionsFromCloud, requestConnection, getCachedUid } from '../../utils/connectionStorage';
import { getBusinessName, getBusinessPhone } from '../../utils/storage';
import { isGuest } from '../../utils/guestMode';
import { GuestCapModal } from '../../components/auth/GuestUpsell';
import { buildWhatsAppUrl } from '../../utils/invoiceUtils';
import { getCurrentPosition, haversineMiles, formatDistance } from '../../utils/geo';
import AppFooter from '../../components/navigation/AppFooter';

export default function Marketplace({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [demand, setDemand] = useState(() => getAllDemand());
  const [myListings, setMyListings] = useState(() => getMyListings());
  const [onlyMatches, setOnlyMatches] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [here, setHere] = useState(null);       // viewer coords, or null
  const [locReady, setLocReady] = useState(false); // resolved the location attempt

  const [conns, setConns] = useState(() => getConnections());
  const [connectingId, setConnectingId] = useState(null);
  const [gate, setGate] = useState(false);

  useEffect(() => {
    Promise.all([loadAllDemandFromCloud(), loadMyListingsFromCloud()])
      .then(([d, l]) => { setDemand(d); setMyListings(l); })
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

  async function handleConnect(order) {
    if (isGuest()) { setGate(true); return; } // a request needs a session to reach the store
    setConnectingId(order.id);
    await requestConnection('driver', { userId: order.userId, name: order.storeName || 'A store' }, getBusinessName() || '');
    setConns(getConnections());
    setConnectingId(null);
  }

  // Does this order match something I carry?
  function matchesMe(order) {
    return myListings.some(l => productMatches(l.productName, order.productName));
  }

  // Miles from the viewer to a store's order, or null when either lacks coords.
  function distOf(order) {
    return haversineMiles(here, order);
  }

  const open = useMemo(() => demand.filter(d => d.status === 'open'), [demand]);
  const visible = useMemo(() => {
    const list = onlyMatches && myListings.length > 0 ? open.filter(matchesMe) : open;
    // Matches first, then nearest (rows without distance sort last).
    return [...list].sort((a, b) => {
      const m = matchesMe(b) - matchesMe(a);
      if (m !== 0) return m;
      const da = distOf(a), db = distOf(b);
      const ka = da == null ? Infinity : da;
      const kb = db == null ? Infinity : db;
      return ka - kb;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onlyMatches, myListings, here]);

  async function handleAccept(order) {
    setBusyId(order.id);
    const ok = await claimDemand(order.id, getBusinessName() || 'A driver');
    if (ok) {
      setDemand(prev => prev.map(d => d.id === order.id
        ? { ...d, status: 'claimed', claimedName: getBusinessName() || 'You' }
        : d));
    } else {
      // Someone else grabbed it (or RLS race) — refresh so the UI is honest.
      const fresh = await loadAllDemandFromCloud();
      setDemand(fresh);
    }
    setBusyId(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: C.bg, overflowX: 'clip' }}>

      {/* Header */}
      <div style={{ ...glassStyle(dark), padding: '14px 20px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onOpenDrawer} style={s.iconBtn(C)}>&#9776;</button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center' }}>Marketplace</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ padding: '14px 16px 100px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Filter toggle */}
        {myListings.length > 0 && (
          <div style={{ display: 'flex', background: C.inputBg, borderRadius: 12, padding: 4, gap: 4 }}>
            <FilterBtn label="Matches my products" active={onlyMatches} onClick={() => setOnlyMatches(true)} C={C} />
            <FilterBtn label="All open orders" active={!onlyMatches} onClick={() => setOnlyMatches(false)} C={C} />
          </div>
        )}

        {locReady && !here && open.length > 0 && (
          <p style={{ fontSize: 12, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
            Enable location to sort orders by how close they are to you.
          </p>
        )}

        {myListings.length === 0 && (
          <div style={{ ...s.card(C), background: dark ? 'rgba(74,123,247,0.12)' : 'rgba(74,123,247,0.08)', border: `1px solid ${dark ? 'rgba(74,123,247,0.30)' : 'rgba(74,123,247,0.25)'}` }}>
            <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.5 }}>
              Add what you carry in <strong>My Listings</strong> and we’ll highlight the orders that match your products.
            </p>
            <button onClick={() => onNav('my-listings')} style={{ ...s.accentBtn, marginTop: 12 }}>Set up My Listings</button>
          </div>
        )}

        {/* Loading / empty */}
        {loading && open.length === 0 && (
          <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, paddingTop: 30 }}>Loading open orders…</p>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>No open orders right now</p>
            <p style={{ fontSize: 13, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
              {onlyMatches && myListings.length > 0
                ? 'No open orders match your products yet. Try “All open orders”.'
                : 'When a store posts an order, it’ll show up here.'}
            </p>
          </div>
        )}

        {/* Demand cards */}
        {visible.map(order => {
          const match = matchesMe(order);
          return (
            <div key={order.id} style={{ ...s.card(C), borderColor: match ? ACCENT : C.cardBorder }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{order.productName}</div>
                  <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>
                    {order.storeName || 'A store'} · Qty {order.quantity}
                  </div>
                </div>
                {match && <span style={s.matchTag}>Matches you</span>}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {distOf(order) != null && <Chip C={C} accent>{formatDistance(distOf(order))}</Chip>}
                {order.neededBy && <Chip C={C}>Needed by {order.neededBy}</Chip>}
                {order.targetPrice > 0 && <Chip C={C}>Target ${Number(order.targetPrice).toFixed(2)}</Chip>}
              </div>

              {order.notes && (
                <p style={{ fontSize: 13, color: C.textMuted, margin: '10px 0 0', lineHeight: 1.5 }}>{order.notes}</p>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => handleAccept(order)}
                  disabled={busyId === order.id}
                  style={{ ...s.accentBtn, flex: 1, opacity: busyId === order.id ? 0.6 : 1 }}
                >
                  {busyId === order.id ? 'Accepting…' : 'Accept order'}
                </button>
                {(() => {
                  const isSelf = order.userId && order.userId === getCachedUid();
                  const conn = connWith(order.userId);
                  if (isSelf) return null;
                  if (conn?.status === 'active') return <span style={{ ...s.outlineBtn(C), color: '#2ECC8A', borderColor: 'rgba(46,204,138,0.5)', display: 'flex', alignItems: 'center' }}>🔗</span>;
                  if (conn) return <span style={{ ...s.outlineBtn(C), color: C.textMuted, borderColor: C.inputBorder, display: 'flex', alignItems: 'center' }}>Requested</span>;
                  return (
                    <button
                      onClick={() => handleConnect(order)}
                      disabled={connectingId === order.id || !order.userId}
                      style={{ ...s.outlineBtn(C), color: ACCENT, borderColor: ACCENT, opacity: connectingId === order.id ? 0.6 : 1 }}
                    >
                      {connectingId === order.id ? '…' : 'Connect'}
                    </button>
                  );
                })()}
                {order.storePhone && (
                  <a
                    href={buildWhatsAppUrl(order.storePhone, `Hi, I can supply your order for ${order.quantity}× ${order.productName}.`)}
                    target="_blank" rel="noopener noreferrer"
                    style={{ ...s.outlineBtn(C), color: ACCENT, borderColor: ACCENT, textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                  >
                    Message
                  </a>
                )}
              </div>
            </div>
          );
        })}

        <AppFooter onNav={onNav} />
      </div>

      <GuestCapModal
        open={gate}
        onClose={() => setGate(false)}
        title="Account required"
        subtitle="You need a free account to connect with stores. Create one to continue — your local data comes with you."
      />
    </div>
  );
}

function FilterBtn({ label, active, onClick, C }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, border: 'none', borderRadius: 9, padding: '8px 6px',
      fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer',
      background: active ? ACCENT : 'transparent', color: active ? '#fff' : C.textMuted,
      WebkitTapHighlightColor: 'transparent', transition: 'background 0.15s',
    }}>{label}</button>
  );
}

function Chip({ children, C, accent }) {
  return (
    <span style={{
      fontSize: 11.5, fontWeight: accent ? 700 : 600,
      color: accent ? ACCENT : C.textSub,
      background: accent ? 'rgba(74,123,247,0.12)' : C.inputBg,
      border: `1px solid ${accent ? 'rgba(74,123,247,0.35)' : C.inputBorder}`,
      borderRadius: 20, padding: '4px 10px',
    }}>
      {children}
    </span>
  );
}

const s = {
  card: (C) => ({ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18, padding: '16px 18px' }),
  iconBtn: (C) => ({ width: 36, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: C.text, padding: '4px 6px', WebkitTapHighlightColor: 'transparent', lineHeight: 1, textAlign: 'left' }),
  accentBtn: { background: ACCENT, border: 'none', color: '#fff', padding: '11px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  outlineBtn: (C) => ({ background: 'none', border: '1.5px solid', borderRadius: 12, padding: '11px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }),
  matchTag: { flexShrink: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#fff', background: ACCENT, borderRadius: 8, padding: '4px 8px' },
};
