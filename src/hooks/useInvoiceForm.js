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
  getSharedProductName,
  getSharedProductSuggestions,
} from '../utils/storage';
import { lookupBarcode } from '../utils/barcodeApi';
import { normalizeScannedBarcode, isStoreMadeBarcode } from '../utils/barcodeFormat';
import { buildOrderSuggestions, checkInvoiceAnomaly } from '../utils/orderSuggestions';
import { completeActiveConnectionOrder, resolveConnectedStoreUserId } from '../utils/connectionOrderStorage';
import {
  STORAGE_KEYS, EVENTS, AUTOFILL_DEBOUNCE_MS, STORAGE_FULL_MESSAGE,
  UNKNOWN_BARCODE_MESSAGE, LOOKUP_UNAVAILABLE_MESSAGE, STORE_MADE_BARCODE_MESSAGE, LOOKING_UP_TEXT,
} from '../utils/constants';
import { canSaveGuestEntry } from '../utils/guestMode';
import { canCreateInvoice, recordNewInvoice, openFreeLimit } from '../utils/plan';

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
 * @param {{ easy?: boolean }} [options] - `easy`: the Easy Mode invoice
 *   (EasyInvoice.jsx) — no store name required, and scanning a barcode already
 *   on the list reopens that line with +1 instead of looking it up again.
 * @returns {object} All state values and handler functions needed by the
 *   invoice screens.
 */
