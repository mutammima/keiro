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
import { generateAndSharePDF } from '../utils/pdfGenerator';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Order in which payment statuses cycle when the badge is tapped. */
export const STATUS_CYCLE = ['unpaid', 'paid', 'partial'];

/** Number of "older" invoices to show per page before "Load more". */
export const PAGE_SIZE = 8;

// ── Utilities ──────────────────────────────────────────────────────────────────

/** Returns today's date formatted identically to how invoice dates are stored. */
function todayStr() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Calculates the subtotal for a single invoice.
 * @param {object} inv - Invoice object with an `items` array.
 * @returns {number} Sum of (qty * price) for every line item.
 */
export function subtotalOf(inv) {
  return (inv.items || []).reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
}

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
  const bizName = getBusinessName() || 'J&Y Distributions';

  // ── UI state ─────────────────────────────────────────────────────────────
  const [expanded, setExpanded]           = useState(null);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [visibleOlder, setVisibleOlder]   = useState(PAGE_SIZE);
  const [openMenu, setOpenMenu]           = useState(null);
  const [sharing, setSharing]             = useState(null);
  const [, forceUpdate]                   = useState(0);
  const menuRef = useRef(null);

  const today = todayStr();

  // ── Load invoices from cloud on mount ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInvoices().then(list => {
      if (!cancelled) {
        // getInvoices() returns newest-first from cloud;
        // if falling back to localStorage it's oldest-first — reverse it.
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
  const outstanding = invoices
    .filter(i => (i.paymentStatus || i.payment_status || 'unpaid') !== 'paid')
    .reduce((s, i) => s + subtotalOf(i), 0);

  // Normalise paymentStatus — DB uses snake_case column but our shape re-maps it
  function getStatus(inv) {
    return inv.paymentStatus || inv.payment_status || 'unpaid';
  }

  const unpaidCount  = invoices.filter(i => getStatus(i) === 'unpaid').length;
  const partialCount = invoices.filter(i => getStatus(i) === 'partial').length;
  const todayCount   = invoices.filter(i => i.date === today).length;

  /** True when all invoices have been collected (outstanding === 0 and there are invoices). */
  const allClear = outstanding === 0 && invoices.length > 0;

  // ── Filtered lists ────────────────────────────────────────────────────────

  const filtered = invoices.filter(inv => {
    const q = search.trim().toLowerCase();
    const storeN = inv.storeName || inv.store_name || '';
    const matchQ = !q || storeN.toLowerCase().includes(q) || String(inv.number || inv.invoice_number).includes(q);
    const matchS = statusFilter === 'all' || getStatus(inv) === statusFilter;
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
    if (next === 'paid') window.dispatchEvent(new CustomEvent('inv-onboarding-invoice-paid'));
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
    if (status === 'paid') window.dispatchEvent(new CustomEvent('inv-onboarding-invoice-paid'));
  }

  /**
   * Prompts for confirmation then permanently deletes an invoice.
   * @param {number} number - Invoice number to delete.
   */
  function handleDelete(number) {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return;
    deleteInvoice(number).catch(e => console.error(e));
    setInvoices(prev => prev.filter(i => (i.number || i.invoice_number) !== number));
    setOpenMenu(null);
  }

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
    setSharing(normalised.number); setOpenMenu(null);
    try { await generateAndSharePDF(normalised); }
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
    outstanding, unpaidCount, partialCount, todayCount, allClear,

    // Filtered lists
    filtered,
    todayInvoices, visibleOlderList, remaining,

    // Handlers
    cycleStatus, setStatus,
    handleDelete, handleShare, handleTogglePin,

    // Utilities
    isStorePinned,
  };
}
