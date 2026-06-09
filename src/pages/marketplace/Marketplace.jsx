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
import { getBusinessName, getBusinessPhone } from '../../utils/storage';
import { buildWhatsAppUrl } from '../../utils/invoiceUtils';
import AppFooter from '../../components/navigation/AppFooter';

export default function Marketplace({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [demand, setDemand] = useState(() => getAllDemand());
  const [myListings, setMyListings] = useState(() => getMyListings());
  const [onlyMatches, setOnlyMatches] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    Promise.all([loadAllDemandFromCloud(), loadMyListingsFromCloud()])
      .then(([d, l]) => { setDemand(d); setMyListings(l); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Does this order match something I carry?
  function matchesMe(order) {
    return myListings.some(l => productMatches(l.productName, order.productName));
  }

  const open = useMemo(() => demand.filter(d => d.status === 'open'), [demand]);
  const visible = useMemo(() => {
    const list = onlyMatches && myListings.length > 0 ? open.filter(matchesMe) : open;
    // Matches first, then newest
    return [...list].sort((a, b) => (matchesMe(b) - matchesMe(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onlyMatches, myListings]);

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

  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

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

function Chip({ children, C }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.textSub, background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 20, padding: '4px 10px' }}>
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
