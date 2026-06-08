/**
 * Legal — in-app Privacy Policy and Terms of Service.
 *
 * Renders the same content as the repo's PRIVACY.md / TERMS.md so the docs are
 * reachable from inside the app (footer links) before anyone signs up. A
 * segmented toggle switches between the two; `section` sets the initial view.
 */

import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { LIGHT, DARK, ACCENT, glassStyle } from '../theme';
import AppFooter from '../components/navigation/AppFooter';

const LAST_UPDATED = 'June 8, 2026';
const CONTACT = 'alomonds@gmail.com';

const PRIVACY = {
  intro: 'This Privacy Policy explains how InvoGo collects, uses, and protects your information. By using InvoGo you agree to the practices described here.',
  sections: [
    { h: 'Information we collect', b: 'Your sign-in email (handled by our authentication provider, Supabase) and the business data you enter: business name and phone, invoice details, customer/store names, store phone numbers and addresses, payment records, notes, and signatures. We do not collect payment card numbers, bank details, or government IDs, and the app does not process payments.' },
    { h: 'How your data is stored', b: 'Your data is stored in your account in Supabase and protected by per-user Row Level Security, so each account can only access its own data. A copy may also be cached locally on your device so the app works offline.' },
    { h: 'How we use your information', b: 'Solely to operate the app: creating, storing, and displaying your invoices and related records, syncing across your own devices, and keeping your account secure. We do not sell, rent, or share your data with advertisers.' },
    { h: 'Sharing of information', b: 'We share information only with service providers that run the app (such as Supabase), or when required by law. Any invoice you export or send (PDF, WhatsApp) is shared by you, at your direction, with recipients you choose.' },
    { h: 'Data retention & your rights', b: 'We keep your data while your account is active. You can delete individual records anytime, and you may request access, correction, export, or full account deletion by contacting us.' },
    { h: 'Security', b: 'We use encrypted connections, authentication, and Row Level Security to protect your data. No method of storage or transmission is 100% secure, so we cannot guarantee absolute security.' },
    { h: "Children's privacy", b: 'InvoGo is not directed to children under 13, and we do not knowingly collect their personal information.' },
  ],
};

const TERMS = {
  intro: 'These Terms govern your use of InvoGo. By using the app, you agree to them. If you do not agree, do not use the app.',
  sections: [
    { h: 'The service', b: 'InvoGo is a tool for creating, storing, and sharing delivery invoices and related business records. It helps you organize your own business information.' },
    { h: 'Your account', b: 'You are responsible for keeping your credentials secure and for all activity under your account, for providing accurate information, and for using the app in compliance with applicable laws.' },
    { h: 'Your data and content', b: 'You own the business data you enter. You grant us a limited license to store and process it solely to operate the app for you. You are responsible for the accuracy and lawfulness of the invoices you generate and send.' },
    { h: 'Acceptable use', b: 'Do not use the app for unlawful or deceptive purposes, attempt to access data belonging to other users, circumvent security, disrupt the service, or misuse it beyond what the law permits.' },
    { h: 'Invoices and financial records', b: 'InvoGo is a record-keeping and document tool. It does not process payments and does not provide accounting, tax, or financial advice. You are solely responsible for the correctness of your invoices and for meeting your own legal, tax, and accounting obligations.' },
    { h: 'Availability & backups', b: 'The app is provided "as is" and "as available." We do not guarantee it will be uninterrupted, error-free, or that data will never be lost. You are responsible for keeping your own backups of important data.' },
    { h: 'Disclaimer & liability', b: 'To the maximum extent permitted by law, the app is provided without warranties of any kind, and we are not liable for any indirect, incidental, or consequential damages, or for lost profits, revenue, data, or goodwill.' },
    { h: 'Termination', b: 'You may stop using the app anytime. We may suspend or terminate access if you violate these Terms or to protect the app and its users.' },
  ],
};

