import { useState } from 'react';
import { generatePDFBlob } from '../utils/pdfGenerator';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';

export default function InvoiceView({ invoice, onBack, onNewInvoice }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);

  const subtotal = invoice.items.reduce(
    (s, i) => s + Number(i.qty) * Number(i.price), 0
  );

  async function getBlob() {
    const { blob, filename } = await generatePDFBlob(invoice);
    return { blob, filename };
  }

  async function handleDownload() {
    setBusy('download');
    try {
      const { blob, filename } = await getBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy('');
    }
  }

  async function handleShare() {
    setBusy('share');
    try {
      const { blob, filename } = await getBlob();
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Invoice #${invoice.number}` });
      } else {
        // fallback download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (e) {
      if (e?.name !== 'AbortError') console.error(e);
    } finally {
      setBusy('');
    }
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
      '',
      '---',
      ...invoice.items.map(i =>
        `${i.name}  ${i.qty} x $${Number(i.price).toFixed(2)} = $${(i.qty * i.price).toFixed(2)}`
      ),
      '---',
      `Total: $${subtotal.toFixed(2)}`,
    ].filter((l, i, a) => !(l === '' && a[i - 1] === '')); // collapse double blanks

    navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ ...s.page, background: C.bg }}>
      {/* Header */}
      <div style={{ ...s.header, background: C.header, borderBottomColor: C.headerBorder }}>
        <button style={{ ...s.backBtn, color: ACCENT }} onClick={onBack}>
          ← Back
        </button>
        <span style={{ ...s.title, color: C.text }}>Invoice #{invoice.number}</span>
        <div style={{ width: 64 }} />
      </div>

      <div style={s.body}>
        {/* Invoice card */}
        <div style={{ ...s.card, background: C.card }}>
          {/* Business */}
          <div style={s.bizBlock}>
            <p style={{ ...s.bizName, color: C.text }}>{invoice.businessName}</p>
            {invoice.businessPhone && (
              <p style={{ ...s.bizPhone, color: C.textMuted }}>{invoice.businessPhone}</p>
            )}
          </div>

          <div style={{ ...s.metaDivider, background: C.headerBorder }} />

          {/* Meta */}
          <div style={s.metaGrid}>
            <div>
              <p style={{ ...s.metaLabel, color: C.textMuted }}>Invoice No.</p>
              <p style={{ ...s.metaValue, color: C.text }}>#{invoice.number}</p>
            </div>
            <div>
              <p style={{ ...s.metaLabel, color: C.textMuted }}>Date</p>
              <p style={{ ...s.metaValue, color: C.text }}>{invoice.date}</p>
            </div>
            {invoice.time && (
              <div>
                <p style={{ ...s.metaLabel, color: C.textMuted }}>Time</p>
                <p style={{ ...s.metaValue, color: C.text }}>{invoice.time}</p>
              </div>
            )}
          </div>

          <div style={{ ...s.metaDivider, background: C.headerBorder }} />

          {/* Bill To */}
          <div style={s.billTo}>
            <p style={{ ...s.metaLabel, color: C.textMuted }}>Bill To</p>
            <p style={{ ...s.storeName, color: C.text }}>{invoice.storeName}</p>
            {invoice.storePhone && (
              <p style={{ ...s.metaValue, color: C.textMuted }}>{invoice.storePhone}</p>
            )}
          </div>

          <div style={{ ...s.metaDivider, background: C.headerBorder }} />

          {/* Items */}
          <div style={s.itemsHeader}>
            <span style={{ ...s.col1, ...s.colHeader, color: C.textMuted }}>Description</span>
            <span style={{ ...s.colNum, ...s.colHeader, color: C.textMuted }}>Qty</span>
            <span style={{ ...s.colNum, ...s.colHeader, color: C.textMuted }}>Price</span>
            <span style={{ ...s.colNum, ...s.colHeader, color: C.textMuted }}>Total</span>
          </div>

          {invoice.items.map((item, idx) => (
            <div key={idx} style={{
              ...s.itemRow,
              borderBottomColor: C.divider,
            }}>
              <span style={{ ...s.col1, color: C.text }}>{item.name}</span>
              <span style={{ ...s.colNum, color: C.textSub }}>{item.qty}</span>
              <span style={{ ...s.colNum, color: C.textSub }}>${Number(item.price).toFixed(2)}</span>
              <span style={{ ...s.colNum, color: C.text, fontWeight: 700 }}>
                ${(Number(item.qty) * Number(item.price)).toFixed(2)}
              </span>
            </div>
          ))}

          {/* Total */}
          <div style={{ ...s.totalRow, background: C.subtotalBar }}>
            <span style={{ ...s.totalLabel, color: C.subtotalText }}>Total Due</span>
            <span style={{ ...s.totalAmt, color: C.subtotalText }}>${subtotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <button
          style={{ ...s.primaryBtn, opacity: busy === 'download' ? 0.7 : 1 }}
          onClick={handleDownload}
          disabled={!!busy}
        >
          {busy === 'download' ? 'Preparing…' : 'Download PDF'}
        </button>

        <div style={s.secondaryRow}>
          <button
            style={{ ...s.secondaryBtn, background: C.card, color: C.text, borderColor: C.inputBorder, opacity: busy === 'share' ? 0.7 : 1 }}
            onClick={handleShare}
            disabled={!!busy}
          >
            {busy === 'share' ? '…' : 'Share'}
          </button>
          <button
            style={{ ...s.secondaryBtn, background: copied ? C.successBg : C.card, color: copied ? C.successText : C.text, borderColor: C.inputBorder }}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy Text'}
          </button>
        </div>

        <button
          style={{ ...s.newInvoiceBtn, color: ACCENT, background: C.card, borderColor: C.inputBorder }}
          onClick={onNewInvoice}
        >
          New Invoice
        </button>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    borderBottom: '1px solid',
    padding: '14px 16px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 0',
    WebkitTapHighlightColor: 'transparent',
  },
  title: {
    fontSize: 17,
    fontWeight: 800,
  },
  body: {
    padding: '16px 16px 48px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    maxWidth: 480,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  card: {
    borderRadius: 16,
    padding: '20px 18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  bizBlock: {
    textAlign: 'center',
    paddingBottom: 16,
  },
  bizName: {
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    margin: 0,
  },
  bizPhone: {
    fontSize: 13,
    margin: '4px 0 0',
  },
  metaDivider: {
    height: 1,
    margin: '0 0 14px',
  },
  metaGrid: {
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap',
    paddingBottom: 14,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    margin: '0 0 2px',
  },
  metaValue: {
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
  },
  billTo: {
    paddingBottom: 16,
  },
  storeName: {
    fontSize: 16,
    fontWeight: 700,
    margin: '2px 0 0',
  },
  itemsHeader: {
    display: 'flex',
    gap: 4,
    paddingBottom: 6,
  },
  colHeader: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemRow: {
    display: 'flex',
    gap: 4,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottom: '1px solid',
  },
  col1: {
    flex: 1,
    fontSize: 14,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  colNum: {
    width: 58,
    flexShrink: 0,
    fontSize: 13,
    textAlign: 'right',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    padding: '14px 16px',
    borderRadius: 10,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalAmt: {
    fontSize: 22,
    fontWeight: 800,
  },
  primaryBtn: {
    width: '100%',
    height: 58,
    background: ACCENT,
    border: 'none',
    borderRadius: 16,
    fontSize: 17,
    fontWeight: 800,
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(26,115,232,0.35)',
    WebkitTapHighlightColor: 'transparent',
  },
  secondaryRow: {
    display: 'flex',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    border: '1.5px solid',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.15s',
  },
  newInvoiceBtn: {
    width: '100%',
    height: 48,
    border: '1.5px solid',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
};
