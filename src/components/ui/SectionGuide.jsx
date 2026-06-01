/**
 * SectionGuide — contextual first-visit guide for each app section.
 *
 * Shows a bottom sheet the first time a user visits a section.
 * Marks the section as "seen" in localStorage on dismiss.
 * Guest / new users see it on every fresh install; returning users see it once.
 */

import { useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

// ── Seen tracking ─────────────────────────────────────────────────────────────
const KEY = (section) => `inv_guide_${section}`;
export function hasSeenGuide(section) {
  try { return !!localStorage.getItem(KEY(section)); } catch { return false; }
}
export function markGuideSeen(section) {
  try { localStorage.setItem(KEY(section), '1'); } catch {}
}

// ── Guide content per section ─────────────────────────────────────────────────
const GUIDES = {
  invoice: {
    icon: '🧾',
    title: 'New Invoice',
    steps: [
      { icon: '🏪', text: 'Enter the store name and customer name — both are required.' },
      { icon: '📦', text: 'Add products by typing a name or scanning a barcode. Set qty and price.' },
      { icon: '💬', text: 'Add optional notes (e.g. "Cash on delivery") and set payment status.' },
      { icon: '⚡', text: 'Tap Generate Invoice to create a PDF-ready invoice instantly.' },
      { icon: '📤', text: 'From the invoice view you can download, share, or copy the invoice.' },
    ],
  },
  history: {
    icon: '📋',
    title: 'Invoice History',
    steps: [
      { icon: '🔍', text: 'Browse all past invoices — most recent first.' },
      { icon: '🔎', text: 'Use the search bar to find by store name, customer, or date.' },
      { icon: '🏷️', text: 'Filter by Paid / Unpaid / Partial to track what you\'re owed.' },
      { icon: '📄', text: 'Tap any invoice to view it, re-download it, or share it.' },
      { icon: '🏪', text: 'Tap a store name to open that store\'s full balance history.' },
    ],
  },
  products: {
    icon: '📦',
    title: 'Products',
    steps: [
      { icon: '✨', text: 'Products save automatically whenever you add an item to an invoice.' },
      { icon: '➕', text: 'Tap + Add to manually add a product to your catalog.' },
      { icon: '✎', text: 'Tap the pencil icon on any product to rename it.' },
      { icon: '🗂️', text: 'Products are sorted A–Z by letter for quick browsing.' },
      { icon: '🗑️', text: 'Tap Remove to delete a product, or Clear All to wipe the catalog.' },
    ],
  },
  reports: {
    icon: '📊',
    title: 'Reports',
    steps: [
      { icon: '📅', text: 'Today tab shows everything from today — totals, collected, and pending.' },
      { icon: '📈', text: 'Week / Month / Year tabs show your revenue trends over time.' },
      { icon: '🏪', text: 'Top Stores shows your highest-revenue customers for the period.' },
      { icon: '📦', text: 'Top Products shows your best-selling items by units and revenue.' },
      { icon: '📉', text: 'The 7-day bar chart highlights today vs the last week.' },
    ],
  },
  'store-map': {
    icon: '📍',
    title: 'Store Info',
    steps: [
      { icon: '🏪', text: 'Every store you\'ve delivered to appears here automatically.' },
      { icon: '★', text: 'Tap ☆ next to a store name to pin it — pinned stores appear at the top.' },
      { icon: '✏️', text: 'Swipe left on any store to edit its address and phone number.' },
      { icon: '🗺️', text: 'Tap Show map for an inline preview, or Directions to open Maps.' },
      { icon: '☎️', text: 'Tap Call to dial the store directly from this screen.' },
    ],
  },
  notes: {
    icon: '✎',
    title: 'Notes',
    steps: [
      { icon: '✏️', text: 'Write anything — delivery instructions, store contacts, reminders.' },
      { icon: '➕', text: 'Tap + New to create a note with an optional title and body.' },
      { icon: '👆', text: 'Tap any note to edit it. Your changes save automatically.' },
      { icon: '✕', text: 'Tap the ✕ icon on a note to delete it.' },
      { icon: '💾', text: 'Notes are saved on your device and persist between sessions.' },
    ],
  },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function SectionGuide({ section, onDismiss }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const guide = GUIDES[section];
  const sheetRef = useRef(null);

  // Animate in
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transform = 'translateY(100%)';
    el.style.transition = 'none';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.38s cubic-bezier(0.32,0.72,0,1)';
        el.style.transform  = 'translateY(0)';
      });
    });
  }, []);

  function dismiss() {
    markGuideSeen(section);
    const el = sheetRef.current;
    if (el) {
      el.style.transition = 'transform 0.28s cubic-bezier(0.4,0,1,1)';
      el.style.transform  = 'translateY(110%)';
      setTimeout(onDismiss, 280);
    } else {
      onDismiss();
    }
  }

  if (!guide) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 4000,
        display: 'flex', alignItems: 'flex-end',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={dismiss}
    >
      <div
        ref={sheetRef}
        style={{
          width: '100%',
          background: C.card,
          borderRadius: '22px 22px 0 0',
          paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
          maxHeight: '82dvh',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.divider, margin: '14px auto 0', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px 14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: dark ? 'rgba(74,123,247,0.15)' : 'rgba(74,123,247,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>
              {guide.icon}
            </div>
            <div>
              <p style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>How it works</p>
              <p style={{ color: C.text, fontSize: 18, fontWeight: 800, margin: 0 }}>{guide.title}</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            style={{ background: dark ? '#1e1e1e' : '#f0f0f0', border: 'none', borderRadius: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.textMuted, fontSize: 14, WebkitTapHighlightColor: 'transparent' }}
          >
            ✕
          </button>
        </div>

        {/* Steps */}
        <div style={{ overflowY: 'auto', padding: '0 22px', flex: 1 }}>
          {guide.steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingBottom: 18 }}>
              {/* Step number + icon */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 2 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 14,
                  background: i === 0 ? ACCENT : (dark ? '#1e1e1e' : '#f0f0f0'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800,
                  color: i === 0 ? '#fff' : C.textMuted,
                  flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                {i < guide.steps.length - 1 && (
                  <div style={{ width: 1, height: 18, background: C.divider }} />
                )}
              </div>
              {/* Text */}
              <p style={{ color: C.textSub, fontSize: 14, lineHeight: 1.55, margin: '4px 0 0', flex: 1 }}>
                {step.text}
              </p>
            </div>
          ))}
        </div>

        {/* Got it button */}
        <div style={{ padding: '10px 22px 0', flexShrink: 0 }}>
          <button
            onClick={dismiss}
            style={{
              width: '100%', height: 52,
              background: ACCENT, border: 'none', borderRadius: 16,
              color: '#fff', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 4px 16px rgba(74,123,247,0.35)',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
