import { useState, useCallback } from 'react';
import AutofillInput from './AutofillInput';
import BarcodeScanner from './BarcodeScanner';
import InvoicePreview from './InvoicePreview';
import EditItemModal from './EditItemModal';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';
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

  // Business identity
  const [businessName, setBusinessName]       = useState(() => getBusinessName() || 'J&Y Distributions');
  const [businessPhone, setBusinessPhone]     = useState(() => getBusinessPhone() || '');
  const [editingBiz, setEditingBiz]           = useState(false);
  const [editingBizPhone, setEditingBizPhone] = useState(false);

  // Invoice metadata
  const [storeName, setStoreName]   = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [date, setDate]             = useState(todayString());
  const [time, setTime]             = useState(nowTimeString());
  const [storeNames]   = useState(() => getStoreNames());
  const [productNames] = useState(() => getProductNames());

  // Current item being built
  const [productName, setProductName] = useState('');
  const [qty, setQty]                 = useState('');
  const [price, setPrice]             = useState('');
  const [lastBarcode, setLastBarcode] = useState('');

  // Items on the invoice
  const [items, setItems] = useState([]);

  // Edit modal
  const [editingItem, setEditingItem] = useState(null);

  // UI state
  const [showScanner, setShowScanner] = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [error, setError]             = useState('');

  // ── Business name / phone ────────────────────────────────────────────────
  function handleBizBlur(val) {
    const trimmed = (val || businessName).trim();
    if (trimmed) { setBusinessName(trimmed); saveBusinessName(trimmed); }
    setEditingBiz(false);
  }
  function handleBizPhoneBlur(val) {
    const trimmed = (val || businessPhone).trim();
    setBusinessPhone(trimmed);
    saveBusinessPhone(trimmed);
    setEditingBizPhone(false);
  }

  // ── Store name change → auto-load phone ─────────────────────────────────
  function handleStoreNameChange(val) {
    setStoreName(val);
    const saved = getStorePhone(val);
    if (saved) setStorePhone(saved);
  }

  // ── Barcode scanned ──────────────────────────────────────────────────────
  const handleScan = useCallback((barcode) => {
    setLastBarcode(barcode);
    const product = getProductByBarcode(barcode);
    if (product) {
      setProductName(product.name);
      setPrice(String(product.lastPrice));
    } else {
      setProductName('');
      setPrice('');
    }
  }, []);

  // ── Add item ─────────────────────────────────────────────────────────────
  function addItem() {
    setError('');
    if (!productName.trim()) return setError('Enter a product name.');
    const qtyNum   = Number(qty);
    const priceNum = Number(price);
    if (!qty   || isNaN(qtyNum)   || qtyNum   <= 0) return setError('Enter a valid quantity.');
    if (price  === '' || isNaN(priceNum) || priceNum < 0) return setError('Enter a valid price.');

    saveProductName(productName.trim());
    if (lastBarcode) {
      saveProductBarcode(lastBarcode, productName.trim(), priceNum);
    } else {
      // Save to catalog with stable name-based key so it appears in the Products tab
      const stableKey = 'manual_' + productName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      saveProductBarcode(stableKey, productName.trim(), priceNum);
    }

    setItems(prev => [...prev, { id: uid(), name: productName.trim(), qty: qtyNum, price: priceNum }]);
    setProductName(''); setQty(''); setPrice(''); setLastBarcode('');
  }

  function removeItem(id) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function handleEditSave(updated) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    setEditingItem(null);
  }

  // ── Generate invoice → navigate to InvoiceView ───────────────────────────
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
        date,
        time,
        items,
        createdAt: new Date().toISOString(),
      };

      saveInvoice(invoice);
      saveStoreName(storeName.trim());
      if (storePhone.trim()) saveStorePhone(storeName.trim(), storePhone.trim());

      // Reset form
      setItems([]); setStoreName(''); setStorePhone('');
      setDate(todayString()); setTime(nowTimeString());

      onGenerated(invoice);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {showScanner && (
        <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onSave={handleEditSave}
          onClose={() => setEditingItem(null)}
        />
      )}

      <div style={{ ...styles.page, background: C.bg }}>
        {/* ── Header ── */}
        <div style={{ ...styles.header, background: C.header, borderBottomColor: C.headerBorder }}>
          <button style={{ ...styles.hamburger, color: C.text }} onClick={onOpenDrawer} aria-label="Open menu">
            ☰
          </button>

          <div style={styles.headerCenter}>
            {editingBiz ? (
              <input
                autoFocus
                style={{ ...styles.bizNameInput, borderBottomColor: ACCENT, color: C.text, background: 'transparent' }}
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                onBlur={e => handleBizBlur(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBizBlur(businessName)}
              />
            ) : (
              <button style={{ ...styles.bizNameBtn, color: C.text }} onClick={() => setEditingBiz(true)}>
                {businessName}<span style={styles.editPencil}>✎</span>
              </button>
            )}

            {editingBizPhone ? (
              <input
                autoFocus
                style={{ ...styles.bizPhoneInput, borderBottomColor: ACCENT, color: C.textSub, background: 'transparent' }}
                value={businessPhone}
                placeholder="Your phone number"
                inputMode="tel"
                onChange={e => setBusinessPhone(e.target.value)}
                onBlur={e => handleBizPhoneBlur(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBizPhoneBlur(businessPhone)}
              />
            ) : (
              <button style={{ ...styles.bizPhoneBtn, color: C.textMuted }} onClick={() => setEditingBizPhone(true)}>
                {businessPhone || '+ Add phone number'}
                <span style={styles.editPencil}>✎</span>
              </button>
            )}

            <span style={{ ...styles.headerSub, color: C.textMuted }}>New Invoice</span>
          </div>
        </div>

        <div style={styles.body}>
          {/* ── Invoice Meta ── */}
          <section style={{ ...styles.card, background: C.card }}>
            <AutofillInput
              label="Store / Customer Name"
              placeholder="e.g. Sunrise Deli"
              value={storeName}
              onChange={handleStoreNameChange}
              suggestions={storeNames}
              required
              dark={dark}
            />
            <div style={{ marginTop: 14 }}>
              <label style={{ ...styles.label, color: C.textSub }}>Store Phone (optional)</label>
              <input
                style={{ ...styles.input, background: C.inputBg, borderColor: C.inputBorder, color: C.text }}
                inputMode="tel"
                placeholder="e.g. (718) 555-0123"
                value={storePhone}
                onChange={e => setStorePhone(e.target.value)}
              />
            </div>
            <div style={styles.dateTimeRow}>
              <div style={{ flex: 2 }}>
                <label style={{ ...styles.label, color: C.textSub }}>Date</label>
                <input style={{ ...styles.input, background: C.inputBg, borderColor: C.inputBorder, color: C.text }} value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...styles.label, color: C.textSub }}>Time</label>
                <input style={{ ...styles.input, background: C.inputBg, borderColor: C.inputBorder, color: C.text }} value={time} onChange={e => setTime(e.target.value)} />
              </div>
            </div>
          </section>

          {/* ── Add Item ── */}
          <section style={{ ...styles.card, background: C.card }}>
            <p style={{ ...styles.sectionTitle, color: C.textSub }}>Add Item</p>

            <div style={styles.productRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <AutofillInput
                  label="Product Name"
                  placeholder="e.g. Marlboro Reds"
                  value={productName}
                  onChange={setProductName}
                  suggestions={productNames}
                  required
                  dark={dark}
                />
              </div>
              <button
                style={{ ...styles.scanBtn, background: C.inputBg, borderColor: C.inputBorder }}
                onClick={() => setShowScanner(true)}
                aria-label="Scan barcode"
                type="button"
              >
                <span style={{ fontSize: 22 }}>📷</span>
              </button>
            </div>

            {lastBarcode && (
              <p style={{ ...styles.barcodeTag, background: C.tagBg, color: C.textMuted }}>
                Barcode: {lastBarcode}
              </p>
            )}

            <div style={styles.qtyPriceRow}>
              <div style={{ flex: 1 }}>
                <label style={{ ...styles.label, color: C.textSub }}>Quantity</label>
                <input
                  style={{ ...styles.input, background: C.inputBg, borderColor: C.inputBorder, color: C.text }}
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="1"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...styles.label, color: C.textSub }}>Unit Price ($)</label>
                <input
                  style={{ ...styles.input, background: C.inputBg, borderColor: C.inputBorder, color: C.text }}
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                />
              </div>
            </div>

            {error && <p style={{ ...styles.error, color: C.danger }}>{error}</p>}

            <button
              style={{ ...styles.addBtn, background: C.rowBg, color: C.text }}
              onClick={addItem}
              type="button"
            >
              + Add Item
            </button>
          </section>

          {/* ── Invoice Preview ── */}
          <section style={{ ...styles.card, background: C.card }}>
            <InvoicePreview items={items} onRemove={removeItem} onEdit={setEditingItem} dark={dark} />
          </section>

          <button
            style={{ ...styles.generateBtn, opacity: generating ? 0.7 : 1 }}
            onClick={handleGenerate}
            disabled={generating}
            type="button"
          >
            {generating ? 'Saving…' : 'Generate Invoice'}
          </button>
        </div>
      </div>
    </>
  );
}

