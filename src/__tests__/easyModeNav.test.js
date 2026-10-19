/**
 * easyModeNav.test.js
 *
 * Easy Mode (drivers) shows Route · Stores · Reports, Route first so the app
 * opens on it. Anything that navigates to a tab the current set hides (Home in
 * Easy Mode) must land on a real tab, not a blank overlay. Store owners never
 * get Easy Mode, even with the flag left on from a role switch.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { tabsForRole, tabIdsForRole, tabTargetFor } from '../components/navigation/tabs';
import { isEasyMode, easyModeFor, shareLabel } from '../utils/easyMode';
import { STORAGE_KEYS } from '../utils/constants';
import { givePro } from './helpers/givePro';

beforeEach(() => localStorage.clear());

describe('easyMode', () => {
  it('is off unless the stored flag is exactly true', () => {
    expect(isEasyMode()).toBe(false);
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    expect(isEasyMode()).toBe(true);
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'false');
    expect(isEasyMode()).toBe(false);
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, '{not json');
    expect(isEasyMode()).toBe(false);
  });

  it('never applies to store owners', () => {
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    expect(easyModeFor('driver')).toBe(true);
    expect(easyModeFor('store_owner')).toBe(false);
  });
});

describe('tab sets', () => {
  it('Easy driver tabs are Route, Stores, Reports — Home hidden, Route first', () => {
    expect(tabIdsForRole('driver', true)).toEqual(['route', 'stores', 'reports']);
    expect(tabsForRole('driver', true).map(t => t.label)).toEqual(['Route', 'Stores', 'Reports']);
  });

  it('full driver and store-owner tabs are unchanged', () => {
    expect(tabIdsForRole('driver', false)).toEqual(['home', 'route', 'stores', 'reports']);
    expect(tabIdsForRole('store_owner', true)).toEqual(['so-home', 'so-orders', 'so-drivers', 'so-invoices']);
  });

  it('gives a free driver the Easy tabs whatever the switch says', () => {
    // No plan answer on this phone is Free, and a free driver is always in Easy Mode.
    expect(tabIdsForRole('driver')).toEqual(['route', 'stores', 'reports']);
    expect(tabsForRole('driver').map(t => t.id)).toEqual(['route', 'stores', 'reports']);
  });

  it('reads the Easy Mode flag when not told, and ignores it for store owners', () => {
    givePro();   // a Pro driver follows the switch; without this the free default would hide a flag that is ignored
    expect(tabIdsForRole('driver')).toEqual(['home', 'route', 'stores', 'reports']);
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    expect(tabIdsForRole('driver')).toEqual(['route', 'stores', 'reports']);
    expect(tabsForRole('driver').map(t => t.id)).toEqual(['route', 'stores', 'reports']);
    expect(tabIdsForRole('store_owner')[0]).toBe('so-home');
  });

  it('returns stable references', () => {
    expect(tabIdsForRole('driver', true)).toBe(tabIdsForRole('driver', true));
    expect(tabsForRole('driver', true)).toBe(tabsForRole('driver', true));
  });
});

describe('tabTargetFor', () => {
  const easyTabs = ['route', 'stores', 'reports'];

  it('sends a tab the set hides to the set’s first tab', () => {
    expect(tabTargetFor(easyTabs, 'home')).toBe('route');
  });

  it('leaves visible tabs and overlay pages alone', () => {
    expect(tabTargetFor(easyTabs, 'stores')).toBe('stores');
    expect(tabTargetFor(easyTabs, 'products')).toBe('products');
    expect(tabTargetFor(easyTabs, 'invoice')).toBe('invoice');
    expect(tabTargetFor(['home', 'route', 'stores', 'reports'], 'home')).toBe('home');
  });
});

describe('shareLabel', () => {
  it('says Print / Share in Easy Mode, everywhere a PDF is shared', () => {
    expect(shareLabel('Share PDF')).toBe('Share PDF');
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    expect(shareLabel('Share PDF')).toBe('Print / Share');
    expect(shareLabel('Share')).toBe('Print / Share');
  });
});
