export const ACCENT = '#4A7BF7';  // royal blue — primary buttons
export const GRADIENT = 'linear-gradient(135deg, #5B4FE8 0%, #7B3FE4 100%)'; // hero gradient

export const LIGHT = {
  bg: '#f4f4f5',
  card: '#ffffff',
  cardBorder: '#e4e4e7',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04)',
  nestedCard: '#f4f4f5',
  nestedCardBorder: '#e4e4e7',
  header: '#ffffff',
  headerBorder: '#e4e4e7',
  inputBg: '#ffffff',
  inputBorder: '#d4d4d8',
  text: '#09090b',
  textSub: '#3f3f46',
  textMuted: '#71717a',
  textLight: '#a1a1aa',
  drawerBg: '#ffffff',
  drawerBorder: '#e4e4e7',
  navActive: 'rgba(74,123,247,0.08)',
  navActiveText: ACCENT,
  navText: '#3f3f46',
  rowBg: '#f4f4f5',
  subtotalBar: '#09090b',
  subtotalText: '#ffffff',
  infoBox: '#eff6ff',
  infoText: '#1d4ed8',
  divider: '#e4e4e7',
  danger: '#dc2626',
  successBg: '#f0fdf4',
  successText: '#16a34a',
  tagBg: '#f4f4f5',
  toggleTrack: '#d4d4d8',
};

export const DARK = {
  bg: '#000000',
  card: '#141414',
  cardBorder: 'transparent',   // depth from bg contrast, not strokes
  cardShadow: 'none',
  nestedCard: '#1e1e1e',
  nestedCardBorder: 'transparent',
  header: 'transparent',
  headerBorder: 'transparent',
  inputBg: '#1a1a1a',
  inputBorder: '#2a2a2a',
  text: '#ffffff',
  textSub: '#d1d1d1',
  textMuted: '#888888',
  textLight: '#444444',
  drawerBg: '#0d0d0d',
  drawerBorder: 'transparent',
  navActive: 'rgba(74,123,247,0.12)',
  navActiveText: '#7B9FFF',
  navText: '#888888',
  rowBg: '#1a1a1a',
  subtotalBar: '#1a1a1a',
  subtotalText: '#ffffff',
  infoBox: 'rgba(74,123,247,0.1)',
  infoText: '#7B9FFF',
  divider: '#1f1f1f',
  danger: '#ef4444',
  successBg: '#0D2B20',
  successText: '#2ECC8A',
  tagBg: '#1e1e1e',
  toggleTrack: '#2a2a2a',
};

// Liquid-glass sticky header
export function glassStyle(dark) {
  return {
    position: 'sticky',
    top: 0,
    zIndex: 200,
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    background: dark ? 'rgba(0,0,0,0.88)' : 'rgba(244,244,245,0.88)',
    borderBottom: 'none',
  };
}

export const STATUS = {
  paid:    { label: 'Paid',    light: { bg: '#f0fdf4', text: '#16a34a' }, dark: { bg: '#0D2B20', text: '#2ECC8A' } },
  unpaid:  { label: 'Unpaid',  light: { bg: '#fef2f2', text: '#dc2626' }, dark: { bg: '#2d0a0a', text: '#f87171' } },
  partial: { label: 'Partial', light: { bg: '#fffbeb', text: '#b45309' }, dark: { bg: '#1f1000', text: '#fbbf24' } },
};
