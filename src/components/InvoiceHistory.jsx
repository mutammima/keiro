import { useState, useRef, useEffect } from 'react';
import {
  getInvoices,
  updateInvoicePaymentStatus,
  deleteInvoice,
  togglePinnedStore,
  isStorePinned,
} from '../utils/storage';
import { generateAndSharePDF } from '../utils/pdfGenerator';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, STATUS, glassStyle } from '../theme';

const STATUS_CYCLE = ['unpaid', 'paid', 'partial'];
const PAGE_SIZE = 8;

function todayStr() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function subtotalOf(inv) {
  return inv.items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
}

export default function InvoiceHistory({ onOpenDrawer }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [invoices, setInvoices] = useState(() => [...getInvoices()].reverse());
  const [expanded, setExpanded]   = useState(null);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [visibleOlder, setVisibleOlder] = useState(PAGE_SIZE);
  const [openMenu, setOpenMenu]   = useState(null);
  const [sharing, setSharing]     = useState(null);
  const [, forceUpdate]           = useState(0);
  const menuRef = useRef(null);

  const today = todayStr();

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    function close(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, [openMenu]);

  // ── Stats for hero card ───────────────────────────────────────────────────
  const outstanding = invoices
    .filter(i => (i.paymentStatus || 'unpaid') !== 'paid')
    .reduce((s, i) => s + subtotalOf(i), 0);
  const unpaidCount  = invoices.filter(i => (i.paymentStatus || 'unpaid') === 'unpaid').length;
  const partialCount = invoices.filter(i => i.paymentStatus === 'partial').length;
  const todayCount   = invoices.filter(i => i.date === today).length;
  const allClear     = outstanding === 0 && invoices.length > 0;

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = invoices.filter(inv => {
    const q = search.trim().toLowerCase();
    const matchQ = !q || inv.storeName.toLowerCase().includes(q) || String(inv.number).includes(q);
    const matchS = statusFilter === 'all' || (inv.paymentStatus || 'unpaid') === statusFilter;
    return matchQ && matchS;
  });

  const todayInvoices = filtered.filter(i => i.date === today);
  const olderInvoices = filtered.filter(i => i.date !== today);
  const visibleOlderList = olderInvoices.slice(0, visibleOlder);
  const remaining = olderInvoices.length - visibleOlderList.length;

  // ── Actions ───────────────────────────────────────────────────────────────
  function cycleStatus(number) {
    const inv = invoices.find(i => i.number === number);
    const cur  = inv?.paymentStatus || 'unpaid';
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
    updateInvoicePaymentStatus(number, next);
    setInvoices(prev => prev.map(i => i.number === number ? { ...i, paymentStatus: next } : i));
    setOpenMenu(null);
  }

  function setStatus(number, status) {
    updateInvoicePaymentStatus(number, status);
    setInvoices(prev => prev.map(i => i.number === number ? { ...i, paymentStatus: status } : i));
    setOpenMenu(null);
  }

  function handleDelete(number) {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return;
    deleteInvoice(number);
    setInvoices(prev => prev.filter(i => i.number !== number));
    setOpenMenu(null);
  }

  async function handleShare(inv) {
    setSharing(inv.number); setOpenMenu(null);
    try { await generateAndSharePDF(inv); }
    catch (e) { console.error(e); }
    finally { setSharing(null); }
  }

  function handleTogglePin(storeName) {
    togglePinnedStore(storeName);
    forceUpdate(n => n + 1);
  }

  function sc(status) {
    const key = status || 'unpaid';
    return dark ? STATUS[key]?.dark : STATUS[key]?.light;
  }

  // ── Invoice Card ──────────────────────────────────────────────────────────
  function InvoiceCard({ inv }) {
    const total   = subtotalOf(inv);
    const isOpen  = expanded === inv.number;
    const pinned  = isStorePinned(inv.storeName);
    const colors  = sc(inv.paymentStatus);
    const menuOpen = openMenu === inv.number;

    return (
      <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
        {/* Top row: store + actions */}
        <div style={s.cardTop}>
          <div style={s.cardTopLeft}>
            <span style={{ ...s.storeName, color: C.text }}>{inv.storeName}</span>
            <span style={{ ...s.cardMeta, color: C.textMuted }}>
              #{inv.number}  ·  {inv.date}{inv.time ? `  ·  ${inv.time}` : ''}
            </span>
          </div>
          <div style={s.cardActions}>
            <button
              style={{ ...s.iconActionBtn, color: pinned ? '#f59e0b' : C.textMuted }}
              onClick={() => handleTogglePin(inv.storeName)}
              title={pinned ? 'Unpin store' : 'Pin store'}
            >
              {pinned ? '★' : '☆'}
            </button>
            <div style={{ position: 'relative' }} ref={menuOpen ? menuRef : null}>
              <button
                style={{ ...s.iconActionBtn, color: C.textMuted }}
                onClick={() => setOpenMenu(menuOpen ? null : inv.number)}
              >
                •••
              </button>
              {menuOpen && (
                <div style={{ ...s.dropdown, background: C.card, borderColor: C.cardBorder }}>
                  <p style={{ ...s.dropdownLabel, color: C.textMuted }}>Set Status</p>
                  {STATUS_CYCLE.map(st => {
                    const stColors = dark ? STATUS[st].dark : STATUS[st].light;
                    return (
                      <button
                        key={st}
                        style={{ ...s.dropdownItem, color: C.text }}
                        onClick={() => setStatus(inv.number, st)}
                      >
                        <span style={{ ...s.miniDot, background: stColors.text }} />
                        {STATUS[st].label}
                        {(inv.paymentStatus || 'unpaid') === st && (
                          <span style={{ marginLeft: 'auto', color: ACCENT }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                  <div style={{ ...s.dropdownDivider, background: C.divider }} />
                  <button style={{ ...s.dropdownItem, color: C.text }}
                    onClick={() => handleShare(inv)}
                  >
                    Share PDF
                  </button>
                  <button style={{ ...s.dropdownItem, color: C.danger }}
                    onClick={() => handleDelete(inv.number)}
                  >
                    Delete Invoice
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Nested card — tap to expand */}
        <div
          style={{ ...s.nestedCard, background: C.nestedCard, borderColor: C.nestedCardBorder }}
          onClick={() => setExpanded(isOpen ? null : inv.number)}
        >
          <div style={s.nestedTop}>
            <div>
              <p style={{ ...s.nestedLabel, color: C.textMuted }}>TOTAL</p>
              {isOpen && (
                <div style={{ marginTop: 8 }}>
                  {inv.items.map((item, idx) => (
                    <div key={idx} style={{ ...s.nestedItem, borderBottomColor: C.divider, borderBottom: idx < inv.items.length - 1 ? `1px solid ${C.divider}` : 'none' }}>
                      <span style={{ ...s.nestedItemName, color: C.textSub }}>{item.name}</span>
                      <span style={{ ...s.nestedItemDetail, color: C.textMuted }}>
                        {item.qty} × ${Number(item.price).toFixed(2)}
                      </span>
                      <span style={{ ...s.nestedItemTotal, color: C.text }}>
                        ${(Number(item.qty) * Number(item.price)).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={s.nestedRight}>
              <p style={{ ...s.nestedTotal, color: C.text }}>${total.toFixed(2)}</p>
              <p style={{ ...s.nestedCount, color: C.textMuted }}>
                {inv.items.length} item{inv.items.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div style={s.nestedExpandHint}>
            <span style={{ ...s.expandText, color: C.textMuted }}>
              {isOpen ? '▲ collapse' : '▼ tap to expand'}
            </span>
          </div>
        </div>

        {/* Status badge row */}
        <div style={s.cardFooter}>
          <button
            style={{ ...s.statusBadge, background: colors?.bg, color: colors?.text }}
            onClick={() => cycleStatus(inv.number)}
            title="Tap to change"
          >
            {STATUS[inv.paymentStatus || 'unpaid']?.label}
          </button>
          {sharing === inv.number && (
            <span style={{ ...s.cardMeta, color: C.textMuted }}>Sharing…</span>
          )}
        </div>

        {/* Expanded: notes + share */}
        {isOpen && (
          <>
            {inv.notes && (
              <div style={{ ...s.notesBox, background: C.bg, borderTopColor: C.divider }}>
                <span style={{ ...s.notesLabel, color: C.textMuted }}>Notes</span>
                <p style={{ ...s.notesText, color: C.textSub }}>{inv.notes}</p>
              </div>
            )}
            <div style={{ ...s.expandedActions, borderTopColor: C.divider }}>
              <button
                style={{ ...s.shareBtn, opacity: sharing === inv.number ? 0.6 : 1 }}
                onClick={() => handleShare(inv)}
                disabled={!!sharing}
              >
                Share PDF
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  return (
    <div style={{ ...s.page, background: C.bg }}>
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer}>☰</button>
        <span style={{ ...s.title, color: C.text }}>History</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>
        {/* Hero card */}
        {invoices.length > 0 && (
          <div style={{
            ...s.heroCard,
            background: allClear
              ? 'linear-gradient(135deg, #064e3b 0%, #059669 100%)'
              : 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
          }}>
            <div style={s.heroTop}>
              <span style={s.heroLabel}>
                {allClear ? 'ALL COLLECTED' : 'OUTSTANDING'}
              </span>
              <span style={s.heroAmt}>${outstanding.toFixed(2)}</span>
            </div>
            <div style={s.heroPills}>
              <span style={s.heroPill}>{unpaidCount} Unpaid</span>
              {partialCount > 0 && <span style={s.heroPill}>{partialCount} Partial</span>}
              <span style={s.heroPill}>{todayCount} Today</span>
              <span style={s.heroPill}>{invoices.length} Total</span>
            </div>
          </div>
        )}

        {/* Search + filter */}
        <div style={{ ...s.filterCard, background: C.card, borderColor: C.cardBorder }}>
          <input
            style={{ ...s.searchInput, color: C.text, background: 'transparent' }}
            placeholder="Search by store or invoice #"
            value={search}
            onChange={e => { setSearch(e.target.value); setVisibleOlder(PAGE_SIZE); }}
          />
          <div style={{ ...s.filterDivider, background: C.divider }} />
          <div style={s.filterRow}>
            {['all', 'unpaid', 'paid', 'partial'].map(f => (
              <button
                key={f}
                style={{
                  ...s.filterBtn,
                  background: statusFilter === f ? ACCENT : 'none',
                  color: statusFilter === f ? '#fff' : C.textMuted,
                }}
                onClick={() => { setStatusFilter(f); setVisibleOlder(PAGE_SIZE); }}
              >
                {f === 'all' ? 'All' : STATUS[f]?.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={s.empty}>
            <p style={{ ...s.emptyText, color: C.textSub }}>
              {invoices.length === 0 ? 'No invoices yet.' : 'No results.'}
            </p>
            <p style={{ ...s.emptySubText, color: C.textMuted }}>
              {invoices.length === 0 ? 'Generated invoices will appear here.' : 'Try a different search or filter.'}
            </p>
          </div>
        ) : (
          <>
            {/* Today */}
            {todayInvoices.length > 0 && (
              <>
                <p style={{ ...s.groupLabel, color: C.textMuted }}>Today</p>
                {todayInvoices.map(inv => <InvoiceCard key={inv.number} inv={inv} />)}
              </>
            )}

            {/* Older */}
            {visibleOlderList.length > 0 && (
              <>
                {todayInvoices.length > 0 && (
                  <p style={{ ...s.groupLabel, color: C.textMuted, marginTop: 6 }}>Earlier</p>
                )}
                {visibleOlderList.map(inv => <InvoiceCard key={inv.number} inv={inv} />)}
              </>
            )}

            {/* Load more */}
            {remaining > 0 && (
              <button
                style={{ ...s.loadMoreBtn, background: C.card, color: C.textSub, borderColor: C.cardBorder }}
                onClick={() => setVisibleOlder(v => v + PAGE_SIZE)}
              >
                Load {Math.min(remaining, PAGE_SIZE)} more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' },
  header: {
    padding: '12px 16px 10px',
    paddingTop: 'max(12px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', padding: '3px 4px',
    WebkitTapHighlightColor: 'transparent', flexShrink: 0,
  },
  title: { flex: 1, fontSize: 17, fontWeight: 700, textAlign: 'center' },
  body: {
    padding: '14px 14px 56px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },

  // Hero card
  heroCard: {
    borderRadius: 16, padding: '18px 20px',
    color: '#fff',
  },
  heroTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
    textTransform: 'uppercase', opacity: 0.75, paddingTop: 3,
  },
  heroAmt: { fontSize: 32, fontWeight: 800, letterSpacing: -0.5 },
  heroPills: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 },
  heroPill: {
    fontSize: 11, fontWeight: 600, padding: '3px 10px',
    borderRadius: 20, background: 'rgba(255,255,255,0.18)',
  },

  // Search/filter
  filterCard: {
    borderRadius: 12, border: '1px solid', overflow: 'hidden',
  },
  searchInput: {
    width: '100%', boxSizing: 'border-box', height: 42,
    fontSize: 15, padding: '0 14px', border: 'none',
    outline: 'none',
  },
  filterDivider: { height: 1 },
  filterRow: { display: 'flex', padding: '7px 7px', gap: 5 },
  filterBtn: {
    flex: 1, height: 30, border: 'none', borderRadius: 6,
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },

  // Group labels
  groupLabel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', margin: '2px 2px 0',
  },

  // Invoice card
  card: {
    borderRadius: 16, border: '1px solid', overflow: 'visible',
    position: 'relative',
  },
  cardTop: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: '14px 14px 10px', gap: 8,
  },
  cardTopLeft: { display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 },
  storeName: { fontSize: 16, fontWeight: 700 },
  cardMeta: { fontSize: 12 },
  cardActions: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  iconActionBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 18, width: 34, height: 34,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, padding: 0, WebkitTapHighlightColor: 'transparent',
  },

  // Dropdown menu
  dropdown: {
    position: 'absolute', top: 36, right: 0,
    borderRadius: 12, border: '1px solid',
    boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
    zIndex: 100, minWidth: 180, overflow: 'hidden',
  },
  dropdownLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', padding: '10px 14px 4px', margin: 0,
  },
  dropdownItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '11px 14px',
    background: 'none', border: 'none',
    fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left',
    WebkitTapHighlightColor: 'transparent',
  },
  dropdownDivider: { height: 1, margin: '4px 0' },
  miniDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },

  // Nested card
  nestedCard: {
    margin: '0 10px 10px',
    borderRadius: 12, border: '1px solid',
    cursor: 'pointer', overflow: 'hidden',
  },
  nestedTop: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', padding: '12px 14px 0',
  },
  nestedLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
    margin: 0,
  },
  nestedRight: { textAlign: 'right' },
  nestedTotal: { fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.5 },
  nestedCount: { fontSize: 11, margin: '1px 0 0' },
  nestedItem: {
    display: 'flex', alignItems: 'center', gap: 6,
    paddingTop: 8, paddingBottom: 8,
  },
  nestedItemName: { flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  nestedItemDetail: { fontSize: 12, flexShrink: 0 },
  nestedItemTotal: { fontSize: 13, fontWeight: 600, flexShrink: 0, minWidth: 52, textAlign: 'right' },
  nestedExpandHint: {
    display: 'flex', justifyContent: 'center',
    padding: '6px 14px 10px',
  },
  expandText: { fontSize: 11 },

  // Footer
  cardFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '2px 14px 12px', gap: 8,
  },
  statusBadge: {
    fontSize: 11, fontWeight: 700, padding: '3px 10px',
    borderRadius: 20, border: 'none', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', letterSpacing: '0.03em',
  },

  // Expanded sections
  notesBox: {
    padding: '10px 14px', borderTop: '1px solid',
  },
  notesLabel: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  notesText: { fontSize: 13, margin: '3px 0 0', lineHeight: 1.5 },
  expandedActions: {
    padding: '10px 14px 14px', borderTop: '1px solid',
  },
  shareBtn: {
    width: '100%', height: 42,
    background: ACCENT, border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 700, color: '#fff',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },

  // Load more
  loadMoreBtn: {
    width: '100%', height: 46, border: '1px solid',
    borderRadius: 12, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },

  // Empty
  empty: {
    paddingTop: 60, textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
  },
  emptyText: { fontSize: 17, fontWeight: 700, margin: 0 },
  emptySubText: { fontSize: 14, margin: 0 },
};
