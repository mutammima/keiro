import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Toggle } from '../components/ui/SettingsUI';
import EasyModeSetting from '../components/settings/EasyModeSetting';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { LIGHT } from '../theme';
import { STORAGE_KEYS, PLAN_COPY } from '../utils/constants';
import { givePro } from './helpers/givePro';

// EasyModeSetting reaches the Supabase client through storage.js -> db.js, which throws without a
// configured URL (CI has no .env). Same stand-in as planSettings.test.jsx.
vi.mock('../utils/storage', () => ({
  lsSet: vi.fn((key, value) => { localStorage.setItem(key, JSON.stringify(value)); return true; }),
}));

const wrap = (el) => render(<ThemeProvider>{el}</ThemeProvider>);
beforeEach(() => { localStorage.clear(); });

describe('Toggle', () => {
  // A switch drawn by sliding a knob has no state a screen reader can read: aria-pressed is what says on or off.
  it('says whether it is on: aria-pressed follows `on`', () => {
    const { rerender } = render(<Toggle on={false} onChange={() => {}} label="Lamp" />);
    expect(screen.getByRole('button', { name: 'Lamp' })).toHaveAttribute('aria-pressed', 'false');
    rerender(<Toggle on onChange={() => {}} label="Lamp" />);
    expect(screen.getByRole('button', { name: 'Lamp' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { pressed: true, name: 'Lamp' })).toBeInTheDocument();
  });
  it('a toggle with no `on` yet still says it is off (never a missing attribute)', () => {
    render(<Toggle onChange={() => {}} label="Lamp" />);
    expect(screen.getByRole('button', { name: 'Lamp' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('tapping it asks for the opposite', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Toggle on={false} onChange={onChange} label="Lamp" />);
    fireEvent.click(screen.getByRole('button', { name: 'Lamp' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
    rerender(<Toggle on onChange={onChange} label="Lamp" />);
    fireEvent.click(screen.getByRole('button', { name: 'Lamp' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});

describe('the Easy Mode switch', () => {
  const settings = () => wrap(<EasyModeSetting role="driver" C={LIGHT} dark={false} onChange={vi.fn()} />);
  // Only the switch has an on/off state: the section's own header button has none.
  const theSwitch = () => screen.getByRole('button', { name: PLAN_COPY.easySwitchLabel });

  it('says it is on for a free driver: the switch is locked on', () => {
    settings();
    expect(theSwitch()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });
  it('says it is off for a Pro driver who has not turned it on', () => {
    givePro();
    settings();
    expect(theSwitch()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { pressed: true })).toBeNull();
  });
  it('follows the stored flag for a Pro driver', () => {
    givePro();
    localStorage.setItem(STORAGE_KEYS.EASY_MODE, 'true');
    settings();
    expect(theSwitch()).toHaveAttribute('aria-pressed', 'true');
  });
  // WCAG 2.5.3 (label in name): a voice-control user says the words on screen.
  it('has an accessible name that includes the words shown beside it', () => {
    settings();
    const shown = screen.getByText('Simplified view').textContent;
    expect(theSwitch()).toHaveAccessibleName(expect.stringContaining(shown));
  });
  it('is the same words in the visible title and in the name: both come from PLAN_COPY', () => {
    const saved = { easySwitchText: PLAN_COPY.easySwitchText };
    PLAN_COPY.easySwitchText = 'Words!';
    try {
      const view = settings();
      expect(within(view.container).getByText('Words!')).toBeInTheDocument();
    } finally {
      Object.assign(PLAN_COPY, saved);
    }
  });
});
