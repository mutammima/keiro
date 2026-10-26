/**
 * deleteAccount.test.jsx
 *
 * Apple requires that an account can be deleted from inside the app. The server
 * deletes everything at once (delete_my_account(), supabase-account-deletion.sql);
 * the phone's account data is cleared only after the server confirms, so a
 * failure (offline, or the SQL not run yet) never costs the person anything.
 * The red button needs DELETE typed: a Google account has no password to ask.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: {
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
  },
}));

import { supabase } from '../services/supabase';
import { deleteAccount } from '../services/auth';
import DeleteAccountSheet from '../components/settings/DeleteAccountSheet';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { STORAGE_KEYS, CONTACT_EMAIL } from '../utils/constants';
import { givePro } from './helpers/givePro';

const ok = { data: null, error: null };
const seedAccount = () => {
  localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify([{ number: 1001 }]));
  localStorage.setItem(STORAGE_KEYS.USER_ROLE, JSON.stringify('driver'));
  localStorage.setItem(STORAGE_KEYS.DARK_MODE, JSON.stringify(true)); // a device preference
};

beforeEach(() => {
  localStorage.clear();
  supabase.rpc.mockReset();
  supabase.auth.signOut.mockClear();
  seedAccount();
});

describe('deleteAccount', () => {
  it('asks the server to delete the account, then ends this session and clears the account data', async () => {
    supabase.rpc.mockResolvedValue(ok);

    const result = await deleteAccount();

    expect(result).toEqual({ error: null, unavailable: false });
    expect(supabase.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }); // the server no longer has this user
    expect(localStorage.getItem(STORAGE_KEYS.LIST)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.DARK_MODE)).toBe('true');      // the phone's own setting stays
  });

  it('when the server refuses, nothing on the phone is cleared and the session stays', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'boom' } });

    const result = await deleteAccount();

    expect(result.error).toBeTruthy();
    expect(result.unavailable).toBe(false);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.LIST)).not.toBeNull();
  });

  it('offline (the request throws), nothing is cleared either', async () => {
    supabase.rpc.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await deleteAccount();

    expect(result.error).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEYS.LIST)).not.toBeNull();
  });

  it("says when the server can't delete accounts yet (its SQL not run)", async () => {
    for (const code of ['PGRST202', '42883']) {
      supabase.rpc.mockResolvedValue({ data: null, error: { code, message: 'function not found' } });
      expect((await deleteAccount()).unavailable).toBe(true);
    }
    expect(localStorage.getItem(STORAGE_KEYS.LIST)).not.toBeNull();
  });
});

describe('the Delete account sheet', () => {
  const open = (props = {}) => render(
    <ThemeProvider><DeleteAccountSheet onClose={vi.fn()} onDeleted={vi.fn()} {...props} /></ThemeProvider>
  );
  const deleteButton = () => screen.getByRole('button', { name: 'Delete account' });
  const type = (text) => fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: text } });

  it('the red button waits for DELETE, in any case, spaces around it ignored', () => {
    open();
    expect(deleteButton()).toBeDisabled();
    type('delet');
    expect(deleteButton()).toBeDisabled();
    type(' delete ');
    expect(deleteButton()).toBeEnabled();
  });

  it('a driver is told how many connected stores lose the invoices they were sent', () => {
    localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify([
      { id: 'c1', status: 'active' }, { id: 'c2', status: 'active' }, { id: 'c3', status: 'pending' },
    ]));
    open();
    expect(screen.getByText("The 2 stores you're connected to will lose the invoices you sent them.")).toBeInTheDocument();
  });

  it('a store owner is told how many connected drivers lose the orders they were sent', () => {
    localStorage.setItem(STORAGE_KEYS.USER_ROLE, JSON.stringify('store_owner'));
    localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify([{ id: 'c1', status: 'active' }]));
    open();
    expect(screen.getByText("The 1 driver you're connected to will lose the orders you sent them.")).toBeInTheDocument();
  });

  it('with no connections there is no such line, and a Pro account is told its plan ends', () => {
    givePro();
    open();
    expect(screen.queryByText(/you're connected to/)).toBeNull();
    expect(screen.getByText('Your Pro plan ends.')).toBeInTheDocument();
  });

  it('deleting: the server confirms, the sheet says so, then the app restarts', async () => {
    supabase.rpc.mockResolvedValue(ok);
    const onDeleted = vi.fn();
    open({ onDeleted });
    type('DELETE');
    fireEvent.click(deleteButton());

    expect(await screen.findByText('Your account was deleted.')).toBeInTheDocument();
    await waitFor(() => expect(onDeleted).toHaveBeenCalled(), { timeout: 3000 });
    expect(localStorage.getItem(STORAGE_KEYS.LIST)).toBeNull();
  });

  it('a failure says nothing was deleted, keeps everything, and lets them try again', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    const onDeleted = vi.fn();
    open({ onDeleted });
    type('DELETE');
    fireEvent.click(deleteButton());

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete your account. Nothing was deleted.");
    expect(onDeleted).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.LIST)).not.toBeNull();
    expect(deleteButton()).toBeEnabled();
  });

  it('before the server can delete accounts, it says to email instead', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    open();
    type('DELETE');
    fireEvent.click(deleteButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(`Email ${CONTACT_EMAIL}`);
  });

  it('Escape or Cancel closes it', () => {
    const onClose = vi.fn();
    open({ onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
