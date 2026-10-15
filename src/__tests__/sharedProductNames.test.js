/**
 * sharedProductNames.test.js
 *
 * The app asks Supabase what other drivers call a barcode, and which names
 * they use that contain typed text (supabase-shared-product-names.sql). Only
 * signed-in users ask; any error (including the functions not existing yet,
 * before the SQL is run) means "no shared name", never a broken scan.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

let supabase, storage;
beforeEach(async () => {
  vi.resetModules();
  ({ supabase } = await import('../services/supabase'));
  supabase.auth.getUser.mockReset();
  supabase.rpc.mockReset();
  storage = await import('../utils/storage');
});
const signedIn = () => supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
const signedOut = () => supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

describe('shared product names', () => {
  it('asks Supabase for the barcode\'s shared name when signed in', async () => {
    signedIn();
    supabase.rpc.mockResolvedValue({ data: '  Mobil 1 5W-30 5qt ', error: null });
    expect(await storage.getSharedProductName('071924145009')).toBe('Mobil 1 5W-30 5qt');
    expect(supabase.rpc).toHaveBeenCalledWith('shared_product_name', { p_barcode: '071924145009' });
  });

  it('a guest never asks', async () => {
    signedOut();
    expect(await storage.getSharedProductName('071924145009')).toBeNull();
    expect(await storage.getSharedProductSuggestions('mobil')).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('an RPC error means no shared name (e.g. before the SQL is run)', async () => {
    signedIn();
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await storage.getSharedProductName('071924145009')).toBeNull();
    expect(await storage.getSharedProductSuggestions('mobil')).toEqual([]);
  });

  it('a thrown network error means no shared name', async () => {
    signedIn();
    supabase.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await storage.getSharedProductName('071924145009')).toBeNull();
    expect(await storage.getSharedProductSuggestions('mobil')).toEqual([]);
  });

  it('nobody has named it → null', async () => {
    signedIn();
    supabase.rpc.mockResolvedValue({ data: null, error: null });
    expect(await storage.getSharedProductName('0071181000240')).toBeNull();
  });

  it('suggestions come back trimmed, blanks dropped', async () => {
    signedIn();
    supabase.rpc.mockResolvedValue({ data: ['Mobil 1 5W-30 5qt ', '', '  ', 'Mobil 1 0W-20'], error: null });
    expect(await storage.getSharedProductSuggestions('mobil')).toEqual(['Mobil 1 5W-30 5qt', 'Mobil 1 0W-20']);
    expect(supabase.rpc).toHaveBeenCalledWith('suggest_product_names', { p_query: 'mobil' });
  });
});
