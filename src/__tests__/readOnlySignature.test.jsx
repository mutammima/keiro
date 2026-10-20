/**
 * readOnlySignature.test.jsx — a saved signature shown to a free driver, who can't sign on the phone, the way it
 * will print. SignaturePad draws white strokes in dark mode and stores them as drawn, so the stored image is
 * invisible on the white box it is shown on; the PDF recolours a signature to PRINT_INK before it goes on the page,
 * and so does this (signatureImage.test.js covers the recolour itself).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('../utils/signatureImage', async (importOriginal) => ({
  ...(await importOriginal()),
  recolorSignature: vi.fn(),
}));

import ReadOnlySignature from '../components/invoice/ReadOnlySignature';
import { recolorSignature, PRINT_INK } from '../utils/signatureImage';

// A recolour the test finishes by hand.
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
const shown = () => screen.getByAltText('Signature');

beforeEach(() => { recolorSignature.mockReset(); });

describe('ReadOnlySignature', () => {
  it('shows the signature as it will print: recoloured to PRINT_INK, on a white box', async () => {
    recolorSignature.mockResolvedValue('data:ink');
    render(<ReadOnlySignature src="data:white-strokes" alt="Signature" />);
    await act(async () => {});
    expect(recolorSignature).toHaveBeenCalledWith('data:white-strokes', PRINT_INK);
    expect(shown()).toHaveAttribute('src', 'data:ink');
    expect(shown().style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('shows the stored image until the recolour is ready', async () => {
    const recolour = deferred();
    recolorSignature.mockReturnValue(recolour.promise);
    render(<ReadOnlySignature src="data:stored" alt="Signature" />);
    expect(shown()).toHaveAttribute('src', 'data:stored');
    await act(async () => { recolour.resolve('data:ink'); });
    expect(shown()).toHaveAttribute('src', 'data:ink');
  });

  it('keeps the stored image when it cannot be recoloured (recolorSignature then hands its input back)', async () => {
    recolorSignature.mockImplementation(async (src) => src);
    render(<ReadOnlySignature src="data:stored" alt="Signature" />);
    await act(async () => {});
    expect(recolorSignature).toHaveBeenCalledTimes(1);
    expect(shown()).toHaveAttribute('src', 'data:stored');
  });

  it('recolours once per signature, not on every render', async () => {
    recolorSignature.mockResolvedValue('data:ink');
    const { rerender } = render(<ReadOnlySignature src="data:stored" alt="Signature" />);
    await act(async () => {});
    rerender(<ReadOnlySignature src="data:stored" alt="Signature" />);
    rerender(<ReadOnlySignature src="data:stored" alt="Signature" />);
    await act(async () => {});
    expect(recolorSignature).toHaveBeenCalledTimes(1);
    expect(shown()).toHaveAttribute('src', 'data:ink');
  });

  it('a different signature never shows the previous one\'s recolour', async () => {
    const first = deferred();
    const second = deferred();
    recolorSignature.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { rerender } = render(<ReadOnlySignature src="data:a" alt="Signature" />);
    await act(async () => { first.resolve('data:a-ink'); });
    expect(shown()).toHaveAttribute('src', 'data:a-ink');
    rerender(<ReadOnlySignature src="data:b" alt="Signature" />);
    expect(shown()).toHaveAttribute('src', 'data:b');          // the new stored image, not a's ink
    expect(recolorSignature).toHaveBeenLastCalledWith('data:b', PRINT_INK);
    await act(async () => { second.resolve('data:b-ink'); });
    expect(shown()).toHaveAttribute('src', 'data:b-ink');
  });

  it('a slow recolour of the old signature that lands after the signature changed is dropped', async () => {
    const slow = deferred();
    const fast = deferred();
    recolorSignature.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { rerender } = render(<ReadOnlySignature src="data:a" alt="Signature" />);
    rerender(<ReadOnlySignature src="data:b" alt="Signature" />);
    await act(async () => { fast.resolve('data:b-ink'); });
    await act(async () => { slow.resolve('data:a-ink'); });
    expect(shown()).toHaveAttribute('src', 'data:b-ink');
  });
});
