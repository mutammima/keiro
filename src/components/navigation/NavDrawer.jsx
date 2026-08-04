/**
 * NavDrawer — the app's navigation sidebar, in two modes.
 *
 * MODE 1 (phone / tablet, `docked` false): a slide-in overlay drawer behind a
 * dimmed backdrop, opened by the ☰ in TopNav. Unchanged from how it has always
 * worked.
 *
 * MODE 2 (desktop, `docked` true): the same panel, permanently visible as a
 * left rail in the app shell's flex row — no backdrop, no transform, no close
 * button. Because TopNav is hidden on desktop, docked mode also renders the
 * four primary role tabs at the top, so the rail carries the whole navigation.
 *
 * It's one component rather than a separate SideNav on purpose: the nav item
 * list, icons, pinned-store chips, role toggle and sign-out block are identical
 * in both modes, and a second copy would drift.
 */

import { STORAGE_KEYS, SIDE_NAV_WIDTH } from '../../utils/constants';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';
import { signOut } from '../../services/auth';
import { getPinnedStores } from '../../utils/storage';
import { isGuest, promptAccount } from '../../utils/guestMode';
import { tabsForRole } from './tabs';
import KeiroWordmark from '../ui/KeiroWordmark';

// SVG icon components — clean geometric shapes, no emoji
const Icons = {
  reports: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
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
  box: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
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

// Drawer holds only NON-tab destinations. Home / Route / Stores / Reports are
// tabs for the driver; Home / Orders / Drivers / Invoices are tabs for the owner.
const NAV_ITEMS_FULL = [
  { id: 'products',    label: 'Products',    icon: Icons.box },
  { id: 'store-map',   label: 'Store Info',  icon: Icons.storemap },
  { id: 'marketplace', label: 'Marketplace', icon: Icons.market },
  { id: 'my-listings', label: 'My Listings', icon: Icons.tag },
  { id: 'notes',       label: 'Notes',       icon: Icons.notes },
];

const NAV_ITEMS_OWNER = [
  { id: 'find-drivers', label: 'Find Drivers', icon: Icons.market },
  { id: 'so-reports',   label: 'Reports',      icon: Icons.reports },
  { id: 'notes',        label: 'Notes',        icon: Icons.notes },
];

const NAV_ITEMS_EASY = [];

const SETTINGS_ITEM = { id: 'settings', label: 'Settings', icon: Icons.settings };

function isEasyMode() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.EASY_MODE)); } catch { return false; }
}

export default function NavDrawer({
  open, onClose, onNav, currentPage, onTutorial, role, onSwitchRole,
  docked = false, badges = {}, pulse = {},
}) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const isOwner = role === 'store_owner';
  const NAV_ITEMS = isOwner ? NAV_ITEMS_OWNER : (isEasyMode() ? NAV_ITEMS_EASY : NAV_ITEMS_FULL);

  // Pinned chips (drivers only). Read straight from storage while the drawer is
  // open — a plain derived value, so toggling a pin elsewhere shows up on the
  // next open with no useState/effect round-trip (and no setState-in-effect).
  // Docked mode is always "open", so it always reads.
  const pinned = (docked || open) && !isOwner ? getPinnedStores() : [];

  const guest = isGuest();

  async function handleSignOut() {
    await signOut();
    window.location.reload();
  }

  return (
    <>
      {/* Dimmed backdrop — overlay mode only; a docked rail has nothing to dim. */}
      {!docked && (
        <div
          onClick={onClose}
          aria-hidden="true"
          style={{
            ...s.backdrop,
            opacity: open ? 1 : 0,
            pointerEvents: open ? 'auto' : 'none',
          }}
        />
      )}

      {/* Drawer panel */}
      <div style={{
        ...s.drawer,
        ...(docked ? s.drawerDocked : null),
        background: C.drawerBg,
        ...(docked
          // In the shell's flex row: no transform, no slide transition, and a
          // hairline separating the rail from the content column.
          ? { borderRight: `1px solid ${C.divider}` }
          : { transform: open ? 'translateX(0)' : 'translateX(-100%)' }),
      }}>
        {/* Header — wordmark when docked (it's the app's only chrome there),
            back-arrow when it's an overlay that needs dismissing. */}
        <div style={s.drawerHeader}>
          {docked
            ? <KeiroWordmark C={C} style={{ fontSize: 22, paddingLeft: 4 }} />
            : <button aria-label="Close menu" style={{ ...s.closeBtn, color: C.textMuted }} onClick={onClose}>←</button>}
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
                    onClick={() => { if (!active) { onSwitchRole(id); if (!docked) onClose(); } }}
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

        {/* Primary role tabs — docked only. On phone/tablet these live in
            TopNav; on desktop TopNav is hidden, so the rail carries them. */}
        {docked && (
          <nav style={s.nav} aria-label="Main">
            {tabsForRole(role).map(tab => {
              const active = currentPage === tab.id;
              const count = badges[tab.id] || 0;
              return (
                <button
                  key={tab.id}
                  data-qs-tab={tab.id}
                  onClick={() => onNav(tab.id)}
                  style={{
                    ...s.navItem,
                    fontWeight: active ? 700 : 500,
                    color: active ? C.navActiveText : C.navText,
                    background: active ? C.navActive : 'none',
                  }}
                >
                  <span aria-hidden="true" style={{
                    ...s.tabRule,
                    background: active ? ACCENT : 'transparent',
                  }} />
                  <span style={{ flex: 1 }}>{tab.label}</span>
                  {pulse[tab.id] && (
                    <span aria-hidden style={{
                      width: 7, height: 7, borderRadius: 4, background: ACCENT, flexShrink: 0,
                      '--tut-glow': 'rgba(74,123,247,0.5)',
                      animation: 'tut-pulse 1.4s ease-in-out infinite',
                    }} />
                  )}
                  {count > 0 && (
                    <span style={s.badge}>{count > 9 ? '9+' : count}</span>
                  )}
                </button>
              );
            })}
            <div style={{ ...s.dividerLine, background: C.divider, marginTop: 8 }} />
          </nav>
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
  // Docked (desktop): still fixed to the left edge, but permanently in place
  // instead of translated off-screen. The content column is inset by
  // SIDE_NAV_WIDTH to sit beside it, so the two never overlap.
  // No transform transition — it never slides, and animating it would only
  // cause a visible lurch when the window crosses the desktop breakpoint.
  drawerDocked: {
    width: SIDE_NAV_WIDTH,
    transition: 'background-color 0.3s ease',
    paddingTop: 'env(safe-area-inset-top)',
  },
  // The active-tab marker in the docked rail — a vertical accent bar, the
  // sidebar counterpart of TopNav's underline.
  tabRule: {
    width: 3, height: 18, borderRadius: 2, flexShrink: 0,
    marginRight: 7, transition: 'background 0.2s',
  },
  badge: {
    minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box',
    borderRadius: 8, background: '#ef4444', color: '#fff',
    fontSize: 10, fontWeight: 800, lineHeight: '16px', textAlign: 'center',
    flexShrink: 0,
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
