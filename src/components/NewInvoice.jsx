import { useState, useCallback } from 'react';
import AutofillInput from './AutofillInput';
import BarcodeScanner from './BarcodeScanner';
import InvoicePreview from './InvoicePreview';
import { generateAndSharePDF } from '../utils/pdfGenerator';
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
} from '../utils/storage';

function todayString() {
  const d = new Date();
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function NewInvoice() {
  // Business name — loaded from storage, saved on change
  const [businessName, setBusinessName] = useState(
    () => getBusinessName() || 'J&Y Distributions'
  );
  const [editingBiz, setEditingBiz] = useState(false);

  // Invoice metadata
  const [storeName, setStoreName] = useState('');
  const [date, setDate] = useState(todayString());
  const [storeNames] = useState(() => getStoreNames());
  const [productNames] = useState(() => getProductNames());

  // Current item being built
  const [productName, setProductName] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [lastBarcode, setLastBarcode] = useState('');

  // Items on the invoice
  const [items, setItems] = useState([]);

  // UI state
  const [showScanner, setShowScanner] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Business name persistence ────────────────────────────────────────────
  function handleBizBlur(val) {
    const trimmed = (val || businessName).trim();
    if (trimmed) {
      setBusinessName(trimmed);
      saveBusinessName(trimmed);
    }
    setEditingBiz(false);
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
    const qtyNum = Number(qty);
    const priceNum = Number(price);
    if (!qty || isNaN(qtyNum) || qtyNum <= 0) return setError('Enter a valid quantity.');
    if (price === '' || isNaN(priceNum) || priceNum < 0) return setError('Enter a valid price.');

    saveProductName(productName.trim());
    if (lastBarcode) {
      saveProductBarcode(lastBarcode, productName.trim(), priceNum);
    }

    setItems((prev) => [
      ...prev,
      { id: uid(), name: productName.trim(), qty: qtyNum, price: priceNum },
    ]);

    setProductName('');
    setQty('');
    setPrice('');
    setLastBarcode('');
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  // ── Generate PDF ─────────────────────────────────────────────────────────
  async function handleGenerate() {
    setError('');
    if (!storeName.trim()) return setError('Enter a store name.');
    if (items.length === 0) return setError('Add at least one item.');

    setGenerating(true);
    try {
      const invoiceNumber = getNextInvoiceNumber();
      const invoice = {
        businessName: businessName.trim(),
        number: invoiceNumber,
        storeName: storeName.trim(),
        date,
        items,
        createdAt: new Date().toISOString(),
      };

      saveInvoice(invoice);
      saveStoreName(storeName.trim());

      await generateAndSharePDF(invoice);

      setSuccess(`Invoice #${invoiceNumber} created!`);
      setTimeout(() => {
        setItems([]);
        setStoreName('');
        setDate(todayString());
        setSuccess('');
      }, 2000);
    } catch (err) {
      console.error(err);
      setError('Failed to generate PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div style={styles.page}>
        {/* ── Header ── */}
        <div style={styles.header}>
          {editingBiz ? (
            <input
              autoFocus
              style={styles.bizNameInput}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              onBlur={(e) => handleBizBlur(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBizBlur(businessName)}
            />
          ) : (
            <button
              style={styles.bizNameBtn}
              onClick={() => setEditingBiz(true)}
              title="Tap to edit business name"
            >
              {businessName}
              <span style={styles.editPencil}>✎</span>
            </button>
          )}
          <span style={styles.headerSub}>New Invoice</span>
        </div>

        <div style={styles.body}>
          {/* ── Invoice Meta ── */}
          <section style={styles.card}>
            <AutofillInput
              label="Store / Customer Name"
              placeholder="e.g. Sunrise Deli"
              value={storeName}
              onChange={setStoreName}
              suggestions={storeNames}
              required
            />
            <div style={{ marginTop: 14 }}>
              <label style={styles.label}>Date</label>
              <input
                style={styles.input}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </section>

          {/* ── Add Item ── */}
          <section style={styles.card}>
            <p style={styles.sectionTitle}>Add Item</p>

            <div style={styles.productRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <AutofillInput
                  label="Product Name"
                  placeholder="e.g. Marlboro Reds"
                  value={productName}
                  onChange={setProductName}
                  suggestions={productNames}
                  required
                />
              </div>
              <button
                style={styles.scanBtn}
                onClick={() => setShowScanner(true)}
                aria-label="Scan barcode"
                type="button"
              >
                <span style={{ fontSize: 22 }}>📷</span>
              </button>
            </div>

            {lastBarcode && (
              <p style={styles.barcodeTag}>Barcode: {lastBarcode}</p>
            )}

            <div style={styles.qtyPriceRow}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Quantity</label>
                <input
                  style={styles.input}
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Unit Price ($)</label>
                <input
                  style={styles.input}
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button style={styles.addBtn} onClick={addItem} type="button">
              + Add Item
            </button>
          </section>

          {/* ── Invoice Preview ── */}
          <section style={styles.card}>
            <InvoicePreview items={items} onRemove={removeItem} />
          </section>

          {success && (
            <div style={styles.successBanner}>✓ {success}</div>
          )}

          <button
            style={{ ...styles.generateBtn, opacity: generating ? 0.7 : 1 }}
            onClick={handleGenerate}
            disabled={generating}
            type="button"
          >
            {generating ? 'Generating…' : '🧾 Generate Invoice'}
          </button>
        </div>
      </div>
    </>
  );
}

const ACCENT = '#1a73e8';

const styles = {
  page: {
    minHeight: '100dvh',
    background: '#f2f2f7',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    background: '#fff',
    borderBottom: '1px solid #e5e5e5',
    padding: '14px 20px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
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
    color: '#111',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    WebkitTapHighlightColor: 'transparent',
  },
  editPencil: {
    fontSize: 14,
    color: '#aaa',
    fontWeight: 400,
  },
  bizNameInput: {
    fontSize: 20,
    fontWeight: 800,
    color: '#111',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    border: 'none',
    borderBottom: `2px solid ${ACCENT}`,
    outline: 'none',
    textAlign: 'center',
    background: 'transparent',
    width: '100%',
    maxWidth: 300,
    padding: '2px 4px',
  },
  headerSub: {
    fontSize: 12,
    color: '#999',
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
    background: '#fff',
    borderRadius: 16,
    padding: 18,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#444',
    margin: '0 0 12px',
    letterSpacing: 0.2,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#444',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    height: 52,
    fontSize: 16,
    padding: '0 14px',
    border: '1.5px solid #ddd',
    borderRadius: 10,
    background: '#fafafa',
    color: '#111',
    outline: 'none',
    WebkitAppearance: 'none',
    appearance: 'none',
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
    border: '1.5px solid #ddd',
    borderRadius: 10,
    background: '#fafafa',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
  },
  barcodeTag: {
    fontSize: 12,
    color: '#888',
    background: '#f0f0f0',
    padding: '4px 10px',
    borderRadius: 6,
    margin: '-4px 0 10px',
    fontFamily: 'monospace',
  },
  qtyPriceRow: {
    display: 'flex',
    gap: 12,
    marginTop: 2,
  },
  error: {
    color: '#c53030',
    fontSize: 14,
    margin: '8px 0 0',
    fontWeight: 600,
  },
  addBtn: {
    width: '100%',
    marginTop: 14,
    height: 52,
    background: '#f0f0f0',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    color: '#333',
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
  successBanner: {
    background: '#d4edda',
    color: '#155724',
    padding: '14px 18px',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    textAlign: 'center',
  },
};
