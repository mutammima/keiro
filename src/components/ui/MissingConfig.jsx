/**
 * MissingConfig — what a build without its Supabase settings shows instead of
 * the app (main.jsx, SUPABASE_CONFIGURED). It used to be a blank page.
 *
 * It renders before ThemeProvider and everything else, so it reads nothing from
 * storage or context: dark tokens (the default theme), plain inline styles.
 */

import { DARK } from '../../theme';

export default function MissingConfig() {
  return (
    <div role="alert" style={{ ...s.page, background: DARK.bg }}>
      <div style={{ ...s.card, background: DARK.card, borderColor: DARK.cardBorder }}>
        <div style={{ ...s.title, color: DARK.text }}>Keiro can&apos;t start</div>
        <p style={{ ...s.text, color: DARK.textSub }}>
          This copy of Keiro was built without its server settings, so it can&apos;t sign in or save anything.
        </p>
        <p style={{ ...s.text, color: DARK.textMuted }}>
          If you run Keiro: add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to this
          deployment&apos;s environment (Vercel → Settings → Environment Variables), then redeploy.
        </p>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))',
    boxSizing: 'border-box', fontFamily: 'inherit',
  },
  card: { width: '100%', maxWidth: 420, border: '1px solid', borderRadius: 18, padding: '22px 20px' },
  title: { fontSize: 20, fontWeight: 800, marginBottom: 10 },
  text: { fontSize: 15, lineHeight: 1.5, margin: '0 0 10px', overflowWrap: 'anywhere' },
};
