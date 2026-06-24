/**
 * useInvoiceHistory — manages all state and business logic for the Invoice History screen.
 * Keeps InvoiceHistory.jsx focused purely on rendering.
 *
 * NOTE: getInvoices, updateInvoicePaymentStatus, and deleteInvoice are now async
 * (cloud-backed via Supabase). This hook loads invoices on mount and handles updates
 * via state rather than re-reading from storage.
 */

import { useState, useRef, useEffect } from 'react';
import {
  getInvoices,
  updateInvoicePaymentStatus,
  deleteInvoice,
  togglePinnedStore,
  isStorePinned,
  getBusinessName,
} from '../utils/storage';
import { clearSignatures, loadAllSignaturesFromCloud } from '../utils/signatureStorage';
import { clearPaymentsFor, loadAllPaymentsFromCloud, getTotalPaid } from '../utils/paymentStorage';
import { BUSINESS_NAME_PLACEHOLDER, EVENTS, DELETE_UNDO_MS } from '../utils/constants';
import { subtotalOf, getStatus, isOverdue, getFlagDays, todayInvoiceDate } from '../utils/invoiceUtils';
import { markAction } from '../utils/tutorialProgress';

// Re-exported so existing consumers (e.g. InvoiceHistory) can keep importing
// subtotalOf from this hook; the canonical definition lives in invoiceUtils.
export { subtotalOf };

// ── Constants ──────────────────────────────────────────────────────────────────

/** Order in which payment statuses cycle when the badge is tapped. */
export const STATUS_CYCLE = ['unpaid', 'paid', 'partial'];

/** Number of "older" invoices to show per page before "Load more". */
export const PAGE_SIZE = 8;

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Provides all state, derived values, and handlers for the Invoice History screen.
 *
 * @returns {object} State values, computed stats, filtered lists, and action handlers.
 */
