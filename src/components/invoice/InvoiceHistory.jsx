/**
 * InvoiceHistory — displays all saved invoices grouped by date, with search,
 * status filtering, and per-invoice actions (share, delete, status cycle).
 * All business logic lives in useInvoiceHistory; this component is pure UI.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, GRADIENT, STATUS, glassStyle } from '../../theme';
import AppFooter from '../navigation/AppFooter';
import { useInvoiceHistory, STATUS_CYCLE, PAGE_SIZE, subtotalOf } from '../../hooks/useInvoiceHistory';
import { useDensity } from '../../hooks/useDensity';
import { getPaymentsFor, addPayment, removePayment, getTotalPaid } from '../../utils/paymentStorage';
import { getBridgeRequests, dismissBridgeRequest } from '../../utils/storeOwnerStorage';

/** Format a payment timestamp to "Jun 2 · 3:45 PM" */
function fmtPaymentDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' · '
    + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function InvoiceHistory({ onOpenDrawer, onSelectStore, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const D = useDensity();

  // ── Business logic (state + handlers) from hook ───────────────────────────
  const {
    invoices, bizName, loading,
    expanded, setExpanded,
    search, setSearch,
    statusFilter, setStatusFilter,
    visibleOlder, setVisibleOlder,
    openMenu, setOpenMenu,
    sharing, menuRef,
    outstanding, unpaidCount, partialCount, todayCount, overdueCount, allClear,
    filtered, todayInvoices, visibleOlderList, remaining,
    cycleStatus, setStatus,
    handleDelete, handleShare, handleTogglePin,
    isStorePinned,
  } = useInvoiceHistory();

  // ── Payment log state ─────────────────────────────────────────────────────
  const [logPaymentFor, setLogPaymentFor] = useState(null); // invoice number | null
  const [logAmount, setLogAmount]         = useState('');
  const [logNote, setLogNote]             = useState('');
  const [paymentsVer, setPaymentsVer]     = useState(0);   // bump to re-read payments

  function handleAddPayment() {
    const amt = parseFloat(logAmount);
    if (!logPaymentFor || isNaN(amt) || amt <= 0) return;
    addPayment(logPaymentFor, amt, logNote);
    const inv   = invoices.find(i => (i.number || i.invoice_number) === logPaymentFor);
    const total = inv ? subtotalOf(inv) : 0;
    const paid  = getTotalPaid(logPaymentFor);
    const next  = paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    setStatus(logPaymentFor, next);
    setLogPaymentFor(null);
    setLogAmount('');
    setLogNote('');
    setPaymentsVer(v => v + 1);
  }

  function handleRemovePayment(invoiceNumber, paymentId) {
    removePayment(invoiceNumber, paymentId);
    const inv   = invoices.find(i => (i.number || i.invoice_number) === invoiceNumber);
    const total = inv ? subtotalOf(inv) : 0;
    const paid  = getTotalPaid(invoiceNumber);
    const next  = paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    setStatus(invoiceNumber, next);
    setPaymentsVer(v => v + 1);
  }

  // ── Duplicate invoice ─────────────────────────────────────────────────────
  function handleDuplicate(inv) {
    const prefill = {
      storeName:    inv.storeName    || inv.store_name    || '',
      storePhone:   inv.storePhone   || inv.store_phone   || '',
      storeAddress: inv.storeAddress || inv.store_address || '',
      customerName: inv.customerName || inv.customer_name || '',
      notes:        inv.notes || '',
      items: (inv.items || []).map(item => ({
        id: `dup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name:  item.name,
        qty:   item.qty,
        price: item.price,
      })),
    };
    localStorage.setItem('inv_prefill', JSON.stringify(prefill));
    setOpenMenu(null);
    onNav('invoice');
  }

  // ── Bridge requests (from Store Owner) ───────────────────────────────────
  const [bridgeRequests, setBridgeRequests] = useState(() => getBridgeRequests());

  function handleFillFromRequest(req) {
    const prefill = {
      notes: req.notes || '',
      items: [{
        id:    `br_${Date.now()}`,
        name:  req.productName,
        qty:   req.quantity,
        price: '',
      }],
    };
    localStorage.setItem('inv_prefill', JSON.stringify(prefill));
    dismissBridgeRequest(req.id);
    setBridgeRequests(getBridgeRequests());
    onNav('invoice');
  }

  function handleDismissRequest(id) {
    dismissBridgeRequest(id);
    setBridgeRequests(getBridgeRequests());
  }

  // ── Helper: resolve STATUS color tokens for the current theme ─────────────
  function sc(status) {
    const key = status || 'unpaid';
    return dark ? STATUS[key]?.dark : STATUS[key]?.light;
  }

  // ── Invoice Card ──────────────────────────────────────────────────────────
  function InvoiceCard({ inv, isFirst }) {
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

    // ── COMPACT card: lean 2-line row, total + status inline, no sub-card ──────
    if (D.compact) {
      return (
        <div style={{
          background: C.card,
          borderRadius: 12,
          border: `1px solid ${isOverdue ? (dark ? 'rgba(239,68,68,0.4)' : '#fca5a5') : C.cardBorder}`,
          overflow: 'visible',
          position: 'relative',
        }}>
          {/* Single-tap row */}
          <button
            onClick={() => setExpanded(isOpen ? null : inv.number)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              padding: '9px 12px', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer',
              textAlign: 'left', WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* Status dot */}
            <div style={{
              width: 8, height: 8, borderRadius: 4, flexShrink: 0,
              background: colors?.text || '#888',
            }} />
            {/* Store name */}
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {inv.storeName}
              {isOverdue && <span style={{ fontSize: 9, fontWeight: 800, color: '#ef4444', marginLeft: 6, textTransform: 'uppercase' }}>OVRD</span>}
            </span>
            {/* Total */}
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text, flexShrink: 0 }}>
              ${total.toFixed(2)}
            </span>
            {/* Menu */}
            <div style={{ position: 'relative', flexShrink: 0 }} ref={menuOpen ? menuRef : null}>
              <button
                style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 14, cursor: 'pointer', padding: '0 2px', WebkitTapHighlightColor: 'transparent' }}
                onClick={e => { e.stopPropagation(); setOpenMenu(menuOpen ? null : inv.number); }}
              >•••</button>
              {menuOpen && (
                <div style={{ ...s.dropdown, background: C.card, borderColor: C.cardBorder }}>
                  <p style={{ ...s.dropdownLabel, color: C.textMuted }}>Set Status</p>
                  {STATUS_CYCLE.map(st => {
                    const stColors = dark ? STATUS[st].dark : STATUS[st].light;
                    return (
                      <button key={st} style={{ ...s.dropdownItem, color: C.text }} onClick={() => setStatus(inv.number, st)}>
                        <span style={{ ...s.miniDot, background: stColors.text }} />
                        {STATUS[st].label}
                        {(inv.paymentStatus || 'unpaid') === st && <span style={{ marginLeft: 'auto', color: ACCENT }}>✓</span>}
                      </button>
                    );
                  })}
                  <div style={{ ...s.dropdownDivider, background: C.divider }} />
                  <button style={{ ...s.dropdownItem, color: C.text }} onClick={() => handleShare(inv)}>Share PDF</button>
                  <button style={{ ...s.dropdownItem, color: C.text }} onClick={() => handleDuplicate(inv)}>Duplicate</button>
                  <button style={{ ...s.dropdownItem, color: C.danger }} onClick={() => handleDelete(inv.number)}>Delete Invoice</button>
                </div>
              )}
            </div>
          </button>

          {/* Meta row: number + date + status label */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px 8px', gap: 8 }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>#{inv.number} · {inv.date}{inv.time ? ` · ${inv.time}` : ''}</span>
            <span
              {...(isFirst ? { 'data-tutorial': 'status-badge-latest' } : {})}
              style={{
                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6,
                background: colors?.bg, color: colors?.text,
                marginLeft: 'auto', flexShrink: 0,
              }}
              onClick={() => cycleStatus(inv.number)}
            >{STATUS[inv.paymentStatus || 'unpaid']?.label}</span>
          </div>

          {/* Expanded items (compact) */}
          {isOpen && (
            <div style={{ borderTop: `1px solid ${C.divider}`, padding: '8px 12px 4px' }}>
              {inv.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: idx < inv.items.length - 1 ? `1px solid ${C.divider}` : 'none' }}>
                  <span style={{ flex: 1, fontSize: 12, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                  <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{item.qty} × ${Number(item.price).toFixed(2)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flexShrink: 0, minWidth: 48, textAlign: 'right' }}>${(Number(item.qty) * Number(item.price)).toFixed(2)}</span>
                </div>
              ))}
              {inv.notes && <p style={{ fontSize: 11, color: C.textMuted, margin: '6px 0 2px' }}>📝 {inv.notes}</p>}
              <button
                style={{ width: '100%', marginTop: 6, marginBottom: 4, height: 32, border: 'none', borderRadius: 8, background: ACCENT, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: sharing === inv.number ? 0.6 : 1 }}
                onClick={() => handleShare(inv)}
                disabled={!!sharing}
              >Share PDF</button>
            </div>
          )}
        </div>
      );
    }

    // ── COMFORTABLE card: full layout with nested sub-card ───────────────────
    return (
      <div
        {...(isFirst ? { 'data-tutorial': 'invoice-latest' } : {})}
        style={{ ...s.card, background: C.card, borderColor: isOverdue ? (dark ? 'rgba(239,68,68,0.4)' : '#fca5a5') : C.cardBorder, borderRadius: D.cardRadius }}
      >
        {/* Top row: store + actions */}
        <div style={{ ...s.cardTop, padding: D.cardTopPad }}>
          <div style={s.cardTopLeft}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <button
                {...(isFirst ? { 'data-tutorial': 'store-name-link' } : {})}
                style={{ ...s.storeName, fontSize: D.storeNameSize, color: C.text, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}
                onClick={() => { onSelectStore?.(inv.storeName); if (isFirst) window.dispatchEvent(new CustomEvent('inv-onboarding-store-viewed')); }}
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
            <span style={{ ...s.cardMeta, fontSize: D.metaSize, color: C.textMuted }}>
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
                  <button style={{ ...s.dropdownItem, color: C.text }}
                    onClick={() => handleDuplicate(inv)}
                  >
                    Duplicate
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
          {...(isFirst ? { 'data-tutorial': 'invoice-expand-latest' } : {})}
          style={{ ...s.nestedCard, background: C.nestedCard, borderColor: C.nestedCardBorder }}
          onClick={() => setExpanded(isOpen ? null : inv.number)}
        >
          <div style={{ ...s.nestedTop, padding: D.nestedTopPad }}>
            <div>
              <p style={{ ...s.nestedLabel, color: C.textMuted }}>TOTAL</p>
              {isOpen && (
                <div style={{ marginTop: 8 }}>
                  {inv.items.map((item, idx) => (
                    <div key={idx} style={{ ...s.nestedItem, paddingTop: 8, paddingBottom: 8, borderBottomColor: C.divider, borderBottom: idx < inv.items.length - 1 ? `1px solid ${C.divider}` : 'none' }}>
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
        <div style={{ ...s.cardFooter, padding: D.cardFootPad }}>
          <button
            {...(isFirst ? { 'data-tutorial': 'status-badge-latest' } : {})}
            style={{ ...s.statusBadge, background: colors?.bg, color: colors?.text }}
            onClick={() => cycleStatus(inv.number)}
            title="Tap to change"
          >
            {STATUS[inv.paymentStatus || 'unpaid']?.label}
          </button>
          {sharing === inv.number && (
            <span style={{ ...s.cardMeta, fontSize: D.metaSize, color: C.textMuted }}>Sharing…</span>
          )}
        </div>

        {/* Expanded: notes + payment log + share */}
        {isOpen && (
          <>
            {inv.notes && (
              <div style={{ ...s.notesBox, background: C.bg, borderTopColor: C.divider }}>
                <span style={{ ...s.notesLabel, color: C.textMuted }}>Notes</span>
                <p style={{ ...s.notesText, color: C.textSub }}>{inv.notes}</p>
              </div>
            )}

            {/* Payment log */}
            {(() => {
              const payments = getPaymentsFor(inv.number); // eslint-disable-line
              void paymentsVer; // depend on version to re-read after mutations
              const paid      = payments.reduce((s, p) => s + Number(p.amount), 0);
              const remaining = Math.max(0, total - paid);
              return (
                <div style={{ borderTop: `1px solid ${C.divider}`, padding: '10px 16px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: payments.length ? 8 : 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textMuted }}>Payments</span>
                    {paid > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted }}>
                        ${paid.toFixed(2)} paid · <span style={{ color: remaining > 0 ? '#f59e0b' : '#22c55e' }}>${remaining.toFixed(2)} {remaining > 0 ? 'left' : 'settled'}</span>
                      </span>
                    )}
                  </div>
                  {payments.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${C.divider}` }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', minWidth: 52 }}>${Number(p.amount).toFixed(2)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: C.textMuted }}>{fmtPaymentDate(p.ts)}</div>
                        {p.note && <div style={{ fontSize: 11, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.note}</div>}
                      </div>
                      <button onClick={() => handleRemovePayment(inv.number, p.id)} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 14, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, WebkitTapHighlightColor: 'transparent' }}>×</button>
                    </div>
                  ))}
                  <button
                    onClick={() => { setLogPaymentFor(inv.number); setLogAmount(''); setLogNote(''); }}
                    style={{ marginTop: 8, marginBottom: 4, height: 32, width: '100%', border: `1.5px dashed ${C.divider}`, borderRadius: 8, background: 'none', color: ACCENT, fontSize: 12, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                  >
                    + Log Payment
                  </button>
                </div>
              );
            })()}

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
        <div style={{ width: 36 }} />
        <span style={{ ...s.title, color: C.text }}>{bizName}</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ ...s.body, padding: D.bodyPad, gap: D.cardGap + 2 }}>
        {/* Bridge requests — orders pushed from Store Owner role */}
        {bridgeRequests.length > 0 && (
          <div style={{ background: dark ? '#0a1a3a' : '#eff6ff', border: `1px solid ${dark ? 'rgba(74,123,247,0.25)' : 'rgba(74,123,247,0.2)'}`, borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: ACCENT }}>
              📦 New from Store Owner ({bridgeRequests.length})
            </p>
            {bridgeRequests.map(req => (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: dark ? '#fff' : '#1e3a5f' }}>{req.productName}</div>
                  <div style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,0.5)' : '#4a7bbf' }}>Qty {req.quantity}{req.notes ? ` · ${req.notes}` : ''}</div>
                </div>
                <button onClick={() => handleFillFromRequest(req)} style={{ flexShrink: 0, height: 34, padding: '0 14px', border: 'none', borderRadius: 9, background: ACCENT, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                  Fill Invoice
                </button>
                <button onClick={() => handleDismissRequest(req.id)} style={{ flexShrink: 0, background: 'none', border: 'none', color: dark ? 'rgba(255,255,255,0.4)' : '#93c5fd', fontSize: 16, cursor: 'pointer', padding: '0 4px', WebkitTapHighlightColor: 'transparent' }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

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
              {overdueCount > 0 && (
                <span style={{ ...s.heroPill, background: 'rgba(239,68,68,0.35)', fontWeight: 800 }}>
                  ⚠ {overdueCount} Overdue
                </span>
              )}
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
            {[
              { key: 'all',     label: 'All' },
              { key: 'unpaid',  label: 'Unpaid' },
              { key: 'partial', label: 'Partial' },
              { key: 'paid',    label: 'Paid' },
              { key: 'overdue', label: '⚠ Overdue', danger: true },
            ].map(({ key, label, danger }) => {
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  style={{
                    ...s.filterBtn,
                    background: active ? (danger ? '#ef4444' : ACCENT) : 'none',
                    color: active ? '#fff' : (danger ? '#ef4444' : C.textMuted),
                    fontWeight: active ? 700 : 600,
                    border: active ? 'none' : `1px solid ${danger ? 'rgba(239,68,68,0.3)' : 'transparent'}`,
                  }}
                  onClick={() => { setStatusFilter(key); setVisibleOlder(PAGE_SIZE); }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.textMuted, fontSize: 14 }}>
            Loading invoices…
          </div>
        ) : filtered.length === 0 ? (
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
                {todayInvoices.map((inv, i) => <InvoiceCard key={inv.number} inv={inv} isFirst={i === 0} />)}
              </>
            )}

            {/* Older */}
            {visibleOlderList.length > 0 && (
              <>
                {todayInvoices.length > 0 && (
                  <p style={{ ...s.groupLabel, color: C.textMuted, marginTop: 6 }}>Earlier</p>
                )}
                {visibleOlderList.map((inv, i) => <InvoiceCard key={inv.number} inv={inv} isFirst={todayInvoices.length === 0 && i === 0} />)}
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

      {/* Log Payment modal */}
      {logPaymentFor !== null && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 env(safe-area-inset-bottom)' }}
          onClick={() => setLogPaymentFor(null)}
        >
          <div
            style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', background: C.card, padding: '20px 20px 28px', boxShadow: '0 -8px 40px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: C.divider, margin: '0 auto 18px' }} />
            <p style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 16px' }}>
              Log Payment
              {(() => { const inv = invoices.find(i => (i.number || i.invoice_number) === logPaymentFor); return inv ? <span style={{ fontWeight: 500, color: C.textMuted, fontSize: 13 }}> · Invoice #{logPaymentFor} · {inv.storeName || inv.store_name}</span> : null; })()}
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: '0 0 120px' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>Amount ($)</label>
                <input
                  autoFocus
                  inputMode="decimal"
                  placeholder="0.00"
                  value={logAmount}
                  onChange={e => setLogAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddPayment()}
                  style={{ width: '100%', boxSizing: 'border-box', height: 46, fontSize: 18, fontWeight: 700, padding: '0 12px', border: `1.5px solid ${C.inputBorder}`, borderRadius: 12, background: C.inputBg, color: C.text, outline: 'none' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>Note (optional)</label>
                <input
                  placeholder="e.g. cash, partial..."
                  value={logNote}
                  onChange={e => setLogNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddPayment()}
                  style={{ width: '100%', boxSizing: 'border-box', height: 46, fontSize: 15, padding: '0 12px', border: `1.5px solid ${C.inputBorder}`, borderRadius: 12, background: C.inputBg, color: C.text, outline: 'none' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button
                style={{ flex: 1, height: 48, border: `1px solid ${C.inputBorder}`, borderRadius: 14, background: C.inputBg, color: C.text, fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                onClick={() => setLogPaymentFor(null)}
              >Cancel</button>
              <button
                style={{ flex: 2, height: 48, border: 'none', borderRadius: 14, background: ACCENT, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', opacity: (!logAmount || isNaN(parseFloat(logAmount)) || parseFloat(logAmount) <= 0) ? 0.5 : 1 }}
                onClick={handleAddPayment}
                disabled={!logAmount || isNaN(parseFloat(logAmount)) || parseFloat(logAmount) <= 0}
              >Add Payment</button>
            </div>
          </div>
        </div>,
        document.body
      )}
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
  filterRow: {
    display: 'flex', padding: '8px 8px', gap: 6,
    overflowX: 'auto', scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch',
  },
  filterBtn: {
    flex: '0 0 auto', height: 32, borderRadius: 8,
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    paddingLeft: 10, paddingRight: 10, whiteSpace: 'nowrap',
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
