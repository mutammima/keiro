/**
 * deleteAccountEntry.test.jsx — where Delete account lives (owner decision
 * 2026-10-26): Settings → Security & Permissions, and the Profile page. Only a
 * signed-in account has one to delete; a guest's data goes with Sign out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

let session = null;
let user = null;
vi.mock('../services/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn(async () => ({ data: { session } })),
      getUser: vi.fn(async () => ({ data: { user } })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
      storageKey: 'sb-test-auth-token',
    },
  },
}));

import Settings from '../pages/Settings';
import Profile from '../pages/Profile';
import { ThemeProvider } from '../context/ThemeContext.jsx';

const SIGNED_IN = { user: { id: 'u1', email: 'driver@example.com' } };

const openSettings = () => render(
  <ThemeProvider>
    <Settings onOpenDrawer={() => {}} onNav={() => {}} onClose={() => {}} onSwitchRole={() => {}} onReplayTutorial={() => {}} />
  </ThemeProvider>,
);
const openSecurity = () => fireEvent.click(screen.getByRole('button', { name: /^Security & Permissions/ }));
const openProfile = () => render(<ThemeProvider><Profile onOpenDrawer={() => {}} onNav={() => {}} /></ThemeProvider>);

beforeEach(() => { localStorage.clear(); session = null; user = null; });

describe('Settings → Security & Permissions', () => {
  it('a signed-in account has Delete account, and it opens the sheet', async () => {
    session = SIGNED_IN;
    openSettings();
    openSecurity();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog', { name: 'Delete your Keiro account?' })).toBeInTheDocument();
  });

  it('a guest has none', async () => {
    openSettings();
    openSecurity();
    await screen.findByText('Switch Role');
    expect(screen.queryByText('Delete account')).toBeNull();
  });
});

describe('Profile', () => {
  it('a signed-in account has Delete account, and it opens the sheet', async () => {
    user = SIGNED_IN.user;
    openProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    expect(screen.getByRole('dialog', { name: 'Delete your Keiro account?' })).toBeInTheDocument();
  });

  it('a guest has none', async () => {
    openProfile();
    await screen.findByText('Guest (not signed in)');
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
  });
});