export function useInvoiceForm(onGenerated, { easy = false } = {}) {
  // ── Business info state ──────────────────────────────────────────────────
  // Business name/phone are synchronous localStorage reads — no async needed.
  const [businessName, setBusinessName]       = useState(() => getBusinessName());
  const [businessPhone, setBusinessPhone]     = useState(() => getBusinessPhone() || '');
  const [editingBiz, setEditingBiz]           = useState(false);
  const [editingBizPhone, setEditingBizPhone] = useState(false);

  // Ref to track the latest store name so stale async phone/address lookups don't overwrite.
  const latestStoreNameRef = useRef('');
  // Debounce timers for the autofill cloud lookups — one query per typing pause,
  // not per keystroke. Cleared on unmount so a late timer can't setState after.
  const storeLookupTimer   = useRef(null);
  const productLookupTimer = useRef(null);
  useEffect(() => () => { clearTimeout(storeLookupTimer.current); clearTimeout(productLookupTimer.current); }, []);

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

  // ── Edit mode ────────────────────────────────────────────────────────────
  // When set (via an `editNumber` in the prefill), handleGenerate updates this
  // existing invoice in place — SAME number — instead of creating a new one.
  // null = normal create mode. editMetaRef carries the fields we preserve on an
  // update (original payment status + createdAt) without forcing a re-render.
  const [editNumber, setEditNumber] = useState(null);
  const editMetaRef = useRef({ paymentStatus: 'unpaid', createdAt: null });

  // $0-invoice guard: a total of $0.00 almost always means a forgotten price.
  // handleGenerate opens this confirm once; confirmZeroTotal re-runs generation
  // with allowZeroRef set so the guard passes on the second call.
  const [zeroConfirm, setZeroConfirm] = useState(false);
  const allowZeroRef = useRef(false);
  function confirmZeroTotal() {
    allowZeroRef.current = true;
    setZeroConfirm(false);
    handleGenerate();
  }

  // Free plan: whether a new invoice was allowed when this form opened (and again after each one it saves).
  // A form opened with room may be finished even if Pro ends or the server's count arrives while it is
  // open: a half-made invoice is never thrown away, and the server's own limit (25) still backstops. Only
  // a form that was refused from the start (and still is) stops at the limit sheet.
  const [startedAllowed, setStartedAllowed] = useState(() => canCreateInvoice());

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

  // The driver's 3 most recently invoiced stores, newest first — one-tap
  // buttons on the Easy invoice. Blank and repeated (case-insensitive) names skipped.
  const recentStores = useMemo(() => {
    const seen = new Set();
    const out = [];
    [...allInvoices]
      .sort((a, b) => String(b.createdAt || b.created_at || '').localeCompare(String(a.createdAt || a.created_at || '')))
      .forEach(inv => {
        const name = (inv.storeName || '').trim();
        if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); out.push(name); }
      });
    return out.slice(0, 3);
  }, [allInvoices]);

  // ── Add-item form state ───────────────────────────────────────────────────
  // Declared before the prefill effect below so its setItems is in scope when
  // that effect restores a multi-line prefill (react-hooks/immutability).
  const [productName, setProductName] = useState('');
  // '1', not '' — the field shows "1" as its placeholder either way, but a real
  // default means it's a valid quantity from the start instead of a ghost value
  // that reads as filled-in but fails "Add Item" with "Enter a valid quantity."
  const [qty, setQty]                 = useState('1');
  const [price, setPrice]             = useState('');
  const [lastBarcode, setLastBarcode] = useState('');
  // True after a scan whose lookup couldn't run, so the form can offer Try again.
  const [lookupUnavailable, setLookupUnavailable] = useState(false);
  // Where the add-item name came from when it wasn't his own catalog:
  // 'drivers' (other Keiro drivers) | 'database' (Open Food Facts / UPCitemdb).
  // Easy Mode labels it on the check card; cleared when he types.
  const [nameSource, setNameSource] = useState(null);
  // Normal mode: a looked-up name is offered ("Is this it?") instead of being
  // silently filled in. { name, source } | null.
  const [pendingName, setPendingName] = useState(null);
  // Other drivers' names matching what he's typing (>= 2 characters).
  const [sharedSuggestions, setSharedSuggestions] = useState([]);
  const [items, setItems]             = useState([]);
  // Easy invoice: the id of the line the add-item fields are editing (a tapped
  // or rescanned line). null = the next addItem() appends a new line.
  const [replaceLineId, setReplaceLineId] = useState(null);
  // Bumped by every scan and every reset of the add-item fields, so a lookup
  // that finishes after the driver moved on (Cancel, the next scan, Add) is
  // ignored instead of landing on another item's fields.
  const scanSeqRef = useRef(0);
  const [editingItem, setEditingItem] = useState(null);

  // Pre-fill form from a Duplicate or Bridge Request (written to inv_prefill before navigation).
  // One-time consume-on-mount with a required removeItem side-effect, so it's a
  // genuine effect (not derivable state) — the initial setState is expected here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PREFILL);
      if (!raw) return;
      localStorage.removeItem(STORAGE_KEYS.PREFILL);
      const p = JSON.parse(raw);
      if (p.storeName)    setStoreName(p.storeName);
      if (p.storePhone)   setStorePhone(p.storePhone);
      if (p.storeAddress) setStoreAddress(p.storeAddress);
      if (p.customerName) setCustomerName(p.customerName);
      if (p.notes)        setNotes(p.notes);
      if (Array.isArray(p.items) && p.items.length) setItems(p.items);
      // Edit mode (Duplicate omits these → stays a fresh, create-mode invoice).
      if (p.editNumber != null) {
        setEditNumber(p.editNumber);
        editMetaRef.current = {
          paymentStatus: p.paymentStatus || 'unpaid',
          createdAt: p.createdAt || new Date().toISOString(),
        };
      }
      if (p.date)          setDate(p.date);
      if (p.time)          setTime(p.time);
      if (p.paymentMethod) setPaymentMethod(p.paymentMethod);
    } catch {
      // Prefill is a convenience hand-off, not required state: unreadable storage
      // (private mode) or malformed inv_prefill JSON should still open an empty
      // New Invoice form. The key is already removed above, so a bad payload
      // can't wedge the form on the next open either.
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    setProductName(val); // immediate — controlled input, no lag
    setNameSource(null);
    setPendingName(null);   // typing over an "Is this it?" question dismisses it
    scanSeqRef.current += 1; // typing cancels any barcode lookup still in flight
    // Debounced cloud lookup: fires once after the user pauses, not per keystroke.
    // Still guarded by the ref so a stale response never overwrites a newer name.
    clearTimeout(productLookupTimer.current);
    productLookupTimer.current = setTimeout(() => {
      getProductByName(val).then(saved => {
        if (latestProductNameRef.current !== val) return; // stale — ignore
        if (saved && saved.lastPrice > 0) {
          setPrice(String(saved.lastPrice));
        }
      }).catch(() => {});
      // Other drivers' names containing what he typed; a stale answer is dropped.
      if (val.trim().length >= 2) {
        getSharedProductSuggestions(val.trim()).then(list => {
          if (latestProductNameRef.current === val) setSharedSuggestions(list);
        }).catch(() => {});
      } else {
        setSharedSuggestions([]);
      }
    }, AUTOFILL_DEBOUNCE_MS);
  }

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
    setStoreName(val); // immediate — controlled input, no lag
    // Easy Mode hides phone, address and contact, so a previous store's values
    // would silently print (and be saved) under this one. Clear them; the
    // lookup below refills this store's own phone and address.
    if (easy) { setStorePhone(''); setStoreAddress(''); setCustomerName(''); }
    clearTimeout(storeLookupTimer.current);
    if (!val?.trim()) return;
    // Debounced cloud lookup (one combined phone+address query) after a typing
    // pause; the ref guard still discards a stale response for an older name.
    storeLookupTimer.current = setTimeout(() => {
      getStoreDetails(val).then(({ phone, address }) => {
        if (latestStoreNameRef.current !== val) return; // stale — ignore
        if (phone)   setStorePhone(phone);
        if (address) setStoreAddress(address);
      }).catch(() => {});
    }, AUTOFILL_DEBOUNCE_MS);
  }

  /**
   * Puts an existing line into the add-item fields (Easy invoice: a tapped
   * line, or a rescan with qtyDelta 1). The next addItem() updates that line.
   */
  const loadItemIntoForm = useCallback((item, qtyDelta = 0) => {
    setProductName(item.name);
    setQty(String(Number(item.qty) + qtyDelta));
    setPrice(String(item.price));
    setLastBarcode(item.barcode || '');
    setReplaceLineId(item.id);
    setError('');
    setLookupUnavailable(false);
    setNameSource(null); setPendingName(null);
    scanSeqRef.current += 1;
    // Setters are stable; listing them lets React Compiler keep the memoization.
  }, [setProductName, setQty, setPrice, setLastBarcode, setError, setNameSource, setPendingName]);

  /** Empties the add-item fields (Easy invoice: Cancel, Add without scanning). */
  const clearAddForm = useCallback(() => {
    setProductName(''); setQty('1'); setPrice(''); setLastBarcode('');
    setReplaceLineId(null); setError(''); setLookupUnavailable(false);
    setNameSource(null); setPendingName(null);
    scanSeqRef.current += 1;
  }, [setProductName, setQty, setPrice, setLastBarcode, setError, setNameSource, setPendingName]);

  /** Normal mode "Is this it?" → Yes: use the offered name (fills his price if he has one). */
  function acceptPendingName() {
    if (!pendingName) return;
    handleProductNameChange(pendingName.name);
    setPendingName(null);
  }

  /** Normal mode "Is this it?" → No: leave the name for him to type. */
  function rejectPendingName() {
    setPendingName(null);
  }

  /**
   * A name from other drivers or a product database: Easy Mode fills the
   * check card (the card is the question); normal mode asks "Is this it?".
   */
  const offerName = useCallback((name, source) => {
    if (easy) {
      setProductName(name);
      setNameSource(source);
    } else {
      setProductName('');
      setPendingName({ name, source });
    }
    // Setters are stable; listing them keeps React Compiler's memoization.
  }, [easy, setProductName, setNameSource, setPendingName]);

  /**
   * Names a barcode from the remote sources and reports the outcome: a name,
   * "no database has it", or "couldn't check" (which offers Try again).
   * @param {string} barcode - already normalized
   */
  const lookUpRemotely = useCallback(async (barcode, seq) => {
    setError('');
    setLookupUnavailable(false);
    setProductName(LOOKING_UP_TEXT);
    const { name, status } = await lookupBarcode(barcode);
    if (seq !== scanSeqRef.current) return; // the driver moved on: drop the late answer
    if (name) {
      offerName(name, 'database');
      return;
    }
    setProductName('');
    if (status === 'unavailable') {
      setLookupUnavailable(true);
      setError(LOOKUP_UNAVAILABLE_MESSAGE);
    } else {
      setError(UNKNOWN_BARCODE_MESSAGE);
    }
  }, [offerName, setProductName, setError]);

  /**
   * What other Keiro drivers call a barcode (name only, once two other accounts
   * agree); if nobody does, the remote barcode sources. Shared by the first
   * scan and Try again, so a retry also asks the drivers.
   * @param {string} barcode - already normalized
   * @param {number} seq - the scan this belongs to; a stale answer is dropped
   */
  const askDriversThenDatabase = useCallback(async (barcode, seq) => {
    setError('');
    setLookupUnavailable(false);
    setProductName(LOOKING_UP_TEXT);
    const shared = await getSharedProductName(barcode);
    if (seq !== scanSeqRef.current) return; // a newer scan, typing or Cancel came first
    if (shared) {
      offerName(shared, 'drivers');
      return;
    }
    await lookUpRemotely(barcode, seq);
  }, [offerName, lookUpRemotely, setError, setProductName]);

  /**
   * Handles a barcode scan: checks the product catalog first, then the remote
   * barcode sources. A short UPC-E is expanded to its UPC-A first (lookup
   * services only know that form), and the item is shown and saved under it.
   * @param {string} scanned - The decoded barcode text.
   * @param {string} [format] - The scanner's reported format, e.g. 'UPC_E'.
   */
  const handleScan = useCallback(async (scanned, format) => {
    const seq = ++scanSeqRef.current;
    const barcode = normalizeScannedBarcode(scanned, format);
    // Easy invoice: a barcode already on the list reopens that line, +1.
    if (easy) {
      const onList = items.find(i => i.barcode && i.barcode === barcode);
      if (onList) { loadItemIntoForm(onList, 1); return; }
    }
    setLastBarcode(barcode);
    setReplaceLineId(null);
    setError('');
    setLookupUnavailable(false);
    setProductName('');
    setPrice('');
    setNameSource(null); setPendingName(null);

    // 1. The driver's own catalog. Products saved before UPC-E codes were
    //    expanded are under the short code, so try that too.
    let cached = await getProductByBarcode(barcode);
    if (!cached && barcode !== scanned) cached = await getProductByBarcode(scanned);
    if (seq !== scanSeqRef.current) return; // a newer scan or Cancel came first
    if (cached) {
      setProductName(cached.name);
      setPrice(String(cached.lastPrice));
      return;
    }

    // 2. Store-made codes are only meaningful in one store; no database has them.
    if (isStoreMadeBarcode(barcode)) {
      setProductName('');
      setPrice('');
      setError(STORE_MADE_BARCODE_MESSAGE);
      return;
    }

    // 3 + 4. Other drivers' name, then the remote barcode sources.
    await askDriversThenDatabase(barcode, seq);
    // useState setters are referentially stable, so these deps never actually
    // change handleScan's identity — listing them just lets React Compiler
    // preserve the memoization instead of bailing out.
  }, [easy, items, loadItemIntoForm, setLastBarcode, setProductName, setPrice, setError, setNameSource, setPendingName, askDriversThenDatabase]);

  /** Try again after a lookup that couldn't run, for the barcode still shown. */
  const retryLookup = useCallback(async () => {
    if (lastBarcode) await askDriversThenDatabase(lastBarcode, ++scanSeqRef.current);
  }, [lastBarcode, askDriversThenDatabase]);

  /**
   * Validates the add-item fields and appends a line — or, when a line is
   * loaded (replaceLineId), updates it. Also persists the product to the
   * catalog. Returns true when a line was added or updated.
   */
  function addItem() {
    setError('');
    // Tapped before the scanned name came back: never save "Looking up…".
    if (productName === LOOKING_UP_TEXT) return false;
    if (!productName.trim()) { setError('Enter a product name.'); return false; }
    const qtyNum = Number(qty), priceNum = Number(price);
    if (!qty || isNaN(qtyNum) || qtyNum <= 0) { setError('Enter a valid quantity.'); return false; }
    if (price === '' || isNaN(priceNum) || priceNum < 0) { setError('Enter a valid price.'); return false; }

    saveProductName(productName.trim());
    const barcodeKey = lastBarcode
      ? lastBarcode
      : 'manual_' + productName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

    // Async — fire and forget; UI doesn't wait
    saveProductBarcode(barcodeKey, productName.trim(), priceNum).catch(() => {});

    // The barcode rides along in memory so a rescan finds the line; db.js maps
    // item fields explicitly, so it is never sent to invoice_items.
    const line = { name: productName.trim(), qty: qtyNum, price: priceNum, ...(lastBarcode ? { barcode: lastBarcode } : {}) };
    if (replaceLineId) {
      setItems(prev => prev.map(i => (i.id === replaceLineId ? { ...i, ...line } : i)));
    } else {
      setItems(prev => [...prev, { id: uid(), ...line }]);
    }
    setProductName(''); setQty('1'); setPrice(''); setLastBarcode(''); setLookupUnavailable(false); setReplaceLineId(null);
    setNameSource(null); setPendingName(null);
    scanSeqRef.current += 1;
    return true;
  }

  /** Removes a line item by its unique ID. @param {string} id */
  function removeItem(id) {
    setItems(prev => prev.filter(i => i.id !== id));
    setReplaceLineId(r => (r === id ? null : r));
  }

  // His own names first, then other drivers' names, without case-insensitive repeats.
  const productSuggestions = useMemo(() => {
    const seen = new Set();
    return [...productNames, ...sharedSuggestions].filter(n => {
      const key = n.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [productNames, sharedSuggestions]);

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
    // The confirm's "yes" covers this one run: it never lingers if a gate below turns the invoice away.
    const zeroOk = allowZeroRef.current;
    allowZeroRef.current = false;
    setError('');
    if (!easy && !storeName.trim()) return setError('Enter a store name.');
    // Customer name is optional — it never appears on the generated invoice or
    // PDF (only as an optional "Attn:" line in the WhatsApp share text), so it
    // must not block generation.
    if (items.length === 0) return setError('Add at least one item.');

    // Editing an existing invoice updates it in place (same number); only a NEW
    // invoice consumes a guest entry, completes a connection order, or counts as
    // an onboarding milestone.
    const isEdit = editNumber != null;

    // Guest hard cap: block the save and surface the account-upsell modal.
    // Edits add no new entry, so they're never capped.
    // Both gates come before the $0 question: no point asking about an invoice that can't be made.
    if (!isEdit && !canSaveGuestEntry()) { setGuestWall(true); return; }
    // Free plan: 20 new invoices a month (Duplicate included). Edits never count. A form that opened
    // with room may be finished (see startedAllowed).
    if (!isEdit && !startedAllowed && !canCreateInvoice()) { openFreeLimit(); return; }

    // A $0.00 total is almost always a forgotten price — confirm before saving
    // (the confirm sets allowZeroRef so a deliberate $0 invoice still generates).
    const total = items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
    if (total === 0 && !zeroOk) { setZeroConfirm(true); return; }

    setGenerating(true);
    try {
      const invoiceNumber = isEdit ? editNumber : await getNextInvoiceNumber();
      const invoice = {
        businessName: businessName.trim(),
        businessPhone: businessPhone.trim(),
        number: invoiceNumber,
        storeName: storeName.trim(),
        customerName: customerName.trim(),
        storePhone: storePhone.trim(),
        storeAddress: storeAddress.trim(),
        date, time,
        // The scanned barcode only helps the draft (a rescan finds its line); it isn't part of the invoice.
        items: items.map(({ barcode: _barcode, ...line }) => line),
        notes: notes.trim(),
        paymentMethod,
        // Preserve the existing status/created time on an edit; a new invoice
        // starts unpaid and stamps "now".
        paymentStatus: isEdit ? editMetaRef.current.paymentStatus : 'unpaid',
        createdAt: isEdit ? editMetaRef.current.createdAt : new Date().toISOString(),
        // Share with the connected store account when this invoice came from
        // their order, or the store name matches an active connection.
        storeUserId: resolveConnectedStoreUserId(storeName.trim()),
      };

      // Upserts by number → updates in place when editing.
      const saved = (await saveInvoice(invoice)) || {};
      if (saved.error && saved.savedLocally === false) {
        // Neither the cloud nor this phone has it: keep everything on screen.
        setError(STORAGE_FULL_MESSAGE);
        return;
      }
      if (!isEdit) {
        recordNewInvoice();
        // The next invoice on this form (if it is reused) starts from the count as it now stands.
        setStartedAllowed(canCreateInvoice());
      }
      const store = storeName.trim();
      // An Easy invoice can have no store (written on the paper instead).
      if (store) {
        await saveStoreName(store);
        // Save phone + address in one upsert
        if (storePhone.trim() || storeAddress.trim()) {
          await saveStoreDetails(store, storePhone.trim(), storeAddress.trim());
        }
      }

      if (!isEdit) {
        // If this invoice was filled from a connected store's order, flip that
        // order to 'delivered' with the invoice number so the store sees it.
        completeActiveConnectionOrder(invoiceNumber);
      }

      // Reset form fields
      setItems([]); setStoreName(''); setCustomerName(''); setStorePhone(''); setStoreAddress('');
      setDate(todayString()); setTime(nowTimeString()); setNotes(''); setPaymentMethod('cash');
      setEditNumber(null);
      onGenerated(invoice);
      if (!isEdit) window.dispatchEvent(new CustomEvent(EVENTS.ONBOARDING_INVOICE_CREATED));
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
    storeNames, pinnedStores, recentStores,

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
    nameSource, pendingName, acceptPendingName, rejectPendingName, productSuggestions,
    handleScan,
    retryLookup, lookupUnavailable,
    addItem,
    loadItemIntoForm, clearAddForm, replaceLineId,

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
    editNumber, // non-null when editing an existing invoice in place
    zeroConfirm, setZeroConfirm, confirmZeroTotal, // $0-invoice guard
  };
}
