/**
 * useInvoiceForm — manages all state and business logic for the New Invoice form.
 * Keeps NewInvoice.jsx as a pure rendering component.
 *
 * NOTE: Storage functions are now async (cloud-backed). All calls to storage
 * helpers in this hook use await. The barcode/product lookups that were already
 * async are unchanged.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  getNextInvoiceNumber,
  getInvoices,
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
  getStoreDetails,
  saveStoreDetails,
  getPinnedStores,
} from '../utils/storage';
import { lookupBarcode } from '../utils/barcodeApi';
import { buildOrderSuggestions, checkInvoiceAnomaly } from '../utils/orderSuggestions';
import { completeActiveConnectionOrder } from '../utils/connectionOrderStorage';
import { DEFAULT_BUSINESS_NAME } from '../utils/constants';
import { canSaveGuestEntry } from '../utils/guestMode';

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
  const [businessName, setBusinessName]       = useState(() => getBusinessName() || DEFAULT_BUSINESS_NAME);
  const [businessPhone, setBusinessPhone]     = useState(() => getBusinessPhone() || '');
  const [editingBiz, setEditingBiz]           = useState(false);
  const [editingBizPhone, setEditingBizPhone] = useState(false);

  // Ref to track the latest store name so stale async phone/address lookups don't overwrite.
  const latestStoreNameRef = useRef('');

  // ── Store / customer state ───────────────────────────────────────────────
  const [storeName, setStoreName]         = useState('');
  const [customerName, setCustomerName]   = useState('');
  const [storePhone, setStorePhone]       = useState('');
  const [storeAddress, setStoreAddress]   = useState('');

  // ── Invoice details state ────────────────────────────────────────────────
  const [date, setDate]   = useState(todayString);
  const [time, setTime]   = useState(nowTimeString);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'card'

  // ── Autocomplete lists (async loaded) ────────────────────────────────────
  const [storeNames, setStoreNames]     = useState(() => []);
  const [productNames]                  = useState(() => getProductNames()); // sync cache
  const [pinnedStores]                  = useState(() => getPinnedStores()); // sync localStorage

  // Load store names from cloud on mount
  useEffect(() => {
    getStoreNames().then(names => setStoreNames(names || [])).catch(() => {});
  }, []);

  // Full invoice history — feeds smart order suggestions for the typed store.
  const [allInvoices, setAllInvoices] = useState([]);
  useEffect(() => {
    getInvoices().then(list => setAllInvoices(list || [])).catch(() => {});
  }, []);

  // Pre-fill form from a Duplicate or Bridge Request (written to inv_prefill before navigation)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('inv_prefill');
      if (!raw) return;
      localStorage.removeItem('inv_prefill');
      const p = JSON.parse(raw);
      if (p.storeName)    setStoreName(p.storeName);
      if (p.storePhone)   setStorePhone(p.storePhone);
      if (p.storeAddress) setStoreAddress(p.storeAddress);
      if (p.customerName) setCustomerName(p.customerName);
      if (p.notes)        setNotes(p.notes);
      if (Array.isArray(p.items) && p.items.length) setItems(p.items);
    } catch {}
  }, []); // eslint-disable-line

  // ── Add-item form state ──────────────────────────────────────────────────

  // Ref to track the latest product name so stale async lookups don't overwrite.
  const latestProductNameRef = useRef('');

  /**
   * Sets the product name and — if a saved price exists for that product —
   * auto-fills the price field. This fires when the user selects from autocomplete
   * or finishes typing a name that matches a catalog entry.
   * @param {string} val - Product name being set.
   */
  function handleProductNameChange(val) {
    latestProductNameRef.current = val;
    setProductName(val);
    // Async lookup — only auto-fill when price field is currently empty
    // and the product name hasn't changed since we fired the request.
    getProductByName(val).then(saved => {
      if (latestProductNameRef.current !== val) return; // stale — ignore
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
  const [guestWall, setGuestWall]     = useState(false); // hard cap reached (guest)

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
    latestStoreNameRef.current = val;
    setStoreName(val);
    if (val?.trim()) {
      // Single combined query instead of two separate calls
      getStoreDetails(val).then(({ phone, address }) => {
        if (latestStoreNameRef.current !== val) return; // stale — ignore
        if (phone)   setStorePhone(phone);
        if (address) setStoreAddress(address);
      }).catch(() => {});
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

  // ── Smart order suggestions ────────────────────────────────────────────────
  // Frequent items from this store's recent invoices, minus anything already
  // on the draft. Empty until the typed store name matches a store with ≥2
  // recent invoices.
  const suggestions = useMemo(() => {
    const inDraft = new Set(items.map(i => i.name.trim().toLowerCase()));
    return buildOrderSuggestions(allInvoices, storeName)
      .filter(sug => !inDraft.has(sug.name.toLowerCase()));
  }, [allInvoices, storeName, items]);

  /** One-tap add of a suggested item with its typical qty + last price. */
  function addSuggestedItem(sug) {
    setItems(prev => [...prev, { id: uid(), name: sug.name, qty: sug.qty, price: sug.price }]);
  }

  // ── Anomaly check ──────────────────────────────────────────────────────────
  // Non-blocking "double-check this" nudge when the draft total lands far
  // outside the store's historical average (needs ≥3 prior invoices).
  const anomaly = useMemo(() => {
    const total = items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
    return checkInvoiceAnomaly(allInvoices, storeName, total);
  }, [allInvoices, storeName, items]);

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
    if (!customerName.trim()) return setError('Enter a customer name.');
    if (items.length === 0) return setError('Add at least one item.');

    // Guest hard cap: block the save and surface the account-upsell modal.
    if (!canSaveGuestEntry()) { setGuestWall(true); return; }

    setGenerating(true);
    try {
      const invoiceNumber = await getNextInvoiceNumber();
      const invoice = {
        businessName: businessName.trim(),
        businessPhone: businessPhone.trim(),
        number: invoiceNumber,
        storeName: storeName.trim(),
        customerName: customerName.trim(),
        storePhone: storePhone.trim(),
        storeAddress: storeAddress.trim(),
        date, time, items,
        notes: notes.trim(),
        paymentMethod,
        paymentStatus: 'unpaid',
        createdAt: new Date().toISOString(),
      };

      await saveInvoice(invoice);
      await saveStoreName(storeName.trim());
      // Save phone + address in one upsert
      if (storePhone.trim() || storeAddress.trim()) {
        await saveStoreDetails(storeName.trim(), storePhone.trim(), storeAddress.trim());
      }

      // If this invoice was filled from a connected store's order, flip that
      // order to 'delivered' with the invoice number so the store sees it.
      completeActiveConnectionOrder(invoiceNumber);

      // Reset form fields
      setItems([]); setStoreName(''); setCustomerName(''); setStorePhone(''); setStoreAddress('');
      setDate(todayString()); setTime(nowTimeString()); setNotes(''); setPaymentMethod('cash');
      onGenerated(invoice);
      window.dispatchEvent(new CustomEvent('inv-onboarding-invoice-created'));
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
    storeName, customerName, setCustomerName,
    storePhone, setStorePhone,
    storeAddress, setStoreAddress,
    handleStoreNameChange,
    storeNames, pinnedStores,

    // Invoice details
    date, setDate, time, setTime, notes, setNotes,
    paymentMethod, setPaymentMethod,

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
    suggestions, addSuggestedItem,
    anomaly,

    // UI state
    showScanner, setShowScanner,
    generating,
    error,
    handleGenerate,
    guestWall, setGuestWall,
  };
}
