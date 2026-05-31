export const ACCENT = '#1a73e8';

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
  navActive: '#eff6ff',
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
  card: '#161616',
  cardBorder: '#2c2c2c',
  cardShadow: 'none',
  nestedCard: '#0c0c0c',
  nestedCardBorder: '#2a2a2a',
  header: '#000000',
  headerBorder: '#2c2c2c',
  inputBg: '#161616',
  inputBorder: '#333333',
  text: '#ffffff',
  textSub: '#d1d1d1',
  textMuted: '#5a5a5a',
  textLight: '#3a3a3a',
  drawerBg: '#111111',
  drawerBorder: '#2c2c2c',
  navActive: '#1a2847',
  navActiveText: '#93c5fd',
  navText: '#d1d1d1',
  rowBg: '#0c0c0c',
  subtotalBar: '#1a1a1a',
  subtotalText: '#ffffff',
  infoBox: '#1a2847',
  infoText: '#93c5fd',
  divider: '#2c2c2c',
  danger: '#ef4444',
  successBg: '#052e1a',
  successText: '#4ade80',
  tagBg: '#1f1f1f',
  toggleTrack: '#333333',
};

// Liquid-glass sticky header style
export function glassStyle(dark) {
  return {
    position: 'sticky',
    top: 0,
    zIndex: 200,
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    background: dark
      ? 'rgba(0,0,0,0.72)'
      : 'rgba(244,244,245,0.80)',
    borderBottom: dark
      ? '1px solid rgba(255,255,255,0.06)'
      : '1px solid rgba(0,0,0,0.08)',
  };
}

export const STATUS = {
  paid:    { label: 'Paid',    light: { bg: '#f0fdf4', text: '#16a34a' }, dark: { bg: '#052e1a', text: '#4ade80' } },
  unpaid:  { label: 'Unpaid',  light: { bg: '#fef2f2', text: '#dc2626' }, dark: { bg: '#2d0a0a', text: '#f87171' } },
  partial: { label: 'Partial', light: { bg: '#fffbeb', text: '#b45309' }, dark: { bg: '#1f1000', text: '#fbbf24' } },
};
