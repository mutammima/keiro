/**
 * DriverStores — Tab 2 ("Stores") for the Driver role.
 * Shows the driver's connected stores (derived from invoice history) with each
 * store's outstanding balance, plus any pending order requests pushed from the
 * Store Owner side.
 *
 * Phase 1 note: "connected stores" are inferred from invoice history until the
 * invite-only connections table lands (Step 5). Tapping a store opens its
 * running-balance page via onSelectStore.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { getInvoices } from '../../utils/storage';
import { subtotalOf, getStatus } from '../../utils/invoiceUtils';
import { getBridgeRequests, loadBridgeRequestsFromCloud } from '../../utils/storeOwnerStorage';
import { getConnections, loadConnectionsFromCloud, cancelInvite, inviteLink } from '../../utils/connectionStorage';
import InviteModal from '../../components/connections/InviteModal';
import AppFooter from '../../components/navigation/AppFooter';

function lastDateOf(a, b) {
  const ta = Date.parse(a || '') || 0;
  const tb = Date.parse(b || '') || 0;
  return tb > ta ? b : a;
}

export default function DriverStores({ onOpenDrawer, onNav, onSelectStore }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [requests, setRequests] = useState(() => getBridgeRequests());
  const [conns, setConns]       = useState(() => getConnections());
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    getInvoices()
      .then(list => { setInvoices(list || []); setLoading(false); })
      .catch(() => setLoading(false));
    loadBridgeRequestsFromCloud().then(setRequests).catch(() => {});
    loadConnectionsFromCloud().then(setConns).catch(() => {});
  }, []);

  const pendingInvites = conns.filter(c => c.status === 'pending');

  function copyInvite(code) {
    try { navigator.clipboard.writeText(inviteLink(code)); } catch {}
  }

  // Group invoices by store → outstanding balance, count, last delivery date.
  const stores = (() => {
    const map = {};
    invoices.forEach(inv => {
      const name = inv.storeName || inv.store_name || 'Unknown';
      if (!map[name]) map[name] = { name, count: 0, outstanding: 0, total: 0, lastDate: '' };
      const st = map[name];
      st.count   += 1;
      st.total   += subtotalOf(inv);
      if (getStatus(inv) !== 'paid') st.outstanding += subtotalOf(inv);
      st.lastDate = lastDateOf(st.lastDate, inv.date);
    });
    return Object.values(map).sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));
  })();

  const totalOutstanding = stores.reduce((s, st) => s + st.outstanding, 0);

  return (
    <div style={{ ...s.page, background: C.bg }}>

      {/* Header */}
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <div style={{ width: 36 }} />
        <span style={{ ...s.title, color: C.text }}>Stores</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>

        {/* Connect a store (invite-only) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>🔗 Connect a store</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
              Invite a store with a code — they link to you automatically when they join.
            </div>
          </div>
          <button onClick={() => setShowInvite(true)} style={{ flexShrink: 0, height: 34, padding: '0 16px', border: 'none', borderRadius: 9, background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            Invite
          </button>
        </div>

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.textMuted, marginBottom: 8 }}>Pending invites</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingInvites.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 16, fontWeight: 800, letterSpacing: '0.12em', color: C.text }}>{c.inviteCode}</span>
                  <button onClick={() => copyInvite(c.inviteCode)} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '2px 4px', WebkitTapHighlightColor: 'transparent' }}>Copy</button>
                  <button onClick={() => { cancelInvite(c.id); setConns(getConnections()); }} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '2px 4px', WebkitTapHighlightColor: 'transparent' }}>Cancel</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending order requests from Store Owners */}
        {requests.length > 0 && (
          <div style={{ background: dark ? '#0a1a3a' : '#eff6ff', border: `1px solid ${dark ? 'rgba(74,123,247,0.25)' : 'rgba(74,123,247,0.2)'}`, borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT }}>
                📦 {requests.length} pending request{requests.length > 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,0.55)' : '#4a7bbf', marginTop: 2 }}>
                Stores are waiting on a delivery — fill them into an invoice.
              </div>
            </div>
            <button
              onClick={() => onNav('route')}
              style={{ flexShrink: 0, height: 34, padding: '0 14px', border: 'none', borderRadius: 9, background: ACCENT, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              Review
            </button>
          </div>
        )}

        {/* Outstanding summary */}
        {stores.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 18, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textMuted }}>
              Total Outstanding
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, color: C.text, marginTop: 4, letterSpacing: '-0.02em' }}>
              ${totalOutstanding.toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
              across {stores.length} store{stores.length > 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* Store list */}
        {loading ? (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: '48px 24px' }}>Loading…</div>
        ) : stores.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '32px 18px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: C.textMuted, margin: '0 0 14px' }}>No stores yet. Create an invoice to start tracking a store.</p>
            <button
              onClick={() => onNav('route')}
              style={{ background: ACCENT, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              + New Invoice
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stores.map(st => (
              <button
                key={st.name}
                onClick={() => onSelectStore?.(st.name)}
                style={{ textAlign: 'left', background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.name}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    {st.count} invoice{st.count > 1 ? 's' : ''}{st.lastDate ? ` · ${st.lastDate}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: st.outstanding > 0 ? C.text : '#22c55e' }}>
                    ${st.outstanding.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>
                    {st.outstanding > 0 ? 'outstanding' : 'paid up'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <AppFooter onNav={onNav} />
      </div>

      {showInvite && <InviteModal role="driver" onClose={() => { setShowInvite(false); setConns(getConnections()); }} />}
    </div>
  );
}

const s = {
  page: { minHeight: '100%', display: 'flex', flexDirection: 'column', overflowX: 'clip' },
  header: {
    padding: '14px 20px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', gap: 14,
  },
  title: { flex: 1, fontSize: 18, fontWeight: 700, textAlign: 'center', letterSpacing: 0.2 },
  body: {
    padding: '12px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
};
