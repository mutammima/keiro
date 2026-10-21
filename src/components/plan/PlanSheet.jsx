/**
 * PlanSheet — the bottom sheet every plan screen uses (a centered dialog on
 * desktop through the --sheet-* custom properties, like the other sheets).
 * Portaled so an overflow:hidden ancestor can't clip it on iOS. `onClose` is
 * optional: with it, a tap on the dimmed backdrop or the Escape key closes the
 * sheet; without it (the one-time plan notes) the backdrop and Escape do
 * nothing and only the sheet's own button can close it.
 * Opening moves focus into the sheet (its first button); closing gives focus
 * back to what had it. There is no focus trap.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { PLAN_COPY } from '../../utils/constants';

export default function PlanSheet({ open, onClose, title, label, children }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const dialogRef = useRef(null);

  // Focus goes in when the sheet opens and back to where it was when it closes. Keyed on `open` alone: the
  // page re-renders with a new onClose all the time, and that must not pull focus back into the sheet.
  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    const dialog = dialogRef.current;
    (dialog?.querySelector('button:not([disabled])') || dialog)?.focus();
    return () => { if (before?.isConnected && typeof before.focus === 'function') before.focus(); };
  }, [open]);

  // Escape closes a sheet that can be closed.
  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div onClick={onClose} style={s.backdrop}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label || title || PLAN_COPY.upgradeTitle}
        onClick={e => e.stopPropagation()}
        style={{ ...s.sheet, background: C.card, borderColor: C.cardBorder, color: C.text }}
      >
        {title && <div style={s.title}>{title}</div>}
        {children}
      </div>
    </div>,
    document.body
  );
}

export function PrimaryBtn({ onClick, disabled = false, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...s.primary, background: ACCENT, opacity: disabled ? 0.7 : 1 }}>
      {children}
    </button>
  );
}

export function TextBtn({ onClick, children }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  return (
    <button type="button" onClick={onClick} style={{ ...s.text, color: C.textMuted }}>{children}</button>
  );
}

const s = {
  backdrop: {
    // Portaled to body, so it stacks against the app chrome directly: above
    // TopNav (1000), the sliding drawer (1600), the bottom OfflineBanner
    // (8000, which would hide half of the primary button while offline) and
    // the Quick Start tour (tap-blocking dim panels 9000, ring 9001, tooltip
    // 9002, Skip 9003: a note under them can't be tapped); below the sign-out
    // prompt (9500), ConfirmDialog (9600), GuestCapModal (9999), WhatsNew
    // (10000) and PinLock. The docked desktop rail is z 5, far beneath.
    position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'var(--sheet-align, flex-end)', justifyContent: 'center',
  },
  sheet: {
    width: '100%', maxWidth: 480, boxSizing: 'border-box', border: '1px solid',
    borderRadius: 'var(--sheet-radius-20, 20px 20px 0 0)',
    padding: '22px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
    display: 'flex', flexDirection: 'column', gap: 12,
    // A long sheet scrolls instead of running off the screen. In a column flex box that scrolls, a
    // fixed-height button would be squashed (50px to 20px in Chromium) before the sheet scrolled, so
    // the title and both buttons refuse to shrink (flexShrink: 0).
    maxHeight: '85vh', overflowY: 'auto',
    outline: 'none', // only ever focused by code (when it holds no button), never a control to tab to
  },
  title: { fontSize: 19, fontWeight: 800, lineHeight: 1.3, flexShrink: 0 },
  primary: {
    height: 50, flexShrink: 0, borderRadius: 14, border: 'none', color: '#fff', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  text: {
    // 44px is the app's minimum tap target (TopNav uses the same).
    minHeight: 44, flexShrink: 0,
    background: 'none', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    padding: '6px 0', WebkitTapHighlightColor: 'transparent',
  },
};
