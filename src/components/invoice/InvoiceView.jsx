/**
 * InvoiceView — read-only display of a single saved invoice with PDF download,
 * native share, and plain-text copy actions.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, STATUS, glassStyle } from '../../theme';
import { getBusinessName } from '../../utils/storage';
import SignaturePad from '../ui/SignaturePad';
import { getSignatures, saveSignatures } from '../../utils/signatureStorage';
import { getTotalPaid } from '../../utils/paymentStorage';
import { DEFAULT_BUSINESS_NAME } from '../../utils/constants';
import { subtotalOf, buildWhatsAppUrl } from '../../utils/invoiceUtils';

export default function InvoiceView({ invoice, onBack, onNewInvoice }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  // ── State ──────────────────────────────────────────────────────────────────
  const [busy, setBusy] = useState('');   // 'download' | 'share' | ''
  const [copied, setCopied] = useState(false);
  const [sellerSig, setSellerSig] = useState(null);
  const [buyerSig,  setBuyerSig]  = useState(null);
  const [showSigs,  setShowSigs]  = useState(false);
  const [sigSaved,  setSigSaved]  = useState(false); // flash "Saved" after auto-save

  // ── Load saved signatures on mount ─────────────────────────────────────────
  useEffect(() => {
    const saved = getSignatures(invoice.number);
    if (saved.seller) { setSellerSig(saved.seller); setShowSigs(true); }
    if (saved.buyer)  { setBuyerSig(saved.buyer);   setShowSigs(true); }
  }, [invoice.number]);

  // ── Auto-save whenever either signature changes ────────────────────────────
  useEffect(() => {
    // Only persist if at least one sig exists (don't write a blank entry on mount)
    if (sellerSig !== null || buyerSig !== null) {
      saveSignatures(invoice.number, sellerSig, buyerSig);
      setSigSaved(true);
      const t = setTimeout(() => setSigSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [sellerSig, buyerSig]); // eslint-disable-line

  // ── Derived values ─────────────────────────────────────────────────────────
  const subtotal = subtotalOf(invoice);
  const paid = getTotalPaid(invoice.number);
  const due = Math.max(0, subtotal - paid);
  const sc = dark ? STATUS[invoice.paymentStatus || 'unpaid']?.dark : STATUS[invoice.paymentStatus || 'unpaid']?.light;

  /** Generates the PDF blob + filename for this invoice. */
  async function getBlob() {
    // Lazy-load the PDF stack (jsPDF + autotable) only on demand.
    const { generatePDFBlob } = await import('../../utils/pdfGenerator');
    return generatePDFBlob({ ...invoice, sellerSignature: sellerSig, buyerSignature: buyerSig, paidAmount: paid });
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  /**
   * Opens the PDF in a new tab.
   * We open the tab SYNCHRONOUSLY (inside the user gesture) before any await,
   * then navigate it once the PDF blob is ready — browsers allow this pattern
   * without blocking it as a popup.
   */
  async function handleDownload() {
    // Must open synchronously before any await to avoid popup blockers
    const newTab = window.open('', '_blank');
    setBusy('download');
    try {
      const { doc } = await getBlob();
      const blobUrl = doc.output('bloburl');
      if (newTab) {
        newTab.location.href = blobUrl;
      } else {
        // Popup was blocked — fall back to same-tab navigation
        window.location.href = blobUrl;
      }
    } catch (e) {
      console.error(e);
      if (newTab) newTab.close();
    } finally { setBusy(''); }
  }

  /** Generates the PDF and opens the native share sheet, or opens in new tab as fallback. */
  async function handleShare() {
    setBusy('share');
    try {
      const { blob, filename, doc } = await getBlob();
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Invoice #${invoice.number}` });
      } else {
        const blobUrl = doc.output('bloburl');
        window.open(blobUrl, '_blank');
      }
    } catch (e) { if (e?.name !== 'AbortError') console.error(e); }
    finally { setBusy(''); }
  }

  /** Opens WhatsApp with a pre-filled invoice summary message. */
  function handleWhatsApp() {
    const lines = [
      `*Invoice #${invoice.number}*`,
      `${invoice.date}`,
      '',
      `*${invoice.businessName || ''}*`,
      `Bill To: ${invoice.storeName}`,
      '',
      ...invoice.items.map(i =>
        `${i.name}  ${i.qty} × $${Number(i.price).toFixed(2)} = *$${(i.qty * i.price).toFixed(2)}*`
      ),
      '',
      `*Total: $${subtotal.toFixed(2)}*`,
      ...(invoice.notes ? [`\nNotes: ${invoice.notes}`] : []),
    ].join('\n');
    window.open(buildWhatsAppUrl(invoice.storePhone, lines), '_blank');
  }

  /** Formats the invoice as plain text and copies it to the clipboard. */
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...s.page, background: C.bg }}>
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <button style={{ ...s.backBtn, color: ACCENT }} onClick={onBack}>← Back</button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ ...s.title, color: C.text }}>{getBusinessName() || DEFAULT_BUSINESS_NAME}</span>
          <span style={{ fontSize: 12, color: C.textMuted }}>Invoice #{invoice.number}</span>
        </div>
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

          {/* Payments summary — only shown once something has been paid */}
          {paid > 0 && (
            <>
              <div style={{ ...s.totalRow, paddingTop: 11, paddingBottom: 2, background: C.subtotalBar }}>
                <span style={{ ...s.metaLabel, color: C.subtotalText }}>Subtotal</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.subtotalText }}>${subtotal.toFixed(2)}</span>
              </div>
              <div style={{ ...s.totalRow, paddingTop: 2, paddingBottom: 2, background: C.subtotalBar }}>
                <span style={{ ...s.metaLabel, color: C.subtotalText }}>Paid</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.successText }}>-${paid.toFixed(2)}</span>
              </div>
            </>
          )}

          {/* Total */}
          <div style={{ ...s.totalRow, background: C.subtotalBar, ...(paid > 0 ? { paddingTop: 6 } : {}) }}>
            <span style={{ ...s.totalLabel, color: C.subtotalText }}>{paid > 0 ? 'Balance Due' : 'Total Due'}</span>
            <span style={{ ...s.totalAmt, color: C.subtotalText }}>${due.toFixed(2)}</span>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div style={{ ...s.notesBox, borderTopColor: C.divider }}>
              <span style={{ ...s.metaLabel, color: C.textMuted }}>Notes</span>
              <p style={{ ...s.notesText, color: C.textSub }}>{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Signatures — Proof of delivery */}
        <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showSigs ? 14 : 0 }}>
            <div>
              <p style={{ color: C.text, fontSize: 14, fontWeight: 700, margin: 0 }}>Signatures</p>
              <p style={{ color: C.textMuted, fontSize: 12, margin: '2px 0 0' }}>
                {sigSaved
                  ? <span style={{ color: C.successText }}>✓ Saved</span>
                  : sellerSig || buyerSig
                    ? 'Signed · saved to device · embedded in PDF'
                    : 'Proof of delivery · saved with invoice'}
              </p>
            </div>
            <button
              onClick={() => setShowSigs(v => !v)}
              style={{ background: showSigs ? C.divider : ACCENT, border: 'none', color: showSigs ? C.text : '#fff', fontWeight: 600, fontSize: 13, padding: '7px 14px', borderRadius: 10, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              {showSigs ? 'Hide' : (sellerSig || buyerSig) ? 'View' : 'Sign'}
            </button>
          </div>
          {showSigs && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SignaturePad
                label="Driver / Deliverer"
                dark={dark} C={C}
                initialDataUrl={sellerSig}
                onChange={setSellerSig}
              />
              <SignaturePad
                label="Store Manager — Proof of Delivery"
                dark={dark} C={C}
                initialDataUrl={buyerSig}
                onChange={setBuyerSig}
              />
              <p style={{ color: C.textLight, fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                Signatures are saved to this device and embedded in the PDF. Draw with your finger then tap Download PDF to include them.
              </p>
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
          style={{
            ...s.ghostBtn,
            background: '#25d366',
            color: '#fff',
            borderColor: '#25d366',
            fontWeight: 700,
            gap: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={handleWhatsApp}
        >
          Send via WhatsApp
        </button>

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
    padding: '14px 20px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    background: 'none', border: 'none', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', padding: '4px 0', WebkitTapHighlightColor: 'transparent',
  },
  title: { fontSize: 17, fontWeight: 700 },
  body: {
    padding: '14px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 12,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  card: {
    borderRadius: 18, border: '1px solid', overflow: 'hidden',
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
    width: '100%', height: 54,
    background: ACCENT, border: 'none', borderRadius: 16,
    fontSize: 16, fontWeight: 700, color: '#fff',
    cursor: 'pointer', boxShadow: '0 4px 20px rgba(74,123,247,0.35)',
    WebkitTapHighlightColor: 'transparent',
  },
  secondaryRow: { display: 'flex', gap: 10 },
  secondaryBtn: {
    flex: 1, height: 46, border: '1px solid',
    borderRadius: 14, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  ghostBtn: {
    width: '100%', height: 46, border: '1px solid',
    borderRadius: 14, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
};
