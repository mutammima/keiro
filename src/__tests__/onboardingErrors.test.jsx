/**
 * onboardingErrors.test.jsx
 *
 * With Keiro's server unreachable, email sign-in showed the browser's raw
 * "Failed to fetch". It must say what is actually wrong, in plain words.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../services/auth', async (importActual) => ({
  ...(await importActual()),
  signInWithEmail: vi.fn(async () => ({ user: null, error: new TypeError('Failed to fetch') })),
}));

import { SERVER_UNREACHABLE_MESSAGE } from '../services/auth';
import OnboardingFlow from '../components/auth/OnboardingFlow';

describe('email sign-in while the server is unreachable', () => {
  it('explains the outage instead of showing "Failed to fetch"', async () => {
    render(<OnboardingFlow session={null} onAuthed={vi.fn()} onGuest={vi.fn()} />);

    fireEvent.click(screen.getByText('Log in'));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'driver@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Log in' }).at(-1));

    expect(await screen.findByText(SERVER_UNREACHABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  });
});
