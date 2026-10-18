/**
 * easyModeMenu.test.jsx
 *
 * Easy Mode's ☰ menu keeps Products (where the driver fixes a remembered name
 * or price) and hides Store Info, Marketplace, My Listings and Notes. The
 * Settings switch says exactly what Easy Mode does, and store owners — for
 * whom it does nothing — don't get it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { LIGHT } from '../theme';
import { STORAGE_KEYS } from '../utils/constants';

vi.mock('../hooks/useSafeSignOut', () => ({
  useSafeSignOut: () => ({ requestSignOut: vi.fn(), signOutPrompt: null, signingOut: false }),
}));
vi.mock('../utils/storage', () => ({
  getPinnedStores: () => [],
  // Mirrors storage.lsSet: JSON-encode, report whether it was stored.
  lsSet: vi.fn((key, value) => { localStorage.setItem(key, JSON.stringify(value)); return true; }),
}));

import NavDrawer from '../components/navigation/NavDrawer.jsx';
import EasyModeSetting, { EASY_MODE_DESCRIPTION } from '../components/settings/EasyModeSetting.jsx';
import { lsSet } from '../utils/storage';
import { givePro } from './helpers/givePro';

function renderDrawer(role) {
  render(
    <ThemeProvider>
      <NavDrawer open onClose={vi.fn()} onNav={vi.fn()} currentPage="route" role={role} />
    </ThemeProvider>
  );
}

beforeEach(() => localStorage.clear());

describe('☰ menu', () => {
  it('Easy Mode keeps Products and hides the advanced pages', () => {
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    renderDrawer('driver');
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    for (const hidden of ['Store Info', 'Marketplace', 'My Listings', 'Notes']) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
  });

  it('full mode is unchanged', () => {
    givePro();
    renderDrawer('driver');
    for (const item of ['Products', 'Store Info', 'Marketplace', 'My Listings', 'Notes']) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it('a store owner with the flag still on gets the owner menu', () => {
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    renderDrawer('store_owner');
    expect(screen.getByText('Find Drivers')).toBeInTheDocument();
    expect(screen.queryByText('Products')).toBeNull();
  });
});

describe('Settings → Easy Mode', () => {
  it('says exactly what Easy Mode does', () => {
    expect(EASY_MODE_DESCRIPTION).toBe(
      'Scan items to make invoices. Shows Route, Stores and Reports, with Products and Settings in the menu. Hides Home, Store Info, Marketplace, My Listings and Notes.'
    );
    render(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={vi.fn()} />);
    expect(screen.getByText(EASY_MODE_DESCRIPTION)).toBeInTheDocument();
  });

  it('turning it on stores the flag and reloads', () => {
    const onChange = vi.fn();
    render(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={onChange} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]); // the toggle (the first button is the section header)
    expect(localStorage.getItem(STORAGE_KEYS.EASY_MODE)).toBe('true');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('writes through lsSet (which frees space on a full phone), and does not reload if nothing was saved', () => {
    lsSet.mockReturnValueOnce(false);
    const onChange = vi.fn();
    render(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={onChange} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(lsSet).toHaveBeenCalledWith(STORAGE_KEYS.EASY_MODE, true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is not shown to store owners', () => {
    const { container } = render(<EasyModeSetting role="store_owner" C={LIGHT} dark={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
