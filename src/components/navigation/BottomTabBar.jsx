/**
 * BottomTabBar — Easy Mode's tabs, at the bottom of the screen where a thumb
 * reaches them, the way most iPhone apps put them (phone and tablet; desktop
 * keeps the docked rail). Route · Stores · Reports, then More, which opens the
 * menu (Products, Settings, Profile, How it Works) and closes it when tapped
 * again. Spec: docs/specs/2026-10-26-easy-mode-feel.md.
 *
 * Big targets with an icon over a written label: these drivers don't like
 * technology, and the old top strip (13 px labels by the clock) was easy to miss.
 * While it is on screen it sets --tab-bar-h on <html>, so fixed banners (sync,
 * offline, Undo) sit above it; with no bar the variable is unset and they stay put.
 */

import { useLayoutEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK } from '../../theme';
import { tabsForRole } from './tabs';

export const TAB_BAR_HEIGHT = 64; // px above the home-indicator area

const svg = (children) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ICONS = {
  route: svg(<>
    <path d="M6 2h12a1 1 0 0 1 1 1v19l-3-2-3 2-3-2-3 2V3a1 1 0 0 1 1-1z" />
    <line x1="9" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="15" y2="12" />
  </>),
  stores: svg(<>
    <path d="M3 9l1.5-5h15L21 9" /><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z" />
    <path d="M10 20v-6h4v6" />
  </>),
  reports: svg(<>
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
  </>),
  more: svg(<>
    <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
  </>),
};

export default function BottomTabBar({ currentPage, onNav, onMore, moreOpen = false, role, easyMode, badges = {} }) {
  const { dark, accent } = useTheme();
  const C = dark ? DARK : LIGHT;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--tab-bar-h', `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`);
    return () => root.style.removeProperty('--tab-bar-h');
  }, []);

  const items = [
    ...tabsForRole(role, easyMode).map((tab) => ({
      id: tab.id, label: tab.label, onPress: () => onNav(tab.id),
      active: !moreOpen && currentPage === tab.id, tab: true,
    })),
    { id: 'more', label: 'More', onPress: onMore, active: moreOpen, tab: false },
  ];

  return (
    <nav
      // Not "Main": the menu's list (NavDrawer) already holds that name.
      aria-label="Tabs"
      style={{
        ...s.bar,
        background: dark ? 'rgba(14,14,16,0.97)' : 'rgba(250,250,250,0.97)',
        borderTop: `1px solid ${dark ? '#2a2a2a' : '#e0ddd8'}`,
      }}
    >
      <div style={s.row}>
        {items.map((it) => {
          const count = it.tab ? badges[it.id] || 0 : 0;
          return (
            <button
              key={it.id}
              type="button"
              onClick={it.onPress}
              {...(it.tab ? { 'data-qs-tab': it.id } : { 'data-tab-more': '', 'aria-expanded': moreOpen })}
              aria-current={it.tab && it.active ? 'page' : undefined}
              style={s.item}
            >
              <span style={{ ...s.icon, color: it.active ? accent : C.textMuted, background: it.active ? `${accent}26` : 'transparent' }}>
                {ICONS[it.id] || ICONS.route}
                {count > 0 && <span style={s.badge}>{count > 9 ? '9+' : count}</span>}
              </span>
              <span style={{ ...s.label, color: it.active ? C.text : C.textMuted, fontWeight: it.active ? 800 : 600 }}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const s = {
  bar: {
    position: 'fixed', left: 0, right: 0, bottom: 0,
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    // Above the menu (1500/1600): More must stay tappable to close it.
    zIndex: 1700,
  },
  row: { display: 'flex', height: TAB_BAR_HEIGHT, alignItems: 'stretch', maxWidth: 'var(--form-max)', margin: '0 auto' },
  item: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', WebkitAppearance: 'none',
  },
  icon: {
    position: 'relative', width: 58, height: 34, borderRadius: 17,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background-color 0.2s, color 0.2s',
  },
  label: { fontSize: 13, letterSpacing: '0.01em' },
  badge: {
    position: 'absolute', top: -2, right: 6, minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box',
    borderRadius: 9, background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: '18px', textAlign: 'center',
  },
};
