/**
 * The Upgrade and limit sheets. Payments aren't built yet (owner decision
 * 2026-10-17): the Upgrade sheet shows what Pro adds and its price, and says
 * payments are coming soon. Nothing is sent anywhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

vi.mock('../utils/plan', () => ({ resetDateLabel: vi.fn(() => 'Nov 1') }));

import UpgradeHost from '../components/plan/UpgradeHost';
import UpgradeSheet from '../components/plan/UpgradeSheet';
import { ThemeProvider } from '../context/ThemeContext.jsx';
import { EVENTS, PLAN_COPY } from '../utils/constants';
import { resetDateLabel } from '../utils/plan';

const fire = (name, detail) => act(() => { window.dispatchEvent(new CustomEvent(name, { detail })); });
const host = () => render(<ThemeProvider><UpgradeHost /></ThemeProvider>);

beforeEach(() => {
  globalThis.fetch = vi.fn();
  vi.mocked(resetDateLabel).mockReturnValue('Nov 1');
});

describe('UpgradeHost', () => {
  it('the Upgrade sheet shows what Pro adds, its price, and that payments are coming soon', () => {
    host();
    fire(EVENTS.OPEN_UPGRADE, {});
    expect(screen.getByText('Keiro Pro')).toBeInTheDocument();
    for (const perk of PLAN_COPY.perks) expect(screen.getByText(perk)).toBeInTheDocument();
    expect(screen.getByText('$4.99 a month or $49.99 a year')).toBeInTheDocument();
    expect(screen.getByText('Payments are coming soon.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByText('Keiro Pro')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a custom title (the locked Easy Mode switch)', () => {
    host();
    fire(EVENTS.OPEN_UPGRADE, { title: PLAN_COPY.normalModeTitle });
    expect(screen.getByText(PLAN_COPY.normalModeTitle)).toBeInTheDocument();
    expect(screen.getByText('Payments are coming soon.')).toBeInTheDocument();
  });

  it('the limit sheet says when the free invoices come back, and Upgrade opens the Upgrade sheet', () => {
    host();
    fire(EVENTS.OPEN_FREE_LIMIT);
    expect(screen.getByText(PLAN_COPY.limitTitle)).toBeInTheDocument();
    expect(screen.getByText('They reset Nov 1.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(screen.queryByText(PLAN_COPY.limitTitle)).toBeNull();
    expect(screen.getByText('Payments are coming soon.')).toBeInTheDocument();
  });

  it('Not now closes the limit sheet', () => {
    host();
    fire(EVENTS.OPEN_FREE_LIMIT);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText(PLAN_COPY.limitTitle)).toBeNull();
  });
});

describe('UpgradeHost: when it opens', () => {
  it('shows nothing until it is asked', () => {
    host();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('an Upgrade event with no detail at all (the sync banner sends one) shows the plain sheet', () => {
    host();
    fire(EVENTS.OPEN_UPGRADE);
    expect(screen.getByRole('dialog', { name: 'Keiro Pro' })).toBeInTheDocument();
    expect(screen.getByText('Payments are coming soon.')).toBeInTheDocument();
  });

  it('each opening has its own title: the locked switch\'s title does not stick to the next Upgrade', () => {
    host();
    fire(EVENTS.OPEN_UPGRADE, { title: PLAN_COPY.normalModeTitle });
    expect(screen.getByRole('dialog', { name: PLAN_COPY.normalModeTitle })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    fire(EVENTS.OPEN_UPGRADE, {});
    expect(screen.getByRole('dialog', { name: 'Keiro Pro' })).toBeInTheDocument();
    expect(screen.queryByText(PLAN_COPY.normalModeTitle)).toBeNull();
  });

  it('the latest Upgrade event decides the title, even with a sheet already open', () => {
    host();
    fire(EVENTS.OPEN_UPGRADE, { title: PLAN_COPY.normalModeTitle });
    fire(EVENTS.OPEN_UPGRADE, {});
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Keiro Pro' })).toBeInTheDocument();
    expect(screen.queryByText(PLAN_COPY.normalModeTitle)).toBeNull();
  });

  // openUpgrade(title) puts whatever it is given in the event. onClick={openUpgrade} hands it the click event,
  // and a title that is an object would crash the whole app shell when it was drawn.
  it.each([
    ['a click event', { type: 'click', target: {} }],
    ['a number', 42],
    ['a list', ['Keiro', 'Pro']],
  ])('a title that is not text (%s) falls back to Keiro Pro', (_name, title) => {
    host();
    fire(EVENTS.OPEN_UPGRADE, { title });
    expect(screen.getByRole('dialog', { name: 'Keiro Pro' })).toBeInTheDocument();
    expect(screen.getByText('Keiro Pro')).toBeInTheDocument();
  });

  // Unlike the one-time plan notes (only OK clears those), these two sheets can be dismissed with a tap outside:
  // nothing is lost by closing them, and the Upgrade button opens them again.
  it('a tap outside the Upgrade sheet closes it', () => {
    host();
    fire(EVENTS.OPEN_UPGRADE);
    fireEvent.click(screen.getByText('Payments are coming soon.'));   // inside: stays
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog').parentElement);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a tap outside the limit sheet closes it', () => {
    host();
    fire(EVENTS.OPEN_FREE_LIMIT);
    fireEvent.click(screen.getByRole('dialog').parentElement);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Not now opens nothing else: it is a way out, not a way to Upgrade', () => {
    host();
    fire(EVENTS.OPEN_FREE_LIMIT);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the reset date is the one resetDateLabel gives when the limit sheet opens', () => {
    host();
    vi.mocked(resetDateLabel).mockReturnValue('Dec 1');
    fire(EVENTS.OPEN_FREE_LIMIT);
    expect(screen.getByText('They reset Dec 1.')).toBeInTheDocument();
  });

  it('asking for Upgrade while the limit sheet is open leaves only the Upgrade sheet', () => {
    host();
    fire(EVENTS.OPEN_FREE_LIMIT);
    fire(EVENTS.OPEN_UPGRADE);
    expect(screen.queryByText(PLAN_COPY.limitTitle)).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('Payments are coming soon.')).toBeInTheDocument();
  });

  // PlanSheet has no focus trap, so a keyboard user can Tab to + New behind an open Upgrade sheet and press Enter.
  it('asking for the limit sheet while the Upgrade sheet is open leaves only the limit sheet', () => {
    host();
    fire(EVENTS.OPEN_UPGRADE);
    fire(EVENTS.OPEN_FREE_LIMIT);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: PLAN_COPY.limitTitle })).toBeInTheDocument();
    expect(screen.queryByText('Payments are coming soon.')).toBeNull();
  });

  it('from the limit sheet, Upgrade opens the plain Keiro Pro sheet and nothing else, and sends nothing', () => {
    host();
    fire(EVENTS.OPEN_FREE_LIMIT);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Keiro Pro' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops listening when it unmounts (the shell is rebuilt on a role switch)', () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    try {
      const { unmount } = host();
      unmount();
      for (const name of [EVENTS.OPEN_UPGRADE, EVENTS.OPEN_FREE_LIMIT]) {
        const handlers = added.mock.calls.filter(([n]) => n === name).map(([, h]) => h);
        expect(handlers).toHaveLength(1);
        expect(removed.mock.calls.filter(([n, h]) => n === name && h === handlers[0])).toHaveLength(1);
      }
    } finally {
      added.mockRestore();
      removed.mockRestore();
    }
  });
});

describe('the Upgrade sheet for a screen reader', () => {
  it('the perks are a list of exactly the perks, and the ✓ marks are decoration', () => {
    host();
    fire(EVENTS.OPEN_UPGRADE);
    // list-style: none makes VoiceOver drop a <ul>'s list semantics unless the role is spelled out.
    const list = screen.getByRole('list');
    expect(list).toHaveAttribute('role', 'list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(PLAN_COPY.perks.length);
    items.forEach((item, i) => {
      const marks = [...item.querySelectorAll('span')].filter(span => span.textContent === '✓');
      expect(marks).toHaveLength(1);
      expect(marks[0]).toHaveAttribute('aria-hidden', 'true');
      expect(item).toHaveTextContent(PLAN_COPY.perks[i]);
    });
  });
});

describe('UpgradeHost: keyboard and focus', () => {
  // The button that was in use when the sheet was asked for: + New, Make invoice, an Upgrade link.
  const withTrigger = () => {
    render(<ThemeProvider><button type="button">+ New</button><UpgradeHost /></ThemeProvider>);
    const trigger = screen.getByRole('button', { name: '+ New' });
    trigger.focus();
    return trigger;
  };

  it('the Upgrade sheet takes focus (its OK), Escape closes it, and focus goes back', () => {
    const trigger = withTrigger();
    fire(EVENTS.OPEN_UPGRADE);
    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('the limit sheet takes focus (its Upgrade), and Escape closes it like Not now', () => {
    const trigger = withTrigger();
    fire(EVENTS.OPEN_FREE_LIMIT);
    expect(screen.getByRole('button', { name: 'Upgrade' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('limit sheet, then Upgrade, then OK: focus ends where it began, not on a sheet that is gone', () => {
    const trigger = withTrigger();
    fire(EVENTS.OPEN_FREE_LIMIT);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

describe('the sheets take every word from PLAN_COPY', () => {
  // Swap the copy for sentinels: a message typed into a component would not change.
  function withCopy(swapped, check) {
    const saved = Object.fromEntries(Object.keys(swapped).map(k => [k, PLAN_COPY[k]]));
    Object.assign(PLAN_COPY, swapped);
    try { check(); } finally { Object.assign(PLAN_COPY, saved); }
  }

  it('the Upgrade sheet: title, perks, price line, coming-soon line and OK', () => {
    withCopy({ upgradeTitle: 'Title!', perks: ['Perk one!', 'Perk two!'], priceLine: 'Price!', comingSoon: 'Soon!', ok: 'Okay!' }, () => {
      host();
      fire(EVENTS.OPEN_UPGRADE);
      for (const text of ['Title!', 'Perk one!', 'Perk two!', 'Price!', 'Soon!']) expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Okay!' })).toBeInTheDocument();
    });
  });

  it('the Upgrade sheet, given no title, uses PLAN_COPY.upgradeTitle', () => {
    withCopy({ upgradeTitle: 'Title!' }, () => {
      render(<ThemeProvider><UpgradeSheet open onClose={vi.fn()} /></ThemeProvider>);
      expect(screen.getByText('Title!')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Title!' })).toBeInTheDocument();
    });
  });

  it('the limit sheet: title, body (with the reset date), Upgrade and Not now', () => {
    withCopy({ limitTitle: 'Limit!', limitBody: (reset) => `Body! ${reset}`, upgrade: 'Go up!', notNow: 'Later!' }, () => {
      host();
      fire(EVENTS.OPEN_FREE_LIMIT);
      expect(screen.getByText('Limit!')).toBeInTheDocument();
      expect(screen.getByText('Body! Nov 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go up!' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Later!' })).toBeInTheDocument();
    });
  });

  it('and the real words are unchanged', () => {
    expect(PLAN_COPY.upgradeTitle).toBe('Keiro Pro');
    expect(PLAN_COPY.priceLine).toBe('$4.99 a month or $49.99 a year');
    expect(PLAN_COPY.comingSoon).toBe('Payments are coming soon.');
    expect(PLAN_COPY.limitTitle).toBe("You've used your 20 free invoices this month");
    expect(PLAN_COPY.limitBody('Nov 1')).toBe('They reset Nov 1.');
    expect(PLAN_COPY.notNow).toBe('Not now');
    expect(PLAN_COPY.upgrade).toBe('Upgrade');
    expect(PLAN_COPY.ok).toBe('OK');
  });
});
