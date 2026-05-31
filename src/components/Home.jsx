/**
 * Home — Dashboard / overview screen.
 * Shows: outstanding balance, pinned stores, top-selling products, quick actions.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, STATUS } from '../theme';
import { getInvoices, getPinnedStores, getBusinessName } from '../utils/storage';
import AppFooter from './AppFooter';

function subtotalOf(inv) {
  return (inv.items || []).reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
}

function todayStr() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function Home({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [invoices, setInvoices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const pinned = getPinnedStores();
  const bizName = getBusinessName() || 'InvoiceGo';

  useEffect(() => {
    getInvoices().then(list => {
      setInvoices(Array.isArray(list) ? list : []);
      setLoading(false);
    });
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const today = todayStr();

  const todayInvoices   = invoices.filter(inv => inv.date === today);
  const todayTotal      = todayInvoices.reduce((s, inv) => s + subtotalOf(inv), 0);
  const todayCollected  = todayInvoices
    .filter(inv => inv.paymentStatus === 'paid')
    .reduce((s, inv) => s + subtotalOf(inv), 0);

  const outstanding = invoices
    .filter(inv => inv.paymentStatus === 'unpaid' || inv.paymentStatus === 'partial')
    .reduce((s, inv) => s + subtotalOf(inv), 0);
  const unpaidCount = invoices.filter(inv => !inv.paymentStatus || inv.paymentStatus === 'unpaid').length;

  // Overdue: unpaid invoices older than 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const overdueInvoices = invoices.filter(inv => {
    if (inv.paymentStatus === 'paid') return false;
    const d = new Date(inv.date);
    return !isNaN(d) && d.getTime() < sevenDaysAgo;
  });

  // Top 4 products by quantity sold this month
  const thisMonth = new Date().getMonth();
  const thisYear  = new Date().getFullYear();
  const productQty = {};
  invoices.forEach(inv => {
    const d = new Date(inv.date);
    if (isNaN(d) || d.getMonth() !== thisMonth || d.getFullYear() !== thisYear) return;
    (inv.items || []).forEach(item => {
      productQty[item.name] = (productQty[item.name] || 0) + Number(item.qty);
    });
  });
  const topProducts = Object.entries(productQty)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  // Pinned store balances
  const storeBalance = {};
  invoices.forEach(inv => {
    if (!storeBalance[inv.storeName]) storeBalance[inv.storeName] = 0;
    if (inv.paymentStatus !== 'paid') {
      storeBalance[inv.storeName] += subtotalOf(inv);
    }
  });

  return (
    <div style={{ ...s.page, background: C.bg, color: C.text }}>
      {/* Header */}
      <div style={{ ...s.header, background: C.bg, borderBottom: `1px solid ${C.divider}` }}>
        <button style={{ ...s.menuBtn, color: C.text }} onClick={onOpenDrawer}>☰</button>
        <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{bizName}</span>
        <button
          style={{ ...s.actionChip, background: ACCENT, color: '#fff' }}
          onClick={() => onNav('invoice')}
        >+ New</button>
      </div>

      <div style={s.scroll}>

        {/* Today's summary strip */}
        <div style={{ ...s.strip, background: dark ? '#0d1a3a' : '#eef3ff', borderColor: dark ? '#1a2f5a' : '#c7d8ff' }}>
          <div style={s.stripItem}>
            <span style={{ ...s.stripVal, color: ACCENT }}>${todayTotal.toFixed(2)}</span>
            <span style={{ ...s.stripLabel, color: C.textMuted }}>Today's Total</span>
          </div>
          <div style={{ ...s.stripDivider, background: dark ? '#1a2f5a' : '#c7d8ff' }} />
          <div style={s.stripItem}>
            <span style={{ ...s.stripVal, color: '#22c55e' }}>${todayCollected.toFixed(2)}</span>
            <span style={{ ...s.stripLabel, color: C.textMuted }}>Collected</span>
          </div>
          <div style={{ ...s.stripDivider, background: dark ? '#1a2f5a' : '#c7d8ff' }} />
          <div style={s.stripItem}>
            <span style={{ ...s.stripVal, color: '#f59e0b' }}>{todayInvoices.length}</span>
            <span style={{ ...s.stripLabel, color: C.textMuted }}>Invoices</span>
          </div>
        </div>

        {/* Outstanding balance card */}
        <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
          <div style={s.cardRow}>
            <div>
              <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Outstanding Balance</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: outstanding > 0 ? '#ef4444' : '#22c55e' }}>
                ${outstanding.toFixed(2)}
              </div>
              {unpaidCount > 0 && (
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>{unpaidCount} unpaid invoice{unpaidCount !== 1 ? 's' : ''}</div>
              )}
            </div>
            <button
              style={{ ...s.viewBtn, borderColor: C.divider, color: ACCENT }}
              onClick={() => onNav('history')}
            >View all →</button>
          </div>

          {/* Overdue alert */}
          {overdueInvoices.length > 0 && (
            <div style={{ ...s.overdueAlert, background: dark ? 'rgba(239,68,68,0.12)' : '#fef2f2', borderColor: dark ? 'rgba(239,68,68,0.25)' : '#fecaca' }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
                {overdueInvoices.length} overdue invoice{overdueInvoices.length !== 1 ? 's' : ''} — follow up needed
              </span>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={s.sectionHeader}>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Quick Actions</span>
        </div>
        <div style={s.quickGrid}>
          {[
            { icon: '📄', label: 'New Invoice', action: () => onNav('invoice') },
            { icon: '📋', label: 'History',     action: () => onNav('history') },
            { icon: '📦', label: 'Products',    action: () => onNav('products') },
            { icon: '📊', label: 'Reports',     action: () => onNav('reports') },
            { icon: '🌙', label: 'End of Day',  action: () => onNav('end-of-day') },
            { icon: '⌖',  label: 'Store Info',  action: () => onNav('store-map') },
          ].map(q => (
            <button
              key={q.label}
              style={{ ...s.quickBtn, background: C.card, borderColor: C.cardBorder, color: C.text }}
              onClick={q.action}
            >
              <span style={{ fontSize: 22 }}>{q.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>{q.label}</span>
            </button>
          ))}
        </div>

        {/* Pinned stores */}
        {pinned.length > 0 && (
          <>
            <div style={s.sectionHeader}>
              <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>★ Pinned Stores</span>
              <button style={{ ...s.seeAll, color: ACCENT }} onClick={() => onNav('store-map')}>See all</button>
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pinned.map(name => {
                const bal = storeBalance[name] || 0;
                return (
                  <div key={name} style={{ ...s.storeRow, background: C.card, borderColor: C.cardBorder }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: C.text, flex: 1 }}>{name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: bal > 0 ? '#ef4444' : '#22c55e' }}>
                      {bal > 0 ? `-$${bal.toFixed(2)}` : '✓ Paid'}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Top products */}
        {topProducts.length > 0 && (
          <>
            <div style={s.sectionHeader}>
              <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Top Products This Month</span>
              <button style={{ ...s.seeAll, color: ACCENT }} onClick={() => onNav('products')}>Manage</button>
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
              {topProducts.map(([name, qty], i) => (
                <div key={name} style={{ ...s.storeRow, background: C.card, borderColor: C.cardBorder }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, width: 18 }}>{i + 1}</span>
                  <span style={{ fontWeight: 600, fontSize: 14, color: C.text, flex: 1 }}>{name}</span>
                  <span style={{ fontSize: 13, color: C.textMuted }}>{qty} units</span>
                </div>
              ))}
            </div>
          </>
        )}

        {loading && (
          <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: '32px 0' }}>
            Loading...
          </div>
        )}

        {!loading && invoices.length === 0 && (
          <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 14, padding: '40px 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
            <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>Welcome to InvoiceGo</div>
            <div>Tap <strong>+ New</strong> to create your first invoice.</div>
          </div>
        )}

        <AppFooter />
      </div>
    </div>
  );
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    paddingTop: 'max(12px, env(safe-area-inset-top))',
    gap: 12,
    flexShrink: 0,
    zIndex: 10,
  },
  menuBtn: {
    background: 'none', border: 'none',
    fontSize: 20, cursor: 'pointer',
    padding: '4px 6px',
    WebkitTapHighlightColor: 'transparent',
    lineHeight: 1,
  },
  actionChip: {
    marginLeft: 'auto',
    border: 'none', borderRadius: 20,
    padding: '7px 16px',
    fontSize: 13, fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  scroll: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    paddingBottom: 80,
  },
  strip: {
    display: 'flex',
    margin: '12px 16px',
    borderRadius: 14,
    border: '1px solid',
    overflow: 'hidden',
  },
  stripItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 8px',
  },
  stripVal: {
    fontSize: 18,
    fontWeight: 800,
  },
  stripLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: 2,
  },
  stripDivider: {
    width: 1,
    alignSelf: 'stretch',
  },
  card: {
    margin: '0 16px 12px',
    borderRadius: 16,
    border: '1px solid',
    padding: '16px',
  },
  cardRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewBtn: {
    background: 'none',
    border: '1px solid',
    borderRadius: 10,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  overdueAlert: {
    marginTop: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 12px',
    borderRadius: 10,
    border: '1px solid',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 16px 10px',
  },
  seeAll: {
    background: 'none',
    border: 'none',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    padding: 0,
  },
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    padding: '0 16px 16px',
  },
  quickBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 8px',
    borderRadius: 14,
    border: '1px solid',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    background: 'none',
  },
  storeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '11px 14px',
    borderRadius: 12,
    border: '1px solid',
  },
};