const styles = {
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
    alignItems: 'flex-start',
    gap: 12,
  },
  hamburger: {
    background: 'none',
    border: 'none',
    fontSize: 24,
    cursor: 'pointer',
    padding: '2px 4px',
    marginTop: 2,
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  bizNameBtn: {
    background: 'none',
    border: 'none',
    padding: '2px 6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    WebkitTapHighlightColor: 'transparent',
  },
  bizNameInput: {
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    border: 'none',
    borderBottom: '2px solid',
    outline: 'none',
    textAlign: 'center',
    width: '100%',
    maxWidth: 280,
    padding: '2px 4px',
  },
  bizPhoneBtn: {
    background: 'none',
    border: 'none',
    padding: '1px 4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 13,
    WebkitTapHighlightColor: 'transparent',
  },
  bizPhoneInput: {
    fontSize: 13,
    border: 'none',
    borderBottom: '1.5px solid',
    outline: 'none',
    textAlign: 'center',
    width: '100%',
    maxWidth: 200,
    padding: '1px 4px',
  },
  editPencil: { fontSize: 13, color: '#bbb', fontWeight: 400 },
  headerSub: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: 500,
  },
  body: {
    padding: '16px 16px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    maxWidth: 480,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  card: {
    borderRadius: 16,
    padding: 18,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    margin: '0 0 12px',
    letterSpacing: 0.2,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    height: 52,
    fontSize: 16,
    padding: '0 14px',
    border: '1.5px solid',
    borderRadius: 10,
    outline: 'none',
    WebkitAppearance: 'none',
    appearance: 'none',
  },
  dateTimeRow: {
    display: 'flex',
    gap: 12,
    marginTop: 14,
  },
  productRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  scanBtn: {
    flexShrink: 0,
    width: 52,
    height: 52,
    border: '1.5px solid',
    borderRadius: 10,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
  },
  barcodeTag: {
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 6,
    margin: '-4px 0 10px',
    fontFamily: 'monospace',
  },
  qtyPriceRow: { display: 'flex', gap: 12, marginTop: 2 },
  error: { fontSize: 14, margin: '8px 0 0', fontWeight: 600 },
  addBtn: {
    width: '100%',
    marginTop: 14,
    height: 52,
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  generateBtn: {
    width: '100%',
    height: 58,
    background: ACCENT,
    border: 'none',
    borderRadius: 16,
    fontSize: 18,
    fontWeight: 800,
    color: '#fff',
    cursor: 'pointer',
    letterSpacing: 0.3,
    boxShadow: '0 4px 16px rgba(26,115,232,0.35)',
    WebkitTapHighlightColor: 'transparent',
  },
};
