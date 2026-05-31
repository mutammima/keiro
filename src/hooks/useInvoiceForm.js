/**
 * useInvoiceForm — manages all state and business logic for the New Invoice form.
 * Keeps NewInvoice.jsx as a pure rendering component.
 *
 * NOTE: Storage functions are now async (cloud-backed). All calls to storage
 * helpers in this hook use await. The barcode/product lookups that were already
 * async are unchanged.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  getNextInvoiceNumber,
  saveInvoice,
  getProductByBarcode,
  getProductByName,
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
import { lookupBarcode } from '../utils/barcodeApi';

// ── Utilities ──────────────────────────────────────────────────────────────────

/** Returns today's date as a human-readable string, e.g. "May 30, 2026". */
function todayString() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Returns the current time as "HH:MM AM/PM". */
function nowTimeString() {
  const d = new Date();
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/** Generates a short random unique ID for invoice line items. */
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Manages all form state for creating a new invoice.
 *
 * @param {function} onGenerated - Callback called with the saved invoice object
 *   once the invoice is successfully generated.
 * @returns {object} All state values and handler functions needed by NewInvoice.jsx.
 */
export function useInvoiceForm(onGenerated) {
  // ── Business info state ──────────────────────────────────────────────────
  // Business name/phone are synchronous localStorage reads — no async needed.
  const [businessName, setBusinessName]       = useState(() => getBusinessName() || 'J&Y Distributions');
  const [businessPhone, setBusinessPhone]     = useState(() => getBusinessPhone() || '');
  const [editingBiz, setEditingBiz]           = useState(false);
  const [editingBizPhone, setEditingBizPhone] = useState(false);

  // ── Store / customer state ───────────────────────────────────────────────
  const [storeName, setStoreName]       = useState('');
  const [storePhone, setStorePhone]     = useState('');
  const [storeAddress, setStoreAddress] = useState('');

  // ── Invoice details state ────────────────────────────────────────────────
  const [date, setDate]   = useState(todayString);
  const [time, setTime]   = useState(nowTimeString);
  const [notes, setNotes] = useState('');

  // ── Autocomplete lists (async loaded) ────────────────────────────────────
  const [storeNames, setStoreNames]     = useState(() => []);
  const [productNames]                  = useState(() => getProductNames()); // sync cache
  const [pinnedStores]                  = useState(() => getPinnedStores()); // sync localStorage

  // Load store names from cloud on mount
  useEffect(() => {
    getStoreNames().then(names => setStoreNames(names || [])).catch(() => {});
  }, []);

  // ── Add-item form state ──────────────────────────────────────────────────

  /**
   * Sets the product name and — if a saved price exists for that product —
   * auto-fills the price field. This fires when the user selects from autocomplete
   * or finishes typing a name that matches a catalog entry.
   * @param {string} val - Product name being set.
   */
  function handleProductNameChange(val) {
    setProductName(val);
    // Async lookup — only auto-fill when price field is currently empty
    getProductByName(val).then(saved => {
      if (saved && saved.lastPrice > 0) {
        setPrice(String(saved.lastPrice));
      }
    }).catch(() => {});
  }

  const [productName, setProductName] = useState('');
  const [qty, setQty]                 = useState('');
  const [price, setPrice]             = useState('');
  const [lastBarcode, setLastBarcode] = useState('');
  const [items, setItems]             = useState([]);
  const [editingItem, setEditingItem] = useState(null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [showScanner, setShowScanner] = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [error, setError]             = useState('');

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Persists the business name when the inline editor loses focus.
   * @param {string} val - Current input value.
   */
  function handleBizBlur(val) {
    const t = (val || businessName).trim();
    if (t) { setBusinessName(t); saveBusinessName(t); }
    setEditingBiz(false);
  }

  /**
   * Persists the business phone when the inline editor loses focus.
   * @param {string} val - Current input value.
   */
  function handleBizPhoneBlur(val) {
    const t = (val || businessPhone).trim();
    setBusinessPhone(t); saveBusinessPhone(t); setEditingBizPhone(false);
  }

  /**
   * Updates the store name field and async-loads phone/address from cloud
   * if a known store is selected.
   * @param {string} val - Selected or typed store name.
   */
  function handleStoreNameChange(val) {
    setStoreName(val);
    if (val?.trim()) {
      getStorePhone(val).then(p => { if (p) setStorePhone(p); }).catch(() => {});
      getStoreAddress(val).then(a => { if (a) setStoreAddress(a); }).catch(() => {});
    }
  }

  /**
   * Handles a barcode scan: checks the cloud product catalog first, then
   * falls back to the remote barcode API.
   * @param {string} barcode - The scanned barcode string.
   */
  const handleScan = useCallback(async (barcode) => {
    setLastBarcode(barcode);

    // 1. Check cloud catalog first
    const cached = await getProductByBarcode(barcode);
    if (cached) {
      setProductName(cached.name);
      setPrice(String(cached.lastPrice));
      return;
    }

    // 2. Look up from remote barcode database
    setProductName('Looking up…');
    setPrice('');
    const name = await lookupBarcode(barcode);
    if (name) {
      setProductName(name);
    } else {
      setProductName('');
      setError('Product not found — enter name manually.');
    }
  }, []);

  /**
   * Validates the current add-item fields and appends a new line item to the
   * items list. Also persists the product to the cloud catalog.
   */
  function addItem() {
    setError('');
    if (!productName.trim()) return setError('Enter a product name.');
    const qtyNum = Number(qty), priceNum = Number(price);
    if (!qty || isNaN(qtyNum) || qtyNum <= 0) return setError('Enter a valid quantity.');
    if (price === '' || isNaN(priceNum) || priceNum < 0) return setError('Enter a valid price.');

    saveProductName(productName.trim());
    const barcodeKey = lastBarcode
      ? lastBarcode
      : 'manual_' + productName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

    // Async — fire and forget; UI doesn't wait
    saveProductBarcode(barcodeKey, productName.trim(), priceNum).catch(() => {});

    setItems(prev => [...prev, { id: uid(), name: productName.trim(), qty: qtyNum, price: priceNum }]);
    setProductName(''); setQty(''); setPrice(''); setLastBarcode('');
  }

  /** Removes a line item by its unique ID. @param {string} id */
  function removeItem(id) { setItems(prev => prev.filter(i => i.id !== id)); }

  /**
   * Applies edits from the EditItemModal and closes the modal.
   * @param {object} updated - The updated item object (must include `.id`).
   */
  function handleEditSave(updated) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    setEditingItem(null);
  }

  /**
   * Validates the form, saves the invoice, persists store metadata,
   * resets the form, and calls `onGenerated` with the new invoice.
   */
  async function handleGenerate() {
    setError('');
    if (!storeName.trim()) return setError('Enter a store name.');
    if (items.length === 0) return setError('Add at least one item.');

    setGenerating(true);
    try {
      const invoiceNumber = await getNextInvoiceNumber();
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

      await saveInvoice(invoice);
      await saveStoreName(storeName.trim());
      if (storePhone.trim()) await saveStorePhone(storeName.trim(), storePhone.trim());
      if (storeAddress.trim()) await saveStoreAddress(storeName.trim(), storeAddress.trim());

      // Reset form fields
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

  // ── Return ─────────────────────────────────────────────────────────────────
  return {
    // Business info
    businessName, setBusinessName,
    businessPhone, setBusinessPhone,
    editingBiz, setEditingBiz,
    editingBizPhone, setEditingBizPhone,
    handleBizBlur, handleBizPhoneBlur,

    // Store / customer
    storeName, storePhone, setStorePhone,
    storeAddress, setStoreAddress,
    handleStoreNameChange,
    storeNames, pinnedStores,

    // Invoice details
    date, setDate, time, setTime, notes, setNotes,

    // Add-item form
    productName,
    setProductName: handleProductNameChange,  // auto-fills price from catalog
    qty, setQty,
    price, setPrice,
    lastBarcode,
    productNames,
    handleScan,
    addItem,

    // Items list
    items,
    removeItem,
    editingItem, setEditingItem,
    handleEditSave,

    // UI state
    showScanner, setShowScanner,
    generating,
    error,
    handleGenerate,
  };
}
