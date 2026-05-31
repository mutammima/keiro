import { useState } from 'react';
import { generatePDFBlob } from '../utils/pdfGenerator';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, STATUS } from '../theme';

export default function InvoiceView({ invoice, onBack, onNewInvoice }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);

  const subtotal = invoice.items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
  const sc = dark ? STATUS[invoice.paymentStatus || 'unpaid']?.dark : STATUS[invoice.paymentStatus || 'unpaid']?.light;

  async function getBlob() {
    return generatePDFBlob(invoice);
  }

  async function handleDownload() {
    setBusy('download');
    try {
      const { blob, filename } = await getBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { console.error(e); }
    finally { setBusy(''); }
  }

  async function handleShare() {
    setBusy('share');
    try {
      const { blob, filename } = await getBlob();
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Invoice #${invoice.number}` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (e) { if (e?.name !== 'AbortError') console.error(e); }
    finally { setBusy(''); }
  }

  function handleCopy() {
    const lines = [
      `Invoice #${invoice.number}`,
      `${invoice.date}${invoice.time ? '  ' + invoice.time : ''}`,
      '',
      invoice.businessName || '',
      invoice.businessPhone || '',
      '',
      `Bill To: ${invoice.storeName}`,
      invoice.storePhone || '',
      invoice.storeAddress || '',
      '',
      '---',
      ...invoice.items.map(i =>
        `${i.name}  ${i.qty} x $${Number(i.price).toFixed(2)} = $${(i.qty * i.price).toFixed(2)}`
      ),
      '---',
      `Total: $${subtotal.toFixed(2)}`,
      ...(invoice.notes ? ['', `Notes: ${invoice.notes}`] : []),
    ].filter((l, i, a) => !(l === '' && (a[i - 1] === '' || i === 0)));
    navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ ...s.page, background: C.bg }}>
      <div style={{ ...s.header, background: C.header, borderBottomColor: C.headerBorder }}>
        <button style={{ ...s.backBtn, color: ACCENT }} onClick={onBack}>← Back</button>
        <span style={{ ...s.title, color: C.text }}>Invoice #{invoice.number}</span>
        <div style={{ width: 60 }} />
      </div>

      <div style={s.body}>
        {/* Invoice document */}
        <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
          {/* Business header */}
          <div style={s.bizBlock}>
            <p style={{ ...s.bizName, color: C.text }}>{invoice.businessName}</p>
            {invoice.businessPhone && <p style={{ ...s.bizPhone, color: C.textMuted }}>{invoice.businessPhone}</p>}
          </div>

          <div style={{ ...s.rule, background: C.divider }} />

          {/* Meta row */}
          <div style={s.metaRow}>
            <div style={s.metaCell}>
              <span style={{ ...s.metaLabel, color: C.textMuted }}>Invoice</span>
              <span style={{ ...s.metaValue, color: C.text }}>#{invoice.number}</span>
            </div>
            <div style={s.metaCell}>
              <span style={{ ...s.metaLabel, color: C.textMuted }}>Date</span>
              <span style={{ ...s.metaValue, color: C.text }}>{invoice.date}</span>
            </div>
            {invoice.time && (
              <div style={s.metaCell}>
                <span style={{ ...s.metaLabel, color: C.textMuted }}>Time</span>
                <span style={{ ...s.metaValue, color: C.text }}>{invoice.time}</span>
              </div>
            )}
            <div style={s.metaCell}>
              <span style={{ ...s.metaLabel, color: C.textMuted }}>Status</span>
              <span style={{ ...s.statusPill, background: sc?.bg, color: sc?.text }}>
                {STATUS[invoice.paymentStatus || 'unpaid']?.label}
              </span>
            </div>
          </div>

          <div style={{ ...s.rule, background: C.divider }} />

          {/* Bill To */}
          <div style={s.billTo}>
            <span style={{ ...s.metaLabel, color: C.textMuted }}>Bill To</span>
            <p style={{ ...s.storeName, color: C.text }}>{invoice.storeName}</p>
            {invoice.storePhone && <p style={{ ...s.storeDetail, color: C.textMuted }}>{invoice.storePhone}</p>}
            {invoice.storeAddress && <p style={{ ...s.storeDetail, color: C.textMuted }}>{invoice.storeAddress}</p>}
          </div>

          <div style={{ ...s.rule, background: C.divider }} />

          {/* Items table header */}
          <div style={s.tableHead}>
            <span style={{ ...s.col1, ...s.colHead, color: C.textMuted }}>Item</span>
            <span style={{ ...s.colQ, ...s.colHead, color: C.textMuted }}>Qty</span>
            <span style={{ ...s.colP, ...s.colHead, color: C.textMuted }}>Price</span>
            <span style={{ ...s.colT, ...s.colHead, color: C.textMuted }}>Total</span>
          </div>

          {invoice.items.map((item, idx) => (
            <div key={idx} style={{ ...s.tableRow, borderBottomColor: C.divider }}>
              <span style={{ ...s.col1, color: C.text }}>{item.name}</span>
              <span style={{ ...s.colQ, color: C.textSub }}>{item.qty}</span>
              <span style={{ ...s.colP, color: C.textSub }}>${Number(item.price).toFixed(2)}</span>
              <span style={{ ...s.colT, color: C.text, fontWeight: 700 }}>
                ${(Number(item.qty) * Number(item.price)).toFixed(2)}
              </span>
            </div>
          ))}

          {/* Total */}
          <div style={{ ...s.totalRow, background: C.subtotalBar }}>
            <span style={{ ...s.totalLabel, color: C.subtotalText }}>Total Due</span>
            <span style={{ ...s.totalAmt, color: C.subtotalText }}>${subtotal.toFixed(2)}</span>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div style={{ ...s.notesBox, borderTopColor: C.divider }}>
              <span style={{ ...s.metaLabel, color: C.textMuted }}>Notes</span>
              <p style={{ ...s.notesText, color: C.textSub }}>{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <button
          style={{ ...s.primaryBtn, opacity: busy === 'download' ? 0.7 : 1 }}
          onClick={handleDownload}
          disabled={!!busy}
        >
          {busy === 'download' ? 'Preparing…' : 'Download PDF'}
        </button>

        <div style={s.secondaryRow}>
          <button
            style={{ ...s.secondaryBtn, background: C.card, color: C.text, borderColor: C.cardBorder, opacity: busy === 'share' ? 0.7 : 1 }}
            onClick={handleShare}
            disabled={!!busy}
          >
            {busy === 'share' ? '…' : 'Share'}
          </button>
          <button
            style={{ ...s.secondaryBtn, background: copied ? C.successBg : C.card, color: copied ? C.successText : C.text, borderColor: C.cardBorder }}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy Text'}
          </button>
        </div>

        <button
          style={{ ...s.ghostBtn, color: ACCENT, borderColor: C.cardBorder, background: C.card }}
          onClick={onNewInvoice}
        >
          New Invoice
        </button>
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' },
  header: {
    borderBottom: '1px solid',
    padding: '12px 16px 10px',
    paddingTop: 'max(12px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    background: 'none', border: 'none', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', padding: '4px 0', WebkitTapHighlightColor: 'transparent',
  },
  title: { fontSize: 16, fontWeight: 700 },
  body: {
    padding: '14px 16px 48px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  card: {
    borderRadius: 12, border: '1px solid', overflow: 'hidden',
  },
  bizBlock: { padding: '16px 16px 12px', textAlign: 'center' },
  bizName: { fontSize: 16, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', margin: 0 },
  bizPhone: { fontSize: 12, margin: '3px 0 0' },
  rule: { height: 1 },
  metaRow: {
    display: 'flex', flexWrap: 'wrap', gap: 0,
    padding: '12px 16px',
  },
  metaCell: {
    display: 'flex', flexDirection: 'column', gap: 2,
    marginRight: 20, marginBottom: 4,
  },
  metaLabel: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  metaValue: { fontSize: 13, fontWeight: 600 },
  statusPill: {
    fontSize: 11, fontWeight: 700, padding: '2px 8px',
    borderRadius: 20, display: 'inline-block', letterSpacing: '0.03em',
  },
  billTo: { padding: '12px 16px' },
  storeName: { fontSize: 15, fontWeight: 700, margin: '3px 0 0' },
  storeDetail: { fontSize: 12, margin: '2px 0 0' },
  tableHead: {
    display: 'flex', padding: '8px 16px 6px',
  },
  tableRow: {
    display: 'flex', padding: '9px 16px',
    borderBottom: '1px solid',
  },
  col1: { flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  colQ: { width: 36, flexShrink: 0, fontSize: 13, textAlign: 'right' },
  colP: { width: 60, flexShrink: 0, fontSize: 13, textAlign: 'right' },
  colT: { width: 62, flexShrink: 0, fontSize: 13, textAlign: 'right' },
  colHead: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  totalRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '13px 16px',
  },
  totalLabel: { fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  totalAmt: { fontSize: 20, fontWeight: 800 },
  notesBox: { padding: '12px 16px', borderTop: '1px solid' },
  notesText: { fontSize: 13, margin: '4px 0 0', lineHeight: 1.5 },
  primaryBtn: {
    width: '100%', height: 52,
    background: ACCENT, border: 'none', borderRadius: 10,
    fontSize: 16, fontWeight: 700, color: '#fff',
    cursor: 'pointer', boxShadow: '0 2px 12px rgba(26,115,232,0.3)',
    WebkitTapHighlightColor: 'transparent',
  },
  secondaryRow: { display: 'flex', gap: 10 },
  secondaryBtn: {
    flex: 1, height: 44, border: '1px solid',
    borderRadius: 10, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  ghostBtn: {
    width: '100%', height: 44, border: '1px solid',
    borderRadius: 10, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
};
