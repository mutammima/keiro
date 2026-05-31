import { useState, useCallback } from 'react';
import AutofillInput from './AutofillInput';
import BarcodeScanner from './BarcodeScanner';
import InvoicePreview from './InvoicePreview';
import EditItemModal from './EditItemModal';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';
import AppFooter from './AppFooter';
import {
  getNextInvoiceNumber,
  saveInvoice,
  getProductByBarcode,
  saveProductBarcode,
  saveStoreName,
  saveProductName,
  getStoreNames,
  getProductNames,
  getBusinessName,
  saveBusinessName,
  getBusinessPhone,
  saveBusinessPhone,
  getStorePhone,
  saveStorePhone,
  getStoreAddress,
  saveStoreAddress,
  getPinnedStores,
} from '../utils/storage';

function todayString() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
function nowTimeString() {
  const d = new Date();
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function NewInvoice({ onOpenDrawer, onGenerated }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [businessName, setBusinessName]       = useState(() => getBusinessName() || 'J&Y Distributions');
  const [businessPhone, setBusinessPhone]     = useState(() => getBusinessPhone() || '');
  const [editingBiz, setEditingBiz]           = useState(false);
  const [editingBizPhone, setEditingBizPhone] = useState(false);

  const [storeName, setStoreName]       = useState('');
  const [storePhone, setStorePhone]     = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [date, setDate]                 = useState(todayString());
  const [time, setTime]                 = useState(nowTimeString());
  const [notes, setNotes]               = useState('');
  const [storeNames]    = useState(() => getStoreNames());
  const [productNames]  = useState(() => getProductNames());
  const [pinnedStores]  = useState(() => getPinnedStores());

  const [productName, setProductName] = useState('');
  const [qty, setQty]                 = useState('');
  const [price, setPrice]             = useState('');
  const [lastBarcode, setLastBarcode] = useState('');
  const [items, setItems]             = useState([]);
  const [editingItem, setEditingItem] = useState(null);

  const [showScanner, setShowScanner] = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [error, setError]             = useState('');

  function handleBizBlur(val) {
    const t = (val || businessName).trim();
    if (t) { setBusinessName(t); saveBusinessName(t); }
    setEditingBiz(false);
  }
  function handleBizPhoneBlur(val) {
    const t = (val || businessPhone).trim();
    setBusinessPhone(t); saveBusinessPhone(t); setEditingBizPhone(false);
  }

  function handleStoreNameChange(val) {
    setStoreName(val);
    const p = getStorePhone(val);
    const a = getStoreAddress(val);
    if (p) setStorePhone(p);
    if (a) setStoreAddress(a);
  }

  const handleScan = useCallback((barcode) => {
    setLastBarcode(barcode);
    const product = getProductByBarcode(barcode);
    if (product) { setProductName(product.name); setPrice(String(product.lastPrice)); }
    else { setProductName(''); setPrice(''); }
  }, []);

  function addItem() {
    setError('');
    if (!productName.trim()) return setError('Enter a product name.');
    const qtyNum = Number(qty), priceNum = Number(price);
    if (!qty || isNaN(qtyNum) || qtyNum <= 0) return setError('Enter a valid quantity.');
    if (price === '' || isNaN(priceNum) || priceNum < 0) return setError('Enter a valid price.');

    saveProductName(productName.trim());
    if (lastBarcode) {
      saveProductBarcode(lastBarcode, productName.trim(), priceNum);
    } else {
      const key = 'manual_' + productName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      saveProductBarcode(key, productName.trim(), priceNum);
    }

    setItems(prev => [...prev, { id: uid(), name: productName.trim(), qty: qtyNum, price: priceNum }]);
    setProductName(''); setQty(''); setPrice(''); setLastBarcode('');
  }

  function removeItem(id) { setItems(prev => prev.filter(i => i.id !== id)); }
  function handleEditSave(updated) { setItems(prev => prev.map(i => i.id === updated.id ? updated : i)); setEditingItem(null); }

  async function handleGenerate() {
    setError('');
    if (!storeName.trim()) return setError('Enter a store name.');
    if (items.length === 0) return setError('Add at least one item.');

    setGenerating(true);
    try {
      const invoiceNumber = getNextInvoiceNumber();
      const invoice = {
        businessName: businessName.trim(),
        businessPhone: businessPhone.trim(),
        number: invoiceNumber,
        storeName: storeName.trim(),
        storePhone: storePhone.trim(),
        storeAddress: storeAddress.trim(),
        date, time, items,
        notes: notes.trim(),
        paymentStatus: 'unpaid',
        createdAt: new Date().toISOString(),
      };

      saveInvoice(invoice);
      saveStoreName(storeName.trim());
      if (storePhone.trim()) saveStorePhone(storeName.trim(), storePhone.trim());
      if (storeAddress.trim()) saveStoreAddress(storeName.trim(), storeAddress.trim());

      setItems([]); setStoreName(''); setStorePhone(''); setStoreAddress('');
      setDate(todayString()); setTime(nowTimeString()); setNotes('');
      onGenerated(invoice);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  const inp = { background: C.inputBg, borderColor: C.inputBorder, color: C.text };

  return (
    <>
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
      {editingItem && <EditItemModal item={editingItem} onSave={handleEditSave} onClose={() => setEditingItem(null)} />}

      <div style={{ ...s.page, background: C.bg }}>
        {/* Header */}
        <div style={{ ...s.header, ...glassStyle(dark) }}>
          <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer}>☰</button>
          <div style={s.headerCenter}>
            {editingBiz ? (
              <input
                autoFocus
                style={{ ...s.bizNameInput, color: C.text, borderBottomColor: ACCENT }}
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                onBlur={e => handleBizBlur(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBizBlur(businessName)}
              />
            ) : (
              <button style={{ ...s.bizNameBtn, color: C.text }} onClick={() => setEditingBiz(true)}>
                {businessName} <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 400 }}>✎</span>
              </button>
            )}
            {editingBizPhone ? (
              <input
                autoFocus
                style={{ ...s.bizPhoneInput, color: C.textSub, borderBottomColor: ACCENT }}
                value={businessPhone}
                placeholder="Add phone number"
                inputMode="tel"
                onChange={e => setBusinessPhone(e.target.value)}
                onBlur={e => handleBizPhoneBlur(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBizPhoneBlur(businessPhone)}
              />
            ) : (
              <button style={{ ...s.bizPhoneBtn, color: C.textMuted }} onClick={() => setEditingBizPhone(true)}>
                {businessPhone || 'Add phone'} <span style={{ fontSize: 11 }}>✎</span>
              </button>
            )}
          </div>
          <div style={{ width: 36 }} />
        </div>

        <div style={s.body}>
          {/* Customer */}
          <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder, boxShadow: C.cardShadow }}>
            <p style={{ ...s.sectionLabel, color: C.textMuted }}>Customer</p>

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
              label="Store / Customer Name"
              placeholder="e.g. Sunrise Deli"
              value={storeName}
              onChange={handleStoreNameChange}
              suggestions={storeNames}
              required dark={dark}
            />
            <div style={s.twoCol}>
              <div style={{ flex: 1 }}>
                <label style={{ ...s.fieldLabel, color: C.textSub }}>Phone</label>
                <input style={{ ...s.input, ...inp }} inputMode="tel" placeholder="(718) 555-0123"
                  value={storePhone} onChange={e => setStorePhone(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ ...s.fieldLabel, color: C.textSub }}>Address (optional)</label>
              <input style={{ ...s.input, ...inp }} placeholder="123 Main St, Brooklyn, NY"
                value={storeAddress} onChange={e => setStoreAddress(e.target.value)} />
            </div>
          </div>

          {/* Invoice details */}
          <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder, boxShadow: C.cardShadow }}>
            <p style={{ ...s.sectionLabel, color: C.textMuted }}>Invoice Details</p>
            <div style={s.twoCol}>
              <div style={{ flex: 2 }}>
                <label style={{ ...s.fieldLabel, color: C.textSub }}>Date</label>
                <input style={{ ...s.input, ...inp }} value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...s.fieldLabel, color: C.textSub }}>Time</label>
                <input style={{ ...s.input, ...inp }} value={time} onChange={e => setTime(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Add item */}
          <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder, boxShadow: C.cardShadow }}>
            <p style={{ ...s.sectionLabel, color: C.textMuted }}>Add Item</p>
            <div style={s.productRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <AutofillInput label="Product Name" placeholder="e.g. Marlboro Reds"
                  value={productName} onChange={setProductName} suggestions={productNames} required dark={dark} />
              </div>
              <button style={{ ...s.scanBtn, background: C.inputBg, borderColor: C.inputBorder }}
                onClick={() => setShowScanner(true)} type="button">
                📷
              </button>
            </div>
            {lastBarcode && (
              <p style={{ ...s.barcodeTag, background: C.tagBg, color: C.textMuted }}>
                Barcode: {lastBarcode}
              </p>
            )}
            <div style={s.twoCol}>
              <div style={{ flex: 1 }}>
                <label style={{ ...s.fieldLabel, color: C.textSub }}>Qty</label>
                <input style={{ ...s.input, ...inp }} inputMode="decimal" type="number" min="0" step="1"
                  placeholder="1" value={qty} onChange={e => setQty(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...s.fieldLabel, color: C.textSub }}>Unit Price ($)</label>
                <input style={{ ...s.input, ...inp }} inputMode="decimal" type="number" min="0" step="0.01"
                  placeholder="0.00" value={price} onChange={e => setPrice(e.target.value)} />
              </div>
            </div>
            {error && <p style={{ ...s.error, color: C.danger }}>{error}</p>}
            <button style={{ ...s.addItemBtn, background: C.rowBg, color: C.textSub }} onClick={addItem} type="button">
              + Add Item
            </button>
          </div>

          {/* Items list */}
          <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder, boxShadow: C.cardShadow }}>
            <InvoicePreview items={items} onRemove={removeItem} onEdit={setEditingItem} dark={dark} />
          </div>

          {/* Notes */}
          <div style={{ ...s.card, background: C.card, borderColor: C.cardBorder, boxShadow: C.cardShadow }}>
            <p style={{ ...s.sectionLabel, color: C.textMuted }}>Notes</p>
            <textarea
              style={{ ...s.textarea, background: C.inputBg, borderColor: C.inputBorder, color: C.text }}
              placeholder="e.g. Cash on delivery, leave with manager…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <button
            style={{ ...s.generateBtn, opacity: generating ? 0.7 : 1 }}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Saving…' : 'Generate Invoice'}
          </button>
          <AppFooter />
        </div>
      </div>
    </>
  );
}

