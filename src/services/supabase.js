/**
 * supabase.js — initialises and exports a single Supabase client instance.
 *
 * Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.
 * See SUPABASE_SETUP.md for full setup instructions.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl === 'YOUR_SUPABASE_URL_HERE') {
  console.warn('[Keiro] Supabase URL not configured. Set VITE_SUPABASE_URL in .env');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnon || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
