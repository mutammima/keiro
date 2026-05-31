/**
 * InvoiceHistory — displays all saved invoices grouped by date, with search,
 * status filtering, and per-invoice actions (share, delete, status cycle).
 * All business logic lives in useInvoiceHistory; this component is pure UI.
 */

import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, GRADIENT, STATUS, glassStyle } from '../theme';
import AppFooter from './AppFooter';
import { useInvoiceHistory, STATUS_CYCLE, PAGE_SIZE, subtotalOf } from '../hooks/useInvoiceHistory';

export default function InvoiceHistory({ onOpenDrawer, onSelectStore, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  // ── Business logic (state + handlers) from hook ───────────────────────────
  const {
    invoices, bizName,
    expanded, setExpanded,
    search, setSearch,
    statusFilter, setStatusFilter,
    visibleOlder, setVisibleOlder,
    openMenu, setOpenMenu,
    sharing, menuRef,
    outstanding, unpaidCount, partialCount, todayCount, allClear,
    filtered, todayInvoices, visibleOlderList, remaining,
    cycleStatus, setStatus,
    handleDelete, handleShare, handleTogglePin,
    isStorePinned,
  } = useInvoiceHistory();

  // ── Helper: resolve STATUS color tokens for the current theme ─────────────
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

    // Overdue: unpaid/partial and older than 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const invDate = new Date(inv.date);
    const isOverdue = (inv.paymentStatus !== 'paid') &&
      !isNaN(invDate) && invDate.getTime() < sevenDaysAgo;

    return (
      <div style={{ ...s.card, background: C.card, borderColor: isOverdue ? (dark ? 'rgba(239,68,68,0.4)' : '#fca5a5') : C.cardBorder }}>
        {/* Top row: store + actions */}
        <div style={s.cardTop}>
          <div style={s.cardTopLeft}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <button
                style={{ ...s.storeName, color: C.text, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}
                onClick={() => onSelectStore?.(inv.storeName)}
              >
                {inv.storeName}
              </button>
              {isOverdue && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: dark ? 'rgba(239,68,68,0.18)' : '#fef2f2',
                  color: '#ef4444',
                  border: '1px solid ' + (dark ? 'rgba(239,68,68,0.35)' : '#fca5a5'),
                  borderRadius: 5, padding: '1px 6px',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>Overdue</span>
              )}
            </div>
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
        <span style={{ ...s.title, color: C.text }}>{bizName}</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>
        {/* Hero card */}
        {invoices.length > 0 && (
          <div style={{
            ...s.heroCard,
            background: allClear
              ? 'linear-gradient(135deg, #0D2B20 0%, #1a5c3a 100%)'
              : GRADIENT,
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
        <AppFooter onNav={onNav} />
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: "100%", display: "flex", flexDirection: "column", overflowX: "hidden" },
  header: {
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
  body: {
    padding: '12px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },

  // Hero card
  heroCard: {
    borderRadius: 20, padding: '20px 22px',
    color: '#fff',
  },
  heroTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
    textTransform: 'uppercase', opacity: 0.65, paddingTop: 4,
  },
  heroAmt: { fontSize: 36, fontWeight: 800, letterSpacing: -1 },
  heroPills: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 },
  heroPill: {
    fontSize: 11, fontWeight: 600, padding: '4px 11px',
    borderRadius: 20, background: 'rgba(255,255,255,0.15)',
  },

  // Search/filter
  filterCard: {
    borderRadius: 16, overflow: 'hidden',
  },
  searchInput: {
    width: '100%', boxSizing: 'border-box', height: 44,
    fontSize: 15, padding: '0 16px', border: 'none',
    outline: 'none',
  },
  filterDivider: { height: 1 },
  filterRow: { display: 'flex', padding: '8px 8px', gap: 6 },
  filterBtn: {
    flex: 1, height: 32, border: 'none', borderRadius: 8,
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },

  // Group labels
  groupLabel: {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', margin: '4px 4px 0',
  },

  // Invoice card
  card: {
    borderRadius: 18, overflow: 'visible',
    border: '1px solid',
    position: 'relative',
  },
  cardTop: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: '16px 16px 10px', gap: 8,
  },
  cardTopLeft: { display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 },
  storeName: { fontSize: 16, fontWeight: 700 },
  cardMeta: { fontSize: 12 },
  cardActions: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  iconActionBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 18, width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 18, padding: 0, WebkitTapHighlightColor: 'transparent',
  },

  // Dropdown menu
  dropdown: {
    position: 'absolute', top: 36, right: 0,
    borderRadius: 14,
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    zIndex: 100, minWidth: 190, overflow: 'hidden',
  },
  dropdownLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', padding: '11px 16px 4px', margin: 0,
  },
  dropdownItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '12px 16px',
    background: 'none', border: 'none',
    fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left',
    WebkitTapHighlightColor: 'transparent',
  },
  dropdownDivider: { height: 1, margin: '4px 0' },
  miniDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },

  // Nested card
  nestedCard: {
    margin: '0 12px 12px',
    borderRadius: 14,
    cursor: 'pointer', overflow: 'hidden',
  },
  nestedTop: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', padding: '14px 16px 0',
  },
  nestedLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
    margin: 0,
  },
  nestedRight: { textAlign: 'right' },
  nestedTotal: { fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.5 },
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
    padding: '2px 16px 14px', gap: 8,
  },
  statusBadge: {
    fontSize: 11, fontWeight: 700, padding: '4px 12px',
    borderRadius: 20, border: 'none', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', letterSpacing: '0.03em',
  },

  // Expanded sections
  notesBox: {
    padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  notesLabel: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  notesText: { fontSize: 13, margin: '3px 0 0', lineHeight: 1.5 },
  expandedActions: {
    padding: '10px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  shareBtn: {
    width: '100%', height: 44,
    background: ACCENT, border: 'none', borderRadius: 12,
    fontSize: 14, fontWeight: 700, color: '#fff',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },

  // Load more
  loadMoreBtn: {
    width: '100%', height: 48, border: 'none',
    borderRadius: 16, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },

  // Empty
  empty: {
    paddingTop: 72, textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  emptyText: { fontSize: 18, fontWeight: 700, margin: 0 },
  emptySubText: { fontSize: 14, margin: 0 },
};
