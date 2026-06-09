/**
 * NavDrawer — slide-in navigation sidebar.
 * Shows pinned stores as quick-tap chips below the main nav items.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { signOut } from '../../services/auth';
import { getPinnedStores } from '../../utils/storage';
import { isGuest, promptAccount } from '../../utils/guestMode';

// SVG icon components — clean geometric shapes, no emoji
const Icons = {
  home: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
      <polyline points="9 21 9 12 15 12 15 21"/>
    </svg>
  ),
  reports: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  endofday: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  storemap: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  notes: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  market: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1.5-5h15L21 9"/><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z"/>
      <path d="M3 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 3 0"/>
    </svg>
  ),
  tag: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  profile: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  help: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  signout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
};

const NAV_ITEMS_FULL = [
  { id: 'home',        label: 'Dashboard',   icon: Icons.home },
  { id: 'marketplace', label: 'Marketplace', icon: Icons.market },
  { id: 'my-listings', label: 'My Listings', icon: Icons.tag },
  { id: 'reports',     label: 'Reports',     icon: Icons.reports },
  { id: 'end-of-day',  label: 'End of Day',  icon: Icons.endofday },
  { id: 'store-map',   label: 'Store Info',  icon: Icons.storemap },
  { id: 'notes',       label: 'Notes',       icon: Icons.notes },
];

const NAV_ITEMS_OWNER = [
  { id: 'so-home',      label: 'Dashboard',    icon: Icons.home },
  { id: 'find-drivers', label: 'Find Drivers', icon: Icons.market },
  { id: 'so-reports',   label: 'Reports',      icon: Icons.reports },
  { id: 'notes',        label: 'Notes',        icon: Icons.notes },
];

const NAV_ITEMS_EASY = [];

const SETTINGS_ITEM = { id: 'settings', label: 'Settings', icon: Icons.settings };

function isEasyMode() {
  try { return JSON.parse(localStorage.getItem('inv_easy_mode')); } catch { return false; }
}

export default function NavDrawer({ open, onClose, onNav, currentPage, onTutorial, role, onSwitchRole }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [pinned, setPinned] = useState([]);

  const isOwner = role === 'store_owner';
  const NAV_ITEMS = isOwner ? NAV_ITEMS_OWNER : (isEasyMode() ? NAV_ITEMS_EASY : NAV_ITEMS_FULL);

  // Refresh pinned list whenever drawer opens
  useEffect(() => {
    if (open) setPinned(getPinnedStores());
  }, [open]);

  const guest = isGuest();

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

        {/* Role toggle pill — Uber-style instant switch */}
        {onSwitchRole && (
          <div style={{ padding: '0 10px 14px' }}>
            <div style={{
              display: 'flex',
              background: dark ? '#1a1a1a' : '#f0f0f0',
              borderRadius: 12,
              padding: 3,
              gap: 3,
            }}>
              {[
                { id: 'driver',      label: 'Driver' },
                { id: 'store_owner', label: 'Owner'  },
              ].map(({ id, label }) => {
                const active = role === id;
                return (
                  <button
                    key={id}
                    onClick={() => { if (!active) { onSwitchRole(id); onClose(); } }}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      borderRadius: 9,
                      border: 'none',
                      background: active ? ACCENT : 'transparent',
                      color: active ? '#fff' : C.textMuted,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: active ? 'default' : 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                      transition: 'background 0.18s, color 0.18s',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
                <span style={s.navIcon} aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Pinned stores — driver only */}
        {!isOwner && pinned.length > 0 && (
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
                  onClick={() => { onClose(); onNav('store-map'); }}
                >
                  <span style={{ fontSize: 11 }}>★</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom: Settings · Profile · How it Works · Sign Out */}
        <div style={{ ...s.nav, marginTop: 'auto', paddingBottom: '16px' }}>
          <div style={{ ...s.dividerLine, background: C.divider }} />
          {/* Settings — always pinned at the bottom */}
          <button
            style={{
              ...s.navItem,
              color: currentPage === 'settings' ? C.navActiveText : C.navText,
              background: currentPage === 'settings' ? C.navActive : 'none',
            }}
            onClick={() => onNav('settings')}
          >
            <span style={s.navIcon} aria-hidden="true">{SETTINGS_ITEM.icon}</span>
            <span>{SETTINGS_ITEM.label}</span>
          </button>
          <button
            style={{ ...s.navItem, color: C.navText, background: currentPage === 'profile' ? C.navActive : 'none' }}
            onClick={() => onNav('profile')}
          >
            <span style={s.navIcon} aria-hidden="true">{Icons.profile}</span>
            <span>Profile</span>
          </button>
          <button
            style={{ ...s.navItem, color: C.navText }}
            onClick={() => { onClose(); onTutorial?.(); }}
          >
            <span style={s.navIcon} aria-hidden="true">{Icons.help}</span>
            <span>How it Works</span>
          </button>
          {guest ? (
            <button
              style={{ ...s.navItem, color: ACCENT, background: 'none', transition: 'color 0.4s ease' }}
              onClick={promptAccount}
            >
              <span style={s.navIcon} aria-hidden="true">{Icons.profile}</span>
              <span>Create Account</span>
            </button>
          ) : (
            <button
              style={{ ...s.navItem, color: C.danger, background: 'none', transition: 'color 0.4s ease' }}
              onClick={handleSignOut}
            >
              <span style={s.navIcon} aria-hidden="true">{Icons.signout}</span>
              <span>Sign Out</span>
            </button>
          )}
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
    paddingTop: 16,
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