const s = {
  page: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' },
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
    padding: '16px 16px 48px',
    display: 'flex', flexDirection: 'column', gap: 12,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  card: {
    borderRadius: 12, padding: '16px',
    border: '1px solid',
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', margin: '0 0 12px',
  },
  fieldLabel: {
    display: 'block', fontSize: 13, fontWeight: 500,
    marginBottom: 5, letterSpacing: 0.1,
  },
  input: {
    width: '100%', boxSizing: 'border-box', height: 44,
    fontSize: 15, padding: '0 12px',
    border: '1px solid', borderRadius: 8,
    outline: 'none', WebkitAppearance: 'none', appearance: 'none',
  },
  textarea: {
    width: '100%', boxSizing: 'border-box',
    fontSize: 15, padding: '10px 12px',
    border: '1px solid', borderRadius: 8,
    outline: 'none', lineHeight: 1.5,
  },
  twoCol: { display: 'flex', gap: 10, marginTop: 12 },
  productRow: { display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10 },
  scanBtn: {
    flexShrink: 0, width: 44, height: 44,
    border: '1px solid', borderRadius: 8,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, WebkitTapHighlightColor: 'transparent',
  },
  barcodeTag: {
    fontSize: 12, padding: '3px 8px', borderRadius: 5,
    margin: '-4px 0 8px', fontFamily: 'monospace',
  },
  error: { fontSize: 13, margin: '8px 0 0', fontWeight: 600 },
  addItemBtn: {
    width: '100%', marginTop: 12, height: 44,
    border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 600,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  pinnedRow: { marginBottom: 12 },
  pinnedLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', display: 'block', marginBottom: 6,
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    height: 32, padding: '0 12px',
    border: '1px solid', borderRadius: 20,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  generateBtn: {
    width: '100%', height: 52,
    background: ACCENT, border: 'none', borderRadius: 10,
    fontSize: 16, fontWeight: 700, color: '#fff',
    cursor: 'pointer', letterSpacing: 0.2,
    boxShadow: '0 2px 12px rgba(26,115,232,0.3)',
    WebkitTapHighlightColor: 'transparent',
  },
};
