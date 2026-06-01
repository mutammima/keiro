/**
 * NavDrawer — slide-in navigation sidebar.
 * Shows pinned stores as quick-tap chips below the main nav items.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../theme';
import { signOut } from '../lib/auth';
import { getPinnedStores } from '../utils/storage';

const NAV_ITEMS_FULL = [
  { id: 'home',       label: 'Dashboard',  icon: '⌂' },
  { id: 'reports',    label: 'Reports',    icon: '◈' },
  { id: 'end-of-day', label: 'End of Day', icon: '☽' },
  { id: 'store-map',  label: 'Store Info', icon: '⌖' },
  { id: 'notes',      label: 'Notes',      icon: '✎' },
  { id: 'settings',   label: 'Settings',   icon: '⚙' },
];

const NAV_ITEMS_EASY = [
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

function isEasyMode() {
  try { return JSON.parse(localStorage.getItem('inv_easy_mode')); } catch { return false; }
}

export default function NavDrawer({ open, onClose, onNav, currentPage, onTutorial }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [pinned, setPinned] = useState([]);
  const NAV_ITEMS = isEasyMode() ? NAV_ITEMS_EASY : NAV_ITEMS_FULL;

  // Refresh pinned list whenever drawer opens
  useEffect(() => {
    if (open) setPinned(getPinnedStores());
  }, [open]);

  async function handleSignOut() {
    await signOut();
    window.location.reload();
  }

  return (
    <>
      {/* Dimmed backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          ...s.backdrop,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      {/* Drawer panel */}
      <div style={{
        ...s.drawer,
        background: C.drawerBg,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
      }}>
        {/* Close button */}
        <div style={s.drawerHeader}>
          <button style={{ ...s.closeBtn, color: C.textMuted }} onClick={onClose}>←</button>
        </div>

        {/* Main nav */}
        <nav style={s.nav}>
          {NAV_ITEMS.map(item => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                style={{
                  ...s.navItem,
                  color: active ? C.navActiveText : C.navText,
                  background: active ? C.navActive : 'none',
                }}
                onClick={() => onNav(item.id)}
              >
                <span style={s.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Pinned stores */}
        {pinned.length > 0 && (
          <div style={{ padding: '0 10px 4px' }}>
            <div style={{ ...s.dividerLine, background: C.divider, margin: '4px 2px 10px' }} />
            <div style={{ color: C.textMuted, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingLeft: 4 }}>
              Pinned Stores
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {pinned.map(name => (
                <button
                  key={name}
                  style={{
                    ...s.pinnedChip,
                    background: C.navActive,
                    color: C.navActiveText,
                    borderColor: dark ? 'rgba(74,123,247,0.18)' : 'rgba(74,123,247,0.15)',
                  }}
                  onClick={() => { onClose(); /* future: navigate to store detail */ }}
                >
                  <span style={{ fontSize: 11 }}>★</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom: Profile · How it Works · Sign Out */}
        <div style={{ ...s.nav, marginTop: 'auto', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <div style={{ ...s.dividerLine, background: C.divider }} />
          <button
            style={{ ...s.navItem, color: C.navText, background: currentPage === 'profile' ? C.navActive : 'none' }}
            onClick={() => onNav('profile')}
          >
            <span style={s.navIcon}>◉</span>
            <span>Profile</span>
          </button>
          <button
            style={{ ...s.navItem, color: C.navText }}
            onClick={() => { onClose(); onTutorial?.(); }}
          >
            <span style={s.navIcon}>?</span>
            <span>How it Works</span>
          </button>
          <button
            style={{ ...s.navItem, color: C.danger, background: 'none', transition: 'color 0.4s ease' }}
            onClick={handleSignOut}
          >
            <span style={s.navIcon}>→</span>
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </>
  );
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 1500,
    transition: 'opacity 0.4s ease',
  },
  drawer: {
    position: 'fixed', top: 0, left: 0, bottom: 0,
    width: 'min(220px, 65vw)', zIndex: 1600,
    transition: 'transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94), background-color 0.3s ease',
    display: 'flex', flexDirection: 'column',
    overflowY: 'auto',
  },
  drawerHeader: {
    display: 'flex', alignItems: 'center',
    padding: '16px 16px 12px',
    paddingTop: 'max(16px, env(safe-area-inset-top))',
    flexShrink: 0,
  },
  closeBtn: {
    background: 'none', border: 'none',
    fontSize: 22, fontWeight: 300,
    cursor: 'pointer', padding: '0 4px', lineHeight: 1,
    WebkitTapHighlightColor: 'transparent',
  },
  nav: {
    display: 'flex', flexDirection: 'column',
    padding: '6px 10px', gap: 2, flexShrink: 0,
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 12px',
    background: 'none',   /* always transparent unless overridden inline */
    border: 'none', borderRadius: 12,
    fontSize: 14, fontWeight: 500,
    cursor: 'pointer', textAlign: 'left',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  navIcon: { fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 },
  dividerLine: { height: 1, margin: '6px 12px 8px' },
  pinnedChip: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '8px 12px',
    border: '1px solid', borderRadius: 10,
    fontSize: 13, fontWeight: 600,
    cursor: 'pointer', textAlign: 'left',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.15s',
    width: '100%',
  },
};
