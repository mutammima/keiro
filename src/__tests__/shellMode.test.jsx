/**
 * shellMode.test.jsx
 *
 * The shell decides its mode once per mount (App.jsx) and hands it down. TopNav and
 * NavDrawer follow the mode they are given, not a later change of the plan cache:
 * re-reading it on every render swapped the tabs and the ☰ menu under the driver
 * (and, in App, the invoice screen) as soon as a plan answer landed, while the
 * reload that should rebuild the shell was still waiting for an invoice to close.
 * Callers that pass no mode (other screens, older tests) still get easyModeFor(role).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { EVENTS } from '../utils/constants';
import { givePro } from './helpers/givePro';

vi.mock('../hooks/useSafeSignOut', () => ({
  useSafeSignOut: () => ({ requestSignOut: vi.fn(), signOutPrompt: null, signingOut: false }),
}));
vi.mock('../utils/storage', () => ({ getPinnedStores: () => [] }));

import TopNav from '../components/navigation/TopNav.jsx';
import NavDrawer from '../components/navigation/NavDrawer.jsx';

const FULL_TABS = ['home', 'route', 'stores', 'reports'];
const EASY_TABS = ['route', 'stores', 'reports'];
const FULL_MENU = ['Products', 'Store Info', 'Marketplace', 'My Listings', 'Notes'];
const HIDDEN_IN_EASY = ['Store Info', 'Marketplace', 'My Listings', 'Notes'];

// TopNav's tab strip and the docked rail's tab list both render <button data-qs-tab="id">.
const tabIds = (container) => [...container.querySelectorAll('[data-qs-tab]')].map(b => b.getAttribute('data-qs-tab'));
// What plan.js does when a fresh answer lands (the cache is already rewritten by then).
const planChanged = () => act(() => { window.dispatchEvent(new CustomEvent(EVENTS.PLAN_CHANGE)); });

beforeEach(() => localStorage.clear());   // no plan answer on this phone: Free, which easyModeFor() reads as Easy Mode

describe('TopNav takes its tabs from the mode it is given', () => {
  const nav = (props) => (
    <ThemeProvider><TopNav currentPage="route" onNav={vi.fn()} onOpenDrawer={vi.fn()} role="driver" {...props} /></ThemeProvider>
  );

  it('a shell built in normal mode keeps its four tabs after the plan turns Free', () => {
    const { container, rerender } = render(nav({ easyMode: false }));
    expect(tabIds(container)).toEqual(FULL_TABS);
    planChanged();
    rerender(nav({ easyMode: false }));
    expect(tabIds(container)).toEqual(FULL_TABS);
  });

  it('a shell built in Easy Mode keeps its three tabs after the plan turns Pro', () => {
    const { container, rerender } = render(nav({ easyMode: true }));
    expect(tabIds(container)).toEqual(EASY_TABS);
    givePro();
    planChanged();
    rerender(nav({ easyMode: true }));
    expect(tabIds(container)).toEqual(EASY_TABS);
  });

  it('without a mode it still asks easyModeFor, as before: Free is Easy, Pro follows the switch', () => {
    const free = render(nav({}));
    expect(tabIds(free.container)).toEqual(EASY_TABS);
    free.unmount();
    givePro();
    const pro = render(nav({}));
    expect(tabIds(pro.container)).toEqual(FULL_TABS);
  });

  it('a store owner always gets the owner tabs, whatever mode it is handed', () => {
    const { container } = render(nav({ role: 'store_owner', easyMode: true }));
    expect(tabIds(container)).toEqual(['so-home', 'so-orders', 'so-drivers', 'so-invoices']);
  });
});

describe('NavDrawer takes its menu and tabs from the mode it is given', () => {
  const drawer = (props) => (
    <ThemeProvider>
      <NavDrawer open onClose={vi.fn()} onNav={vi.fn()} onSwitchRole={vi.fn()} currentPage="route" role="driver" {...props} />
    </ThemeProvider>
  );

  it('the ☰ menu of a shell built in normal mode stays full after the plan turns Free', () => {
    const { rerender } = render(drawer({ easyMode: false }));
    for (const item of FULL_MENU) expect(screen.getByText(item)).toBeInTheDocument();
    planChanged();
    rerender(drawer({ easyMode: false }));
    for (const item of FULL_MENU) expect(screen.getByText(item)).toBeInTheDocument();
  });

  it('the ☰ menu of a shell built in Easy Mode stays short after the plan turns Pro', () => {
    const { rerender } = render(drawer({ easyMode: true }));
    expect(screen.getByText('Products')).toBeInTheDocument();
    givePro();
    planChanged();
    rerender(drawer({ easyMode: true }));
    expect(screen.getByText('Products')).toBeInTheDocument();
    for (const hidden of HIDDEN_IN_EASY) expect(screen.queryByText(hidden)).toBeNull();
  });

  it('the docked rail keeps the tabs its shell was built with', () => {
    const full = render(drawer({ docked: true, easyMode: false }));      // Free cache, normal-mode shell
    expect(tabIds(full.container)).toEqual(FULL_TABS);
    planChanged();
    full.rerender(drawer({ docked: true, easyMode: false }));
    expect(tabIds(full.container)).toEqual(FULL_TABS);
    full.unmount();

    givePro();                                                            // Pro cache, Easy-mode shell
    const easy = render(drawer({ docked: true, easyMode: true }));
    expect(tabIds(easy.container)).toEqual(EASY_TABS);
    planChanged();
    easy.rerender(drawer({ docked: true, easyMode: true }));
    expect(tabIds(easy.container)).toEqual(EASY_TABS);
  });

  it('without a mode it still asks easyModeFor, as before (the menu and the docked tabs)', () => {
    const free = render(drawer({ docked: true }));
    expect(tabIds(free.container)).toEqual(EASY_TABS);
    expect(screen.queryByText('Store Info')).toBeNull();
    free.unmount();
    givePro();
    const pro = render(drawer({ docked: true }));
    expect(tabIds(pro.container)).toEqual(FULL_TABS);
    expect(screen.getByText('Store Info')).toBeInTheDocument();
  });
});
