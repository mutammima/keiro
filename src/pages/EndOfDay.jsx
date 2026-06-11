/**
 * EndOfDay — Driver's end-of-day summary screen.
 * Shows: invoices created today, total value, collected, outstanding.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, STATUS } from '../theme';
import { getInvoices } from '../utils/storage';
import AppFooter from '../components/navigation/AppFooter';
import { subtotalOf, getStatus, todayInvoiceDate } from '../utils/invoiceUtils';

export default function EndOfDay({ onOpenDrawer, onNav, embedded }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [invoices, setInvoices] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    getInvoices().then(list => {
      setInvoices(Array.isArray(list) ? list : []);
      setLoading(false);
    });
  }, []);

  const today = todayInvoiceDate();
  const todayInvoices = invoices.filter(inv => inv.date === today);

  const total = todayInvoices.reduce((s, inv) => s + subtotalOf(inv), 0);
  const collected = todayInvoices
    .filter(inv => getStatus(inv) === 'paid')
    .reduce((s, inv) => s + subtotalOf(inv), 0);
  const outstanding = total - collected;

  const cashTotal = todayInvoices
    .filter(inv => !inv.paymentMethod || inv.paymentMethod === 'cash')
    .reduce((s, inv) => s + subtotalOf(inv), 0);
  const cardTotal = todayInvoices
    .filter(inv => inv.paymentMethod === 'card')
    .reduce((s, inv) => s + subtotalOf(inv), 0);

  const paidCount    = todayInvoices.filter(i => getStatus(i) === 'paid').length;
  const unpaidCount  = todayInvoices.filter(i => getStatus(i) === 'unpaid').length;
  const partialCount = todayInvoices.filter(i => getStatus(i) === 'partial').length;

  function sc(status) {
    const key = status || 'unpaid';
    return dark ? STATUS[key]?.dark : STATUS[key]?.light;
  }

  return (
    <div style={{ ...s.page, background: C.bg, color: C.text }}>
      {/* Header */}
      {!embedded && (
        <div style={{ ...s.header, background: C.bg, borderBottom: `1px solid ${C.divider}` }}>
          <button style={{ ...s.backBtn, color: C.text }} onClick={() => onNav?.('route')}>←</button>
          <span style={{ fontSize: 17, fontWeight: 700 }}>End of Day</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: C.textMuted }}>
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      )}

      <div style={s.scroll}>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: '60px 24px' }}>Loading…</div>
        ) : todayInvoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textMuted, marginBottom: 16 }}>—</div>
            <div style={{ fontWeight: 700, fontSize: 17, color: C.text, marginBottom: 8 }}>No invoices today</div>
            <div style={{ color: C.textMuted, fontSize: 14 }}>Your day's summary will appear here once you create invoices.</div>
          </div>
        ) : (
          <>
            {/* Big summary cards */}
            <div style={s.summaryGrid}>
              <SummaryCard label="Total Value"   value={`$${total.toFixed(2)}`}       color={ACCENT}     dark={dark} C={C} />
              <SummaryCard label="Collected"     value={`$${collected.toFixed(2)}`}   color="#22c55e"    dark={dark} C={C} />
              <SummaryCard label="Outstanding"   value={`$${outstanding.toFixed(2)}`} color={outstanding > 0 ? '#ef4444' : '#22c55e'} dark={dark} C={C} />
              <SummaryCard label="Invoices"      value={todayInvoices.length}          color={C.text}     dark={dark} C={C} />
            </div>

            {/* Status breakdown */}
            <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.textMuted, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status Breakdown</div>
              {[
                { label: 'Paid',    count: paidCount,    status: 'paid' },
                { label: 'Unpaid',  count: unpaidCount,  status: 'unpaid' },
                { label: 'Partial', count: partialCount, status: 'partial' },
              ].filter(r => r.count > 0).map(row => {
                const colors = sc(row.status);
                return (
                  <div key={row.status} style={s.breakdownRow}>
                    <div style={{ ...s.statusDot, background: colors?.text || '#999' }} />
                    <span style={{ flex: 1, fontSize: 14, color: C.text }}>{row.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: colors?.text || C.text }}>{row.count} invoice{row.count !== 1 ? 's' : ''}</span>
                  </div>
                );
              })}
            </div>

            {/* Cash / Card breakdown */}
            {(cashTotal > 0 || cardTotal > 0) && (
              <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textMuted, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment Method</div>
                {cashTotal > 0 && (
                  <div style={s.breakdownRow}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.textMuted }}>Cash</span>
                    <span style={{ flex: 1, fontSize: 14, color: C.text }}></span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>${cashTotal.toFixed(2)}</span>
                  </div>
                )}
                {cardTotal > 0 && (
                  <div style={s.breakdownRow}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.textMuted }}>Card</span>
                    <span style={{ flex: 1, fontSize: 14, color: C.text }}></span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>${cardTotal.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Invoice list */}
            <div style={{ padding: '4px 16px 0', fontSize: 13, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Today's Invoices
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todayInvoices.map(inv => {
                const total  = subtotalOf(inv);
                const st     = getStatus(inv);
                const colors = sc(st);
                return (
                  <div key={inv.number || inv.invoice_number} style={{ ...s.invRow, background: C.card, borderColor: C.cardBorder }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{inv.storeName || inv.store_name}</div>
                      <div style={{ fontSize: 12, color: C.textMuted }}>#{inv.number || inv.invoice_number}{inv.time ? `  ·  ${inv.time}` : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>${total.toFixed(2)}</div>
                      <div style={{ ...s.statusChip, background: colors?.bg, color: colors?.text, borderColor: colors?.border }}>
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <AppFooter />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, C }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.cardBorder}`,
      borderRadius: 16,
      padding: '16px 12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    }}>
      <span style={{ fontSize: 22, fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>{label}</span>
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
  },
  backBtn: {
    background: 'none', border: 'none',
    fontSize: 22, cursor: 'pointer',
    padding: '2px 4px',
    WebkitTapHighlightColor: 'transparent',
    lineHeight: 1,
  },
  scroll: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    paddingBottom: 80,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    padding: '16px 16px 8px',
  },
  card: {
    margin: '8px 16px',
    borderRadius: 16,
    border: '1px solid',
    padding: '16px',
  },
  breakdownRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
    marginBottom: 2,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
  },
  invRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 14px',
    borderRadius: 12,
    border: '1px solid',
  },
  statusChip: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 6,
    border: '1px solid',
    marginTop: 3,
  },
};
