/**
 * About — overview of Keiro's features and how to use them.
 */

import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';
import AppFooter from '../components/navigation/AppFooter';

const SECTIONS = [
  {
    icon: '＋',
    title: 'Create Invoices',
    body: 'Tap "New Invoice" to record a delivery. Enter the store name, add the products you delivered with their quantities and prices, and hit Generate. The app automatically numbers each invoice and saves it instantly.',
  },
  {
    icon: '▦',
    title: 'Scan Barcodes',
    body: 'Instead of typing product names by hand, tap the camera icon and scan a barcode. Keiro looks up the product name automatically and remembers the price for next time.',
  },
  {
    icon: '≡',
    title: 'Invoice History',
    body: 'Every invoice you\'ve ever created is saved under Invoice History. Browse by store, see totals at a glance, and tap any store to get a full breakdown of what they owe.',
  },
  {
    icon: '◈',
    title: 'Store Balances',
    body: 'Tap any store name to see their balance page — total outstanding, total billed, last delivery date, and every individual invoice. Mark invoices as Paid, Unpaid, or Partial with a single tap.',
  },
  {
    icon: '⬡',
    title: 'Products Catalog',
    body: 'Keiro remembers every product you\'ve ever added. Prices auto-fill when you pick a product you\'ve used before, so repeat deliveries are fast.',
  },
  {
    icon: '↑',
    title: 'Share as PDF',
    body: 'Open any invoice and tap "Share PDF" to send a clean, professional invoice directly from your phone via iMessage, WhatsApp, email, or any other app.',
  },
  {
    icon: '💬',
    title: 'Payment Reminders',
    body: 'When an invoice goes overdue, tap Remind to open WhatsApp with a polite, pre-written reminder — the store name, invoice number, days overdue, and the exact balance still owed are all filled in. Just review and hit send.',
  },
  {
    icon: '☁',
    title: 'Cloud Sync',
    body: 'Your data is securely stored in the cloud. Sign in on any device and all your invoices, products, and stores are right there. Everything is backed up automatically — nothing gets lost.',
  },
];

export default function About({ onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  return (
    <div style={{ ...s.page, background: C.bg }}>

      {/* Sticky header */}
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer}>☰</button>
        <span style={{ ...s.title, color: C.text }}>About</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>

        {/* Hero */}
        <div style={{ ...s.hero, background: C.card }}>
          <p style={{ ...s.heroTitle, color: C.text }}>Keiro</p>
          <p style={{ ...s.heroSub, color: C.textMuted }}>
            Streamlining the way drivers and stores work together — see what's needed, show what you carry, and keep every delivery on track.
          </p>
        </div>

        {/* Feature sections */}
        {SECTIONS.map((sec, i) => (
          <div key={i} style={{ ...s.card, background: C.card }}>
            <div style={s.cardTop}>
              <span style={{ ...s.cardIcon, background: dark ? '#1e1e1e' : '#ede9e3', color: ACCENT }}>
                {sec.icon}
              </span>
              <span style={{ ...s.cardTitle, color: C.text }}>{sec.title}</span>
            </div>
            <p style={{ ...s.cardBody, color: C.textMuted }}>{sec.body}</p>
          </div>
        ))}

        {/* Version line */}
        <p style={{ ...s.version, color: C.textMuted }}>Keiro v5.9 — Built for delivery drivers.</p>

        <AppFooter onNav={onNav} />
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' },
  header: {
    padding: '14px 20px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: 22,
    cursor: 'pointer', padding: '3px 4px',
    WebkitTapHighlightColor: 'transparent',
  },
  title: { fontSize: 17, fontWeight: 700, textAlign: 'center', flex: 1 },
  body: {
    padding: '12px 16px 88px',
    display: 'flex', flexDirection: 'column', gap: 10,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },

  hero: {
    borderRadius: 20, padding: '24px 22px',
  },
  heroTitle: { fontSize: 36, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-1.5px', lineHeight: 1, fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" },
  heroSub: { fontSize: 15, lineHeight: 1.6, margin: 0 },

  card: { borderRadius: 18, padding: '16px 18px' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  cardIcon: {
    width: 36, height: 36, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 700, flexShrink: 0,
  },
  cardTitle: { fontSize: 15, fontWeight: 700 },
  cardBody: { fontSize: 14, lineHeight: 1.65, margin: 0 },

  version: { fontSize: 12, textAlign: 'center', marginTop: 4 },
};
