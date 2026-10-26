/**
 * marketplaceLocation.test.js
 *
 * A Marketplace post (a driver listing or a store request) is readable by every
 * signed-in Keiro user, and it carries the location the phone had when it was
 * made. That location used to go up exactly as the GPS gave it, which can point
 * at someone's home. It now goes up rounded to about 1 km, enough for "near me".
 *
 * A post made without location permission also used to go up at 0°, 0°
 * (Number(null) is 0), so its distance read thousands of miles. It goes up with
 * no location now.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let sent;
vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-a' } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
    from: vi.fn(() => {
      const q = {
        upsert: (row) => { sent = row; return q; },
        select: () => q,
        single: () => Promise.resolve({ data: sent, error: null }),
      };
      return q;
    }),
  },
}));

import { saveMarketplaceListing, saveMarketplaceDemand } from '../services/db';
import { publicCoord } from '../utils/geo';

beforeEach(() => { sent = undefined; });

const HOME = { lat: 40.712776, lng: -74.005974 }; // a GPS fix, to the metre

describe('the location saved with a Marketplace post', () => {
  it('a driver listing goes up rounded to about 1 km', async () => {
    await saveMarketplaceListing({ id: 'l1', productName: 'Milk', ...HOME });
    expect(sent).toMatchObject({ lat: 40.71, lng: -74.01 });
  });

  it('a store request goes up rounded to about 1 km', async () => {
    await saveMarketplaceDemand({ id: 'd1', productName: 'Milk', ...HOME });
    expect(sent).toMatchObject({ lat: 40.71, lng: -74.01 });
  });

  it('a post made without location goes up with none, not at 0°, 0°', async () => {
    await saveMarketplaceListing({ id: 'l2', productName: 'Milk', lat: null, lng: null });
    expect(sent.lat).toBeNull();
    expect(sent.lng).toBeNull();
    await saveMarketplaceDemand({ id: 'd2', productName: 'Milk' });
    expect(sent.lat).toBeNull();
    expect(sent.lng).toBeNull();
  });
});

describe('publicCoord', () => {
  it('keeps two decimals, and a real 0 stays 0', () => {
    expect(publicCoord(51.507351)).toBe(51.51);
    expect(publicCoord('-0.127758')).toBe(-0.13);
    expect(publicCoord(0)).toBe(0);
  });

  it('nothing, or something that is not a number, is null', () => {
    for (const v of [null, undefined, '', 'abc', NaN, Infinity]) expect(publicCoord(v)).toBeNull();
  });
});
