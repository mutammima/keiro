/**
 * A build without its Supabase settings used to throw while the app's modules
 * loaded ("supabaseUrl is required."), leaving a blank page. It now loads and
 * says what's missing (supabase.js SUPABASE_CONFIGURED, MissingConfig).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MissingConfig from '../components/ui/MissingConfig.jsx';

async function loadClient(url, key) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', url);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', key);
  return import('../services/supabase.js');
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Supabase settings', () => {
  it('missing: the client still loads, and says it is not configured', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await loadClient('', '');
    expect(mod.SUPABASE_CONFIGURED).toBe(false);
    expect(mod.supabase).toBeTruthy();
  });

  it('a URL without its key counts as missing too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await loadClient('https://abcdefghijklmnopqrst.supabase.co', '');
    expect(mod.SUPABASE_CONFIGURED).toBe(false);
  });

  it('present: configured', async () => {
    const mod = await loadClient('https://abcdefghijklmnopqrst.supabase.co', 'anon-key');
    expect(mod.SUPABASE_CONFIGURED).toBe(true);
  });
});

describe('MissingConfig', () => {
  it('names the two settings and where to add them', () => {
    render(<MissingConfig />);
    expect(screen.getByRole('alert')).toHaveTextContent("Keiro can't start");
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_ANON_KEY')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Vercel → Settings → Environment Variables/);
  });
});
