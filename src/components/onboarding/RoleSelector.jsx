/**
 * RoleSelector — full-screen role picker shown to brand-new users.
 *
 * Shown exactly once (when inv_user_role is not set in localStorage and the
 * user has no existing data). After picking, the role is saved and the app
 * renders normally. Existing driver users never see this screen.
 */

import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { LIGHT, DARK, ACCENT } from '../../theme';

function TruckIcon() {
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" fill="none">
      <rect x="2" y="10" width="22" height="16" rx="3" stroke={ACCENT} strokeWidth="2.2" fill="none" />
      <path d="M24 14h4l4 6v6h-8V14z" stroke={ACCENT} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
      <circle cx="9"  cy="28" r="3" stroke={ACCENT} strokeWidth="2" fill="none" />
      <circle cx="27" cy="28" r="3" stroke={ACCENT} strokeWidth="2" fill="none" />
      <line x1="2" y1="20" x2="24" y2="20" stroke={ACCENT} strokeWidth="1.5" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" fill="none">
      <rect x="4" y="16" width="28" height="16" rx="2" stroke={ACCENT} strokeWidth="2.2" fill="none" />
      <path d="M4 16l4-10h20l4 10" stroke={ACCENT} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
      <rect x="13" y="22" width="10" height="10" rx="1.5" stroke={ACCENT} strokeWidth="2" fill="none" />
      <line x1="18" y1="6" x2="18" y2="16" stroke={ACCENT} strokeWidth="1.5" />
    </svg>
  );
}

const ROLES = [
  {
    id: 'driver',
    title: 'Delivery Driver',
    desc: 'Create invoices, track payments, and manage deliveries to your stores.',
    Icon: TruckIcon,
  },
  {
    id: 'store_owner',
    title: 'Store Owner',
    desc: 'Request deliveries, choose your drivers, and track what you need.',
    Icon: StoreIcon,
  },
];

export default function RoleSelector({ onSelect }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [selected, setSelected] = useState(null);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: C.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
      boxSizing: 'border-box',
    }}>

      {/* Wordmark */}
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1 }}>
          <span style={{ color: ACCENT }}>Invo</span>
          <span style={{ color: C.text }}>Go</span>
        </div>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 8px', textAlign: 'center', letterSpacing: '-0.3px' }}>
        What describes you?
      </h1>
      <p style={{ fontSize: 14, color: C.textMuted, margin: '0 0 28px', textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
        We'll tailor the app to your workflow.
      </p>

      {/* Role cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
        {ROLES.map(({ id, title, desc, Icon }) => {
          const active = selected === id;
          return (
            <button
              key={id}
              onClick={() => setSelected(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '18px 20px',
                background: active
                  ? (dark ? 'rgba(74,123,247,0.13)' : 'rgba(74,123,247,0.07)')
                  : C.card,
                border: `2px solid ${active ? ACCENT : C.cardBorder}`,
                borderRadius: 18,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                textAlign: 'left',
                transition: 'border-color 0.18s, background 0.18s',
              }}
            >
              {/* Icon */}
              <div style={{
                width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                background: active
                  ? (dark ? 'rgba(74,123,247,0.18)' : 'rgba(74,123,247,0.10)')
                  : (dark ? '#1e1e1e' : '#f3f4f6'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.18s',
              }}>
                <Icon />
              </div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: active ? ACCENT : C.text, marginBottom: 4, transition: 'color 0.18s' }}>
                  {title}
                </div>
                <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.45 }}>
                  {desc}
                </div>
              </div>

              {/* Check */}
              <div style={{
                width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                background: active ? ACCENT : (dark ? '#2a2a2a' : '#e5e7eb'),
                border: `2px solid ${active ? ACCENT : (dark ? '#3a3a3a' : '#d1d5db')}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.18s, border-color 0.18s',
              }}>
                {active && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <button
        onClick={() => selected && onSelect(selected)}
        style={{
          marginTop: 24, width: '100%', maxWidth: 360,
          height: 52, borderRadius: 16, border: 'none',
          background: selected ? ACCENT : (dark ? '#2a2a2a' : '#e5e7eb'),
          color: selected ? '#fff' : C.textMuted,
          fontSize: 16, fontWeight: 700,
          cursor: selected ? 'pointer' : 'default',
          WebkitTapHighlightColor: 'transparent',
          transition: 'background 0.2s, color 0.2s',
          boxShadow: selected ? '0 4px 16px rgba(74,123,247,0.35)' : 'none',
        }}
      >
        Get Started
      </button>

      <p style={{ marginTop: 14, fontSize: 12, color: C.textMuted, opacity: 0.7 }}>
        You can switch roles anytime in Settings
      </p>
    </div>
  );
}
