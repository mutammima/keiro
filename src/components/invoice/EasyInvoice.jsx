/**
 * EasyInvoice — the Easy Mode invoice (docs/specs/2026-10-14-easy-mode-design.md §1).
 *
 * Pick a store (optional — left blank it prints as a line to write on), tap
 * Scan item, check the item on a card, Add, and the camera reopens for the
 * next one. Built on useInvoiceForm({ easy: true }), so numbering, saving, the
 * guest cap, the $0 guard and edit/duplicate prefill behave exactly as on the
 * normal screen.
 */
import { useState, lazy, Suspense } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import { useInvoiceForm } from '../../hooks/useInvoiceForm';
import { usePlan } from '../../hooks/usePlan';
import { onFreePlan, freeInvoicesLeft, openUpgrade } from '../../utils/plan';
import { PLAN_COPY, FREE_WARN_AT_LEFT } from '../../utils/constants';
import AutofillInput from '../ui/AutofillInput';
import { GuestCapModal } from '../auth/GuestUpsell';
import ScanCheckCard from './ScanCheckCard';
import ZeroTotalConfirm from './ZeroTotalConfirm';
import ConfirmDialog from '../ui/ConfirmDialog';

// Lazy-loaded so html5-qrcode is only fetched when the camera first opens.
const BarcodeScanner = lazy(() => import('../ui/BarcodeScanner'));

