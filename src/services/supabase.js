/**
 * supabase.js — initialises and exports a single Supabase client instance.
 *
 * Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.
 * See SUPABASE_SETUP.md for full setup instructions.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * False when this build was made without its Supabase settings (a Vercel
 * environment missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). main.jsx
 * then shows MissingConfig instead of the app.
 */
export const SUPABASE_CONFIGURED =
  Boolean(supabaseUrl) && supabaseUrl !== 'YOUR_SUPABASE_URL_HERE' && Boolean(supabaseAnon);

if (!SUPABASE_CONFIGURED) {
  console.warn('[Keiro] Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

// createClient throws on an empty URL or key, and that throw used to happen while
// the app's modules were still loading: a blank page with no word of why (a
// Vercel preview built without these settings did exactly that). Without them the
// client points nowhere instead, so the app can load far enough to say so.
export const supabase = createClient(
  SUPABASE_CONFIGURED ? supabaseUrl : 'https://supabase-not-configured.invalid',
  SUPABASE_CONFIGURED ? supabaseAnon : 'not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
