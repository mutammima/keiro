/**
 * homeLimit.test.jsx
 *
 * Home's two "New Invoice" buttons (the header's + New and Quick Actions' + New Invoice) start a NEW invoice,
 * so, like Route's + New, they run under the free plan's limit: at 20 they open the limit sheet instead of the
 * form. (A free driver is in Easy Mode, which has no Home; every entry point still agrees.) The limit sheet
 * belongs to UpgradeHost, so "opens the limit sheet" is the EVENTS.OPEN_FREE_LIMIT event. Storage and the other
 * data modules are faked, so nothing here touches Supabase or needs a .env.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';

vi.mock('../utils/storage', () => ({
  getInvoices: vi.fn(async () => []),
  getBusinessName: vi.fn(() => 'Test Business'),
}));
vi.mock('../utils/storeOwnerStorage', () => ({
  getBridgeRequests: vi.fn(() => []),
  loadBridgeRequestsFromCloud: vi.fn(async () => []),
}));
vi.mock('../utils/connectionOrderStorage', () => ({
  getConnectionOrders: vi.fn(() => []),
  loadConnectionOrdersFromCloud: vi.fn(async () => []),
}));
vi.mock('../components/navigation/AppFooter', () => ({ default: () => null }));

import Home from '../pages/Home.jsx';
import { STORAGE_KEYS, EVENTS } from '../utils/constants';
import { seedFreePlan, monthNow } from './helpers/freePlan';

/** Renders Home once its welcome screen (the Quick Actions button) is up; returns onNav. */
async function renderHome() {
  const onNav = vi.fn();
  render(<ThemeProvider><Home onNav={onNav} /></ThemeProvider>);
  await screen.findByRole('button', { name: /New Invoice/ });
  return onNav;
}
/** The two buttons that start a new invoice: the header's + New and Quick Actions' + New Invoice. */
const newButtons = () => [screen.getByRole('button', { name: '+ New' }), screen.getByRole('button', { name: /New Invoice/ })];

const limitSheet = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.addEventListener(EVENTS.OPEN_FREE_LIMIT, limitSheet);
});
afterEach(() => {
  window.removeEventListener(EVENTS.OPEN_FREE_LIMIT, limitSheet);
});

describe('Home — New Invoice', () => {
  it('has the two buttons this file tests', async () => {
    await renderHome();
    expect(newButtons()).toHaveLength(2);
  });

  it.each([0, 1])('under the limit button %i goes on to the new invoice', async (i) => {
    seedFreePlan(19);
    const onNav = await renderHome();

    fireEvent.click(newButtons()[i]);

    expect(onNav).toHaveBeenCalledTimes(1);
    expect(onNav).toHaveBeenCalledWith('invoice');
    expect(limitSheet).not.toHaveBeenCalled();
  });

  it.each([0, 1])('at the limit button %i opens the limit sheet instead of the form', async (i) => {
    seedFreePlan(20);
    const onNav = await renderHome();

    fireEvent.click(newButtons()[i]);

    expect(limitSheet).toHaveBeenCalledTimes(1);
    expect(onNav).not.toHaveBeenCalled();
  });

  it.each([
    ['a Pro driver', () => localStorage.setItem(STORAGE_KEYS.PLAN_CACHE, JSON.stringify({ pro: true, source: 'manual', proUntil: null, usedThisMonth: 40, month: monthNow() }))],
    ['a guest', () => { seedFreePlan(40); localStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true'); }],
    ['a store owner', () => { seedFreePlan(40); localStorage.setItem(STORAGE_KEYS.USER_ROLE, JSON.stringify('store_owner')); }],
  ])('%s is never stopped by the plan', async (_who, setUp) => {
    setUp();
    const onNav = await renderHome();

    fireEvent.click(newButtons()[0]);
    fireEvent.click(newButtons()[1]);

    expect(onNav).toHaveBeenCalledTimes(2);
    expect(limitSheet).not.toHaveBeenCalled();
  });
});