export default function EasyInvoice({ onGenerated, onBack }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const form = useInvoiceForm(onGenerated, { easy: true });
  const [scanning, setScanning] = useState(false);
  // Where the open check card came from: null (closed) | 'scan' | 'manual' | 'line'.
  // Only a scan's card sends the driver back to the camera.
  const [cardFrom, setCardFrom] = useState(null);
  // ← with lines on the invoice asks first; a scan loop builds long lists.
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const total = form.items.reduce((sum, i) => sum + Number(i.qty) * Number(i.price), 0);
  usePlan(); // re-render when this month's count changes
  const left = onFreePlan() ? freeInvoicesLeft() : null;

  async function onScanned(text, format) {
    setScanning(false);
    setCardFrom('scan');
    await form.handleScan(text, format);
  }
  function closeCard() {
    const reopenCamera = cardFrom === 'scan';
    setCardFrom(null);
    if (reopenCamera) setScanning(true);
  }
  function add() {
    if (form.addItem()) closeCard();
  }
  function cancel() {
    form.clearAddForm();
    closeCard();
  }
  function remove() {
    form.removeItem(form.replaceLineId);
    form.clearAddForm();
    setCardFrom(null);
  }
  function addWithoutScanning() {
    form.clearAddForm();
    setCardFrom('manual');
  }
  function back() {
    if (form.items.length > 0) setConfirmDiscard(true);
    else onBack();
  }
  function openLine(item) {
    form.loadItemIntoForm(item);
    setCardFrom('line');
  }

  return (
    <>
      {scanning && (
        <Suspense fallback={null}>
          <BarcodeScanner onScan={onScanned} onClose={() => setScanning(false)} closeLabel="Done" />
        </Suspense>
      )}
      {cardFrom && <ScanCheckCard form={form} onAdd={add} onCancel={cancel} onRemove={remove} />}
      <GuestCapModal open={form.guestWall} onClose={() => form.setGuestWall(false)} />
      <ZeroTotalConfirm open={form.zeroConfirm} onCancel={() => form.setZeroConfirm(false)} onConfirm={form.confirmZeroTotal} />
      <ConfirmDialog
        open={confirmDiscard} danger
        title={form.editNumber != null ? 'Discard your changes?' : 'Discard this invoice?'}
        cancelLabel="Keep it" confirmLabel="Discard"
        onCancel={() => setConfirmDiscard(false)} onConfirm={() => { setConfirmDiscard(false); onBack(); }}
      >
        {form.items.length === 1 ? 'The item you added will be lost.' : `The ${form.items.length} items you added will be lost.`}
      </ConfirmDialog>

      <div data-tutorial="easy-invoice" style={{ ...s.page, background: C.bg }}>
        <div style={{ ...s.header, ...glassStyle(dark) }}>
          <button onClick={back} aria-label="Back" style={{ ...s.back, color: C.text }}>←</button>
          <span style={{ ...s.title, color: C.text }}>
            {form.editNumber != null ? `Edit invoice #${form.editNumber}` : 'New invoice'}
          </span>
          <div style={{ width: 36 }} />
        </div>

        <div style={s.body}>
          <div data-qs="easy-store" style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
            <AutofillInput
              label="Store (optional)" placeholder="Start typing a store"
              value={form.storeName} onChange={form.handleStoreNameChange}
              suggestions={form.storeNames} dark={dark}
            />
            {form.recentStores.length > 0 && (
              <div style={s.chips}>
                {form.recentStores.map(name => (
                  <button key={name} type="button" onClick={() => form.handleStoreNameChange(name)}
                    style={{ ...s.chip, background: C.inputBg, borderColor: C.inputBorder, color: C.text }}>
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button data-qs="easy-scan" type="button" onClick={() => setScanning(true)} style={{ ...s.scanBtn, background: ACCENT }}>
            Scan item
          </button>

          <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder }}>
            {form.items.length === 0 ? (
              <p style={{ ...s.empty, color: C.textMuted }}>No items yet. Scan one to start.</p>
            ) : form.items.map(item => (
              <button key={item.id} type="button" onClick={() => openLine(item)} style={{ ...s.line, borderBottomColor: C.divider, color: C.text }}>
                <span style={s.lineName}>{item.name}</span>
                <span style={{ ...s.lineQty, color: C.textSub }}>{item.qty} × {Number(item.price).toFixed(2)}</span>
                <span style={s.lineTotal}>{(Number(item.qty) * Number(item.price)).toFixed(2)}</span>
              </button>
            ))}
            <button type="button" onClick={addWithoutScanning} style={{ ...s.addManual, color: ACCENT }}>
              + Add without scanning
            </button>
            <div style={{ ...s.totalRow, color: C.text }}>
              <span>TOTAL</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          {form.error && !cardFrom && <p style={{ ...s.error, color: C.danger }}>{form.error}</p>}

          {left !== null && left > 0 && left <= FREE_WARN_AT_LEFT && (
            <p style={{ ...s.leftLine, color: C.textMuted }}>
              <span>{PLAN_COPY.leftLine(left)}</span>{' · '}
              <button type="button" onClick={() => openUpgrade()} style={{ ...s.leftLink, color: ACCENT }}>{PLAN_COPY.upgrade}</button>
            </p>
          )}

          <button data-qs="easy-make" type="button" onClick={form.handleGenerate} disabled={form.generating}
            style={{ ...s.makeBtn, background: ACCENT, opacity: form.generating ? 0.7 : 1 }}>
            {form.generating ? 'Saving…' : 'Make invoice'}
          </button>
        </div>
      </div>
    </>
  );
}

const s = {
  page:      { minHeight: '100%', display: 'flex', flexDirection: 'column', overflowX: 'clip' },
  header:    { padding: '12px 16px 10px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 5 },
  back:      { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: '3px 4px', width: 36, WebkitTapHighlightColor: 'transparent' },
  title:     { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 700 },
  body:      { padding: '14px 16px 88px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 'var(--form-max)', width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  card:      { borderRadius: 18, padding: 18, border: '1px solid' },
  chips:     { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip:      { border: '1px solid', borderRadius: 999, padding: '8px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  scanBtn:   { height: 64, borderRadius: 18, border: 'none', color: '#fff', fontSize: 19, fontWeight: 800, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  empty:     { fontSize: 14, margin: '0 0 8px', textAlign: 'center' },
  line:      { width: '100%', display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 0', background: 'none', border: 'none', borderBottom: '1px solid', textAlign: 'left', cursor: 'pointer', fontSize: 15 },
  lineName:  { flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' },
  lineQty:   { fontSize: 13, whiteSpace: 'nowrap' },
  lineTotal: { fontWeight: 700, whiteSpace: 'nowrap', minWidth: 64, textAlign: 'right' },
  addManual: { background: 'none', border: 'none', padding: '12px 0 4px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  totalRow:  { display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 800, paddingTop: 10 },
  error:     { fontSize: 13, fontWeight: 600, margin: 0 },
  leftLine:  { margin: '0 0 -4px', fontSize: 13, textAlign: 'center' },
  // A 13px link with a ≥44px hit box. The padding is cancelled by the negative margin, so the line looks the same;
  // it grows upward, because Make invoice sits 8px below the line and would take any taps that spilled onto it.
  leftLink:  { background: 'none', border: 'none', padding: '22px 10px 8px', margin: '-22px -10px -8px', fontSize: 13, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  makeBtn:   { height: 56, borderRadius: 16, border: 'none', color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
};