export default function Legal({ section = 'privacy', onOpenDrawer, onNav }) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;
  const [tab, setTab] = useState(section === 'terms' ? 'terms' : 'privacy');

  const doc = tab === 'terms' ? TERMS : PRIVACY;
  const title = tab === 'terms' ? 'Terms of Service' : 'Privacy Policy';

  return (
    <div style={{ ...s.page, background: C.bg }}>
      {/* Sticky header */}
      <div style={{ ...s.header, ...glassStyle(dark) }}>
        <button style={{ ...s.hamburger, color: C.text }} onClick={onOpenDrawer}>☰</button>
        <span style={{ ...s.title, color: C.text }}>Legal</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>
        {/* Segmented toggle */}
        <div style={{ ...s.toggle, background: C.card, borderColor: C.cardBorder }}>
          {[['privacy', 'Privacy'], ['terms', 'Terms']].map(([key, label]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  ...s.toggleBtn,
                  background: active ? ACCENT : 'transparent',
                  color: active ? '#fff' : C.textMuted,
                  fontWeight: active ? 700 : 600,
                }}
              >{label}</button>
            );
          })}
        </div>

        {/* Document */}
        <div style={{ ...s.card, background: C.card }}>
          <h2 style={{ ...s.docTitle, color: C.text }}>{title}</h2>
          <p style={{ ...s.updated, color: C.textMuted }}>Last updated: {LAST_UPDATED}</p>
          <p style={{ ...s.intro, color: C.textSub }}>{doc.intro}</p>

          {doc.sections.map((sec, i) => (
            <div key={i} style={{ marginTop: 16 }}>
              <p style={{ ...s.secHeading, color: C.text }}>{sec.h}</p>
              <p style={{ ...s.secBody, color: C.textMuted }}>{sec.b}</p>
            </div>
          ))}

          <div style={{ ...s.contactBox, background: dark ? '#1e1e1e' : '#f3f1ec' }}>
            <p style={{ ...s.secHeading, color: C.text, margin: 0 }}>Contact</p>
            <p style={{ ...s.secBody, color: C.textMuted, margin: '4px 0 0' }}>
              Questions or requests:{' '}
              <a href={`mailto:${CONTACT}`} style={{ color: ACCENT, textDecoration: 'none' }}>{CONTACT}</a>
            </p>
          </div>

          <p style={{ ...s.disclaimer, color: C.textLight }}>
            This is a general template provided for convenience and is not legal advice.
          </p>
        </div>

        <AppFooter onNav={onNav} />
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100%', display: 'flex', flexDirection: 'column', overflowX: 'clip' },
  header: {
    padding: '14px 20px 12px',
    paddingTop: 'max(14px, env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', gap: 14,
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
    padding: '3px 4px', WebkitTapHighlightColor: 'transparent', flexShrink: 0,
  },
  title: { flex: 1, fontSize: 18, fontWeight: 700, textAlign: 'center', letterSpacing: 0.2 },
  body: {
    padding: '12px 16px 88px', display: 'flex', flexDirection: 'column', gap: 12,
    maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box',
  },
  toggle: {
    display: 'flex', gap: 4, padding: 4, borderRadius: 12, border: '1px solid',
  },
  toggleBtn: {
    flex: 1, height: 38, border: 'none', borderRadius: 9, fontSize: 14,
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  card: { borderRadius: 16, padding: '20px 18px' },
  docTitle: { fontSize: 20, fontWeight: 800, margin: 0 },
  updated: { fontSize: 12, margin: '4px 0 14px' },
  intro: { fontSize: 14, lineHeight: 1.6, margin: 0 },
  secHeading: { fontSize: 14, fontWeight: 700, margin: 0 },
  secBody: { fontSize: 13, lineHeight: 1.6, margin: '4px 0 0' },
  contactBox: { borderRadius: 12, padding: '14px 16px', marginTop: 20 },
  disclaimer: { fontSize: 12, lineHeight: 1.5, fontStyle: 'italic', marginTop: 16 },
};
