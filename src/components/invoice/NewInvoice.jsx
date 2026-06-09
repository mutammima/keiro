/**
 * NewInvoice — form screen for creating and saving a new delivery invoice.
 * All business logic lives in useInvoiceForm; this component is pure UI.
 */

import { useState } from 'react';
import AutofillInput from '../ui/AutofillInput';
import BarcodeScanner from '../ui/BarcodeScanner';
import InvoicePreview from './InvoicePreview';
import LiveInvoicePreview from './LiveInvoicePreview';
import EditItemModal from './EditItemModal';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../../theme';
import AppFooter from '../navigation/AppFooter';
import { useInvoiceForm } from '../../hooks/useInvoiceForm';
import { GuestCapModal } from '../auth/GuestUpsell';
import { isContactsSupported, pickContact } from '../../hooks/useContactImport';

/** Small red asterisk for required fields. */
const Req = () => <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>;

/** SVG camera icon for the barcode scan button. */
function CameraIcon({ color = '#555', size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

export default function NewInvoice({ onOpenDrawer, onGenerated, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  // ── Business logic (state + handlers) from hook ───────────────────────────
  const {
    businessName, setBusinessName,
    businessPhone, setBusinessPhone,
    editingBiz, setEditingBiz,
    editingBizPhone, setEditingBizPhone,
    handleBizBlur, handleBizPhoneBlur,
    storeName, customerName, setCustomerName,
    storePhone, setStorePhone,
    storeAddress, setStoreAddress,
    handleStoreNameChange,
    storeNames, pinnedStores,
    date, setDate, time, setTime, notes, setNotes,
    paymentMethod, setPaymentMethod,
    productName, setProductName,
    qty, setQty, price, setPrice,
    lastBarcode, productNames,
    handleScan, addItem,
    items, removeItem,
    editingItem, setEditingItem, handleEditSave,
    showScanner, setShowScanner,
    generating, error,
    handleGenerate,
    guestWall, setGuestWall,
  } = useInvoiceForm(onGenerated);

  // ── Contact import ────────────────────────────────────────────────────────
  const contactsSupported = isContactsSupported();
  const [importing, setImporting] = useState(false);
  const [importFlash, setImportFlash] = useState(''); // '' | 'success' | 'empty'

  async function handleImportContact() {
    setImporting(true);
    setImportFlash('');
    const contact = await pickContact();
    setImporting(false);

    if (!contact) return; // user cancelled

    const hasData = contact.name || contact.phone || contact.address;
    if (!hasData) { setImportFlash('empty'); setTimeout(() => setImportFlash(''), 3000); return; }

    // Fill fields — name → storeName (store in contacts) + customerName if empty
    if (contact.name) {
      handleStoreNameChange(contact.name);
      if (!customerName.trim()) setCustomerName(contact.name);
    }
    if (contact.phone)   setStorePhone(contact.phone);
    if (contact.address) setStoreAddress(contact.address);

    setImportFlash('success');
    setTimeout(() => setImportFlash(''), 3000);
  }

  // ── Derived style shorthand ────────────────────────────────────────────────
  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  // ── Enter key → focus next field ──────────────────────────────────────────
  // Finds all visible inputs inside the form and advances focus to the next one.
  // Also used as onKeyDown for AutofillInput children.
  function focusNext(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const form = document.querySelector('[data-tutorial="invoice-form"]');
    if (!form) return;
    const all = Array.from(
      form.querySelectorAll('input:not([disabled]):not([type="hidden"]), textarea:not([disabled])')
    );
    const idx = all.indexOf(e.target);
    if (idx >= 0 && idx < all.length - 1) {
      const next = all[idx + 1];
      next.focus();
      next.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  return (
    <>
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
      {editingItem && <EditItemModal item={editingItem} onSave={handleEditSave} onClose={() => setEditingItem(null)} />}
      <GuestCapModal open={guestWall} onClose={() => setGuestWall(false)} />

      <div data-tutorial="invoice-form" style={{ ...s.page, background: C.bg }}>
        {/* Header */}
        <div style={{ ...s.header, ...glassStyle(dark) }}>
          <div style={{ width: 36 }} />
          <div style={s.headerCenter}>
            {editingBiz ? (
              <input
                autoFocus
                data-tutorial="invoice-biz-name-input"
                style={{ ...s.bizNameInput, color: C.text, borderBottomColor: ACCENT }}
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                onBlur={e => handleBizBlur(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBizBlur(businessName)}
              />
            ) : (
              <button data-tutorial="invoice-biz-name-btn" style={{ ...s.bizNameBtn, color: C.text }} onClick={() => setEditingBiz(true)}>
                {businessName} <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 400 }}>✎</span>
              </button>
            )}
            {editingBizPhone ? (
              <input
                autoFocus
                data-tutorial="invoice-biz-phone-input"
                style={{ ...s.bizPhoneInput, color: C.textSub, borderBottomColor: ACCENT }}
                value={businessPhone}
                placeholder="Add phone number"
                inputMode="tel"
                onChange={e => setBusinessPhone(e.target.value)}
                onBlur={e => handleBizPhoneBlur(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBizPhoneBlur(businessPhone)}
              />
            ) : (
              <button data-tutorial="invoice-biz-phone-btn" style={{ ...s.bizPhoneBtn, color: C.textMuted }} onClick={() => setEditingBizPhone(true)}>
                {businessPhone || 'Add phone'} <span style={{ fontSize: 11 }}>✎</span>
              </button>
            )}
          </div>
          <div style={{ width: 36 }} />
        </div>

        <div style={s.body}>
          {/* Customer */}
          <div data-tutorial="invoice-store-name" className="card-enter-1" style={{ ...s.card, background: C.card, borderColor: C.cardBorder, boxShadow: C.cardShadow }}>
            {/* Customer header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ ...s.sectionLabel, color: C.textMuted, margin: 0 }}>Customer</p>
              {contactsSupported && (
                <button
                  type="button"
                  onClick={handleImportContact}
                  disabled={importing}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: importFlash === 'success'
                      ? (dark ? 'rgba(22,163,74,0.18)' : '#f0fdf4')
                      : importFlash === 'empty'
                        ? (dark ? 'rgba(239,68,68,0.15)' : '#fef2f2')
                        : C.rowBg,
                    color: importFlash === 'success'
                      ? '#16a34a'
                      : importFlash === 'empty'
                        ? '#ef4444'
                        : ACCENT,
                    border: `1.5px solid ${
                      importFlash === 'success' ? '#16a34a'
                      : importFlash === 'empty' ? '#ef4444'
                      : ACCENT
                    }`,
                    borderRadius: 10,
                    fontSize: 13, fontWeight: 700,
                    padding: '7px 13px',
                    cursor: importing ? 'default' : 'pointer',
                    opacity: importing ? 0.6 : 1,
                    transition: 'all 0.2s',
                    WebkitTapHighlightColor: 'transparent',
                    flexShrink: 0,
                  }}
                >
                  {importing
                    ? '…'
                    : importFlash === 'success'
                      ? '✓ Imported'
                      : importFlash === 'empty'
                        ? 'No data'
                        : 'Import Contact'}
                </button>
              )}
            </div>

            {/* Pinned store chips */}
            {pinnedStores.length > 0 && (
              <div style={s.pinnedRow}>
                <span style={{ ...s.pinnedLabel, color: C.textMuted }}>Pinned</span>
                <div style={s.chips}>
                  {pinnedStores.map(name => (
                    <button
                      key={name}
                      style={{
                        ...s.chip,
                        background: storeName === name ? ACCENT : C.rowBg,
                        color: storeName === name ? '#fff' : C.textSub,
                        borderColor: storeName === name ? ACCENT : C.cardBorder,
                      }}
                      onClick={() => handleStoreNameChange(name)}
                      type="button"
                    >
                      ★ {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <AutofillInput
              label={<>Store Name <Req /></>}
              placeholder="Sunrise Deli"
              value={storeName}
              onChange={handleStoreNameChange}
              suggestions={storeNames}
              required dark={dark}
              enterKeyHint="next"
              onKeyDown={focusNext}
            />
            <div style={{ marginTop: 12 }}>
              <label style={{ ...s.fieldLabel, color: C.textSub }}>Customer Name <Req /></label>
              <input style={{ ...s.input, ...inp }} placeholder="John Smith"
                enterKeyHint="next" onKeyDown={focusNext}
                value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div style={s.twoCol}>
              <div style={{ flex: 1 }}>
                <label style={{ ...s.fieldLabel, color: C.textSub }}>Phone</label>
                <input style={{ ...s.input, ...inp }} inputMode="tel" placeholder="(718) 555-0123"
                  enterKeyHint="next" onKeyDown={focusNext}
                  value={storePhone} onChange={e => setStorePhone(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ ...s.fieldLabel, color: C.textSub }}>Address</label>
              <input style={{ ...s.input, ...inp }} placeholder="123 Main St, Brooklyn, NY"
                enterKeyHint="next" onKeyDown={focusNext}
                value={storeAddress} onChange={e => setStoreAddress(e.target.value)} />
            </div>
          </div>

          {/* Invoice details */}
          <div className="card-enter-2" style={{ ...s.card, background: C.card, borderColor: C.cardBorder, boxShadow: C.cardShadow }}>
            <p style={{ ...s.sectionLabel, color: C.textMuted }}>Invoice Details</p>
            <div style={s.twoCol}>
              <div style={{ flex: 2 }}>
                <label style={{ ...s.fieldLabel, color: C.textSub }}>Date <Req /></label>
                <input style={{ ...s.input, ...inp }} value={date} onChange={e => setDate(e.target.value)}
                  enterKeyHint="next" onKeyDown={focusNext} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...s.fieldLabel, color: C.textSub }}>Time</label>
                <input style={{ ...s.input, ...inp }} value={time} onChange={e => setTime(e.target.value)}
                  enterKeyHint="next" onKeyDown={focusNext} />
              </div>
            </div>
          </div>

          {/* Add item */}
          <div data-tutorial="invoice-add-item" className="card-enter-3" style={{ ...s.card, background: C.card, borderColor: C.cardBorder, boxShadow: C.cardShadow }}>
            <p style={{ ...s.sectionLabel, color: C.textMuted }}>Add Item</p>
            <div style={s.productRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <AutofillInput label={<>Product Name <Req /></>} placeholder="GMan V Cut T-Shirt"
                  value={productName} onChange={setProductName} suggestions={productNames} required dark={dark}
                  enterKeyHint="next" onKeyDown={focusNext} />
              </div>
              <button style={{ ...s.scanBtn, background: C.inputBg, borderColor: C.inputBorder }}
                onClick={() => setShowScanner(true)} type="button">
                <CameraIcon color={dark ? '#ffffff' : '#555'} />
              </button>
            </div>
            {lastBarcode && (
              <p style={{ ...s.barcodeTag, background: C.tagBg, color: C.textMuted }}>
                Barcode: {lastBarcode}
              </p>
            )}
            <div style={s.twoCol}>
              <div style={{ flex: 1 }}>
                <label style={{ ...s.fieldLabel, color: C.textSub }}>Qty <Req /></label>
                <input style={{ ...s.input, ...inp }} inputMode="numeric" type="number" min="1" step="1"
                  placeholder="1" value={qty} onChange={e => setQty(e.target.value.replace(/[^0-9]/g, ''))}
                  enterKeyHint="next" onKeyDown={focusNext} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...s.fieldLabel, color: C.textSub }}>Unit Price ($) <Req /></label>
                <input style={{ ...s.input, ...inp }} inputMode="decimal" type="number" min="0" step="0.01"
                  placeholder="0.00" value={price} onChange={e => setPrice(e.target.value)}
                  enterKeyHint="done" onKeyDown={focusNext} />
              </div>
            </div>
            {/* Live line total */}
            {qty > 0 && price >= 0 && !isNaN(qty) && !isNaN(price) && Number(qty) > 0 && price !== '' && (
              <div style={{ ...s.lineTotal, background: C.rowBg }}>
                <span style={{ color: C.textMuted, fontSize: 13 }}>
                  {qty} × ${Number(price).toFixed(2)}
                </span>
                <span style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>
                  = ${(Number(qty) * Number(price)).toFixed(2)}
                </span>
              </div>
            )}
            {error && <p style={{ ...s.error, color: C.danger }}>{error}</p>}
            <button style={{ ...s.addItemBtn, background: C.rowBg, color: C.textSub }} onClick={addItem} type="button">
              + Add Item
            </button>
          </div>

          {/* Items list */}
          <div className="card-enter-4" style={{ ...s.card, background: C.card, borderColor: C.cardBorder, boxShadow: C.cardShadow }}>
            <InvoicePreview items={items} onRemove={removeItem} onEdit={setEditingItem} dark={dark} />
          </div>

          {/* Notes + Payment Method */}
          <div className="card-enter-5" style={{ ...s.card, background: C.card, borderColor: C.cardBorder, boxShadow: C.cardShadow }}>
            {/* Cash / Card toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ ...s.sectionLabel, color: C.textMuted, margin: 0 }}>Payment Method</p>
              <div style={{ display: 'flex', background: C.rowBg, borderRadius: 10, padding: 3, gap: 3 }}>
                {['cash', 'card'].map(m => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    style={{
                      height: 30, padding: '0 16px', borderRadius: 8, border: 'none',
                      background: paymentMethod === m ? ACCENT : 'transparent',
                      color: paymentMethod === m ? '#fff' : C.textMuted,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    {m === 'cash' ? 'Cash' : 'Card'}
                  </button>
                ))}
              </div>
            </div>
            <p style={{ ...s.sectionLabel, color: C.textMuted }}>Notes</p>
            <textarea
              style={{ ...s.textarea, background: C.inputBg, borderColor: C.inputBorder, color: C.text }}
              placeholder="Leave with manager, fragile items…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <button
            data-tutorial="invoice-generate"
            style={{ ...s.generateBtn, opacity: generating ? 0.7 : 1 }}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Saving…' : 'Generate Invoice'}
          </button>

          {/* ── Live preview ─────────────────────────────────────────────── */}
          <div style={{ margin: '8px -16px 0' }}>
            <div style={{ height: 1, background: C.divider, margin: '0 16px 16px' }} />
            <LiveInvoicePreview
              businessName={businessName}
              businessPhone={businessPhone}
              storeName={storeName}
              storePhone={storePhone}
              storeAddress={storeAddress}
              customerName={customerName}
              date={date}
              time={time}
              items={items}
              notes={notes}
              paymentMethod={paymentMethod}
            />
          </div>

          <AppFooter onNav={onNav} />
        </div>
      </div>
    </>
  );
}

const s = {
  page: { minHeight: "100%", display: "flex", flexDirection: "column", overflowX: "hidden" },
  header: {
    padding: '12px 16px 10px',
    paddingTop: 'max(12px, env(safe-area-inset-top))',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', padding: '3px 4px', marginTop: 1,
    WebkitTapHighlightColor: 'transparent', flexShrink: 0,
  },
  headerCenter: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
  },
  bizNameBtn: {
    background: 'none', border: 'none', padding: '2px 4px',
    cursor: 'pointer', fontSize: 17, fontWeight: 700,
    letterSpacing: 1.2, textTransform: 'uppercase',
    WebkitTapHighlightColor: 'transparent',
    display: 'flex', alignItems: 'center', gap: 5,
  },
  bizNameInput: {
    fontSize: 17, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
    border: 'none', borderBottom: '1.5px solid', outline: 'none',
    textAlign: 'center', background: 'transparent', maxWidth: 260, padding: '1px 4px',
  },
  bizPhoneBtn: {
    background: 'none', border: 'none', padding: '1px 4px',
    cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3,
    WebkitTapHighlightColor: 'transparent',
  },
  bizPhoneInput: {
    fontSize: 12, border: 'none', borderBottom: '1px solid',
    outline: 'none', textAlign: 'center', background: 'transparent', maxWidth: 190, padding: '1px 4px',
  },
  body: {
    padding: '14px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 12,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  card: {
    borderRadius: 18, padding: '18px',
    border: '1px solid',
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', margin: '0 0 14px',
  },
  fieldLabel: {
    display: 'block', fontSize: 13, fontWeight: 500,
    marginBottom: 6, color: '#888888',
  },
  input: {
    width: '100%', boxSizing: 'border-box', height: 46,
    fontSize: 15, padding: '0 14px',
    border: '1px solid', borderRadius: 12,
    outline: 'none', WebkitAppearance: 'none', appearance: 'none',
  },
  textarea: {
    width: '100%', boxSizing: 'border-box',
    fontSize: 15, padding: '12px 14px',
    border: '1px solid', borderRadius: 12,
    outline: 'none', lineHeight: 1.5,
  },
  twoCol: { display: 'flex', gap: 10, marginTop: 12 },
  lineTotal: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 10, padding: '10px 14px', marginTop: 8,
  },
  productRow: { display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10 },
  scanBtn: {
    flexShrink: 0, width: 46, height: 46,
    border: '1px solid', borderRadius: 12,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, WebkitTapHighlightColor: 'transparent',
  },
  barcodeTag: {
    fontSize: 12, padding: '3px 8px', borderRadius: 6,
    margin: '-4px 0 8px', fontFamily: 'monospace',
  },
  error: { fontSize: 13, margin: '8px 0 0', fontWeight: 600 },
  addItemBtn: {
    width: '100%', marginTop: 12, height: 46,
    border: 'none', borderRadius: 12,
    fontSize: 14, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  pinnedRow: { marginBottom: 12 },
  pinnedLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', display: 'block', marginBottom: 8, color: '#888888',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 7 },
  chip: {
    height: 34, padding: '0 14px',
    border: 'none', borderRadius: 20,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    background: '#1e1e1e', color: '#d1d1d1',
  },
  generateBtn: {
    width: '100%', height: 54,
    background: ACCENT, border: 'none', borderRadius: 16,
    fontSize: 16, fontWeight: 700, color: '#fff',
    cursor: 'pointer', letterSpacing: 0.3,
    boxShadow: '0 4px 20px rgba(74,123,247,0.35)',
    WebkitTapHighlightColor: 'transparent',
  },
};