export function useInvoiceHistory() {
  // ── Core data state ──────────────────────────────────────────────────────
  const [invoices, setInvoices]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const bizName = getBusinessName() || BUSINESS_NAME_PLACEHOLDER;

  // ── UI state ─────────────────────────────────────────────────────────────
  const [expanded, setExpanded]           = useState(null);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [visibleOlder, setVisibleOlder]   = useState(PAGE_SIZE);
  const [openMenu, setOpenMenu]           = useState(null);
  const [sharing, setSharing]             = useState(null);
  const [, forceUpdate]                   = useState(0);
  const menuRef = useRef(null);

  // ── Delete flow ──────────────────────────────────────────────────────────
  // confirmDelete: the invoice awaiting a Yes/No in the portaled confirm modal.
  // pendingDelete: an invoice in its brief post-confirm Undo window — hidden
  // from every list/stat but still in `invoices` (and still in storage), so Undo
  // restores it instantly. The real delete fires only when the window expires.
  const [confirmDelete, setConfirmDelete] = useState(null); // invoice | null
  const [pendingDelete, setPendingDelete] = useState(null); // { number, invoice } | null
  const deleteTimerRef   = useRef(null);
  const pendingDeleteRef = useRef(null);
  pendingDeleteRef.current = pendingDelete;

  const today = todayInvoiceDate();

  // Invoices visible right now: everything except one in its Undo window.
  const liveInvoices = pendingDelete
    ? invoices.filter(i => (i.number || i.invoice_number) !== pendingDelete.number)
    : invoices;

  // ── Load invoices + payment log from cloud on mount ──────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Both fetches run in parallel; invoices gate the loading spinner,
    // payments sync silently in the background.
    Promise.all([
      getInvoices(),
      loadAllPaymentsFromCloud().catch(() => {}),
      loadAllSignaturesFromCloud().catch(() => {}),
    ]).then(([list]) => {
      if (!cancelled) {
        setInvoices(Array.isArray(list) ? list : []);
        setLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load invoices', err);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Side effects ──────────────────────────────────────────────────────────

  /** Close the action menu when the user clicks or touches outside it. */
  useEffect(() => {
    if (!openMenu) return;
    function close(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [openMenu]);

  // ── Derived stats ─────────────────────────────────────────────────────────

  /** Total amount owed across all unpaid and partially paid invoices. */
  const outstanding = liveInvoices
    .filter(i => getStatus(i) !== 'paid')
    .reduce((s, i) => s + subtotalOf(i), 0);

  const unpaidCount  = liveInvoices.filter(i => getStatus(i) === 'unpaid').length;
  const partialCount = liveInvoices.filter(i => getStatus(i) === 'partial').length;
  const todayCount   = liveInvoices.filter(i => i.date === today).length;

  /** True when all invoices have been collected (outstanding === 0 and there are invoices). */
  const allClear = outstanding === 0 && liveInvoices.length > 0;

  // Overdue detection (shared with InvoiceHistory + Home via invoiceUtils).
  // Read the threshold once here and pass it into isOverdue to avoid hitting
  // localStorage for every invoice in the list.
  const flagDays = getFlagDays();
  const overdueCount = liveInvoices.filter(inv => isOverdue(inv, flagDays)).length;

  // ── Filtered lists ────────────────────────────────────────────────────────

  const filtered = liveInvoices.filter(inv => {
    const q = search.trim().toLowerCase();
    const storeN = inv.storeName || inv.store_name || '';
    const matchQ = !q || storeN.toLowerCase().includes(q) || String(inv.number || inv.invoice_number).includes(q);
    const matchS =
      statusFilter === 'all'     ? true :
      statusFilter === 'overdue' ? isOverdue(inv, flagDays) :
                                   getStatus(inv) === statusFilter;
    return matchQ && matchS;
  });

  const todayInvoices      = filtered.filter(i => i.date === today);
  const olderInvoices      = filtered.filter(i => i.date !== today);
  const visibleOlderList   = olderInvoices.slice(0, visibleOlder);
  const remaining          = olderInvoices.length - visibleOlderList.length;

  // ── Action handlers ───────────────────────────────────────────────────────

  /**
   * Advances the payment status of an invoice to the next value in STATUS_CYCLE.
   * @param {number} number - Invoice number to update.
   */
  function cycleStatus(number) {
    const inv  = invoices.find(i => (i.number || i.invoice_number) === number);
    const cur  = getStatus(inv);
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
    updateInvoicePaymentStatus(number, next).catch(e => console.error(e));
    setInvoices(prev => prev.map(i =>
      (i.number || i.invoice_number) === number ? { ...i, paymentStatus: next, payment_status: next } : i
    ));
    setOpenMenu(null);
    if (next === 'paid') window.dispatchEvent(new CustomEvent(EVENTS.ONBOARDING_INVOICE_PAID));
  }

  /**
   * Sets the payment status of an invoice to an explicit value.
   * @param {number} number - Invoice number to update.
   * @param {string} status - One of 'unpaid' | 'paid' | 'partial'.
   */
  function setStatus(number, status) {
    updateInvoicePaymentStatus(number, status).catch(e => console.error(e));
    setInvoices(prev => prev.map(i =>
      (i.number || i.invoice_number) === number ? { ...i, paymentStatus: status, payment_status: status } : i
    ));
    setOpenMenu(null);
    if (status === 'paid') window.dispatchEvent(new CustomEvent(EVENTS.ONBOARDING_INVOICE_PAID));
  }

  /**
   * Permanently deletes an invoice (local + cloud) and its signatures/payments.
   * Internal — reached only when the Undo window expires or the screen unmounts.
   * @param {number} number - Invoice number to delete.
   */
  function finalizeDelete(number) {
    clearTimeout(deleteTimerRef.current);
    deleteInvoice(number).catch(e => console.error(e));
    clearSignatures(number);
    clearPaymentsFor(number);
    setInvoices(prev => prev.filter(i => (i.number || i.invoice_number) !== number));
    setPendingDelete(cur => (cur && cur.number === number ? null : cur));
  }

  /** Opens the portaled confirm modal for an invoice. */
  function requestDelete(number) {
    const inv = invoices.find(i => (i.number || i.invoice_number) === number);
    if (inv) setConfirmDelete(inv);
    setOpenMenu(null);
  }

  /** Dismisses the confirm modal without deleting. */
  function cancelDelete() { setConfirmDelete(null); }

  /**
   * Confirmed in the modal → hide the invoice and open the Undo window. Nothing
   * is removed from storage yet; finalizeDelete runs only if Undo isn't tapped.
   */
  function confirmDeleteNow() {
    const inv = confirmDelete;
    if (!inv) return;
    const number = inv.number || inv.invoice_number;
    setConfirmDelete(null);
    // Only one delete pending at a time — commit any earlier one first.
    if (pendingDelete && pendingDelete.number !== number) finalizeDelete(pendingDelete.number);
    setPendingDelete({ number, invoice: inv });
    clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = setTimeout(() => finalizeDelete(number), DELETE_UNDO_MS);
  }

  /** Taps "Undo" within the window → cancel the pending delete, restore the invoice. */
  function undoDelete() {
    clearTimeout(deleteTimerRef.current);
    setPendingDelete(null);
  }

  // The user already confirmed the delete; if they leave the screen before the
  // window expires, commit it (otherwise the invoice — never removed from
  // storage — would silently reappear on next load).
  useEffect(() => () => {
    const p = pendingDeleteRef.current;
    if (p) {
      clearTimeout(deleteTimerRef.current);
      deleteInvoice(p.number).catch(() => {});
      clearSignatures(p.number);
      clearPaymentsFor(p.number);
    }
  }, []);

  /**
   * Generates a PDF and triggers the native share sheet (or downloads as fallback).
   * @param {object} inv - The invoice object to share.
   */
  async function handleShare(inv) {
    // Normalise fields for pdfGenerator which expects camelCase
    const normalised = {
      ...inv,
      number: inv.number || inv.invoice_number,
      storeName: inv.storeName || inv.store_name,
      storePhone: inv.storePhone || inv.store_phone,
      storeAddress: inv.storeAddress || inv.store_address,
      businessName: inv.businessName || inv.business_name,
      businessPhone: inv.businessPhone || inv.business_phone,
      paymentStatus: inv.paymentStatus || inv.payment_status,
    };
    normalised.paidAmount = getTotalPaid(normalised.number);
    setSharing(normalised.number); setOpenMenu(null);
    try {
      // Lazy-load the PDF stack only when sharing.
      const { generateAndSharePDF } = await import('../utils/pdfGenerator');
      await generateAndSharePDF(normalised);
      markAction('shared_pdf');
    }
    catch (e) { console.error(e); }
    finally { setSharing(null); }
  }

  /**
   * Toggles the pin state of a store and forces a re-render.
   * @param {string} storeName - The name of the store to pin or unpin.
   */
  function handleTogglePin(storeName) {
    togglePinnedStore(storeName);
    forceUpdate(n => n + 1);
  }

  // ── Return ─────────────────────────────────────────────────────────────────
  return {
    // Data
    invoices, bizName, loading,

    // UI state
    expanded, setExpanded,
    search, setSearch,
    statusFilter, setStatusFilter,
    visibleOlder, setVisibleOlder,
    openMenu, setOpenMenu,
    sharing,
    menuRef,
    today,

    // Stats
    outstanding, unpaidCount, partialCount, todayCount, overdueCount, allClear,

    // Filtered lists
    filtered,
    todayInvoices, visibleOlderList, remaining,

    // Delete flow (confirm modal + Undo window)
    confirmDelete, pendingDelete,
    requestDelete, cancelDelete, confirmDeleteNow, undoDelete,

    // Handlers
    cycleStatus, setStatus,
    handleShare, handleTogglePin,

    // Utilities
    isStorePinned,
  };
}
