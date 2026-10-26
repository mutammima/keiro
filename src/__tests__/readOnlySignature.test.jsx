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
import { LIGHT } from '../theme';

// A recolour the test finishes by hand.
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
const shown = () => screen.getByAltText('Signature');
const sig = (src) => <ReadOnlySignature src={src} alt="Signature" caption="Driver / Deliverer" C={LIGHT} />;

beforeEach(() => { recolorSignature.mockReset(); });

describe('ReadOnlySignature', () => {
  it('shows the signature as it will print: recoloured to PRINT_INK, on a white box', async () => {
    recolorSignature.mockResolvedValue('data:ink');
    render(sig('data:white-strokes'));
    await act(async () => {});
    expect(recolorSignature).toHaveBeenCalledWith('data:white-strokes', PRINT_INK);
    expect(shown()).toHaveAttribute('src', 'data:ink');
    expect(shown().style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('is captioned, above the box, with the words it is given', async () => {
    recolorSignature.mockResolvedValue('data:ink');
    render(sig('data:stored'));
    await act(async () => {});
    const caption = screen.getByText('Driver / Deliverer');
    expect(caption.compareDocumentPosition(shown()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('figure')).toContainElement(caption);
    expect(screen.getByRole('figure')).toContainElement(shown());
  });

  // The stored image can be white strokes (drawn in dark mode): on this white box it would flash, invisible or
  // not, until the recolour lands. Nothing of it is shown before then; the box is held open, white, with the caption.
  it('shows no image at all until the recoloured one is ready: never the stored one', async () => {
    const recolour = deferred();
    recolorSignature.mockReturnValue(recolour.promise);
    const { container } = render(sig('data:stored'));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByAltText('Signature')).toBeNull();
    expect(screen.getByText('Driver / Deliverer')).toBeInTheDocument();      // the caption does not wait
    const hold = container.querySelector('figure').lastChild;                 // the box keeps its place meanwhile
    expect(hold.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(hold.style.height).not.toBe('');
    expect(hold).toHaveAttribute('aria-hidden', 'true');
    await act(async () => { recolour.resolve('data:ink'); });
    expect(shown()).toHaveAttribute('src', 'data:ink');
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('keeps the stored image when it cannot be recoloured (recolorSignature then hands its input back)', async () => {
    recolorSignature.mockImplementation(async (src) => src);
    render(sig('data:stored'));
    await act(async () => {});
    expect(recolorSignature).toHaveBeenCalledTimes(1);
    expect(shown()).toHaveAttribute('src', 'data:stored');
  });

  it('recolours once per signature, not on every render', async () => {
    recolorSignature.mockResolvedValue('data:ink');
    const { rerender } = render(sig('data:stored'));
    await act(async () => {});
    rerender(sig('data:stored'));
    rerender(sig('data:stored'));
    await act(async () => {});
    expect(recolorSignature).toHaveBeenCalledTimes(1);
    expect(shown()).toHaveAttribute('src', 'data:ink');
  });

  it('a different signature never shows the previous one\'s recolour', async () => {
    const first = deferred();
    const second = deferred();
    recolorSignature.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { rerender } = render(sig('data:a'));
    await act(async () => { first.resolve('data:a-ink'); });
    expect(shown()).toHaveAttribute('src', 'data:a-ink');
    rerender(sig('data:b'));
    expect(screen.queryByAltText('Signature')).toBeNull();     // neither a's ink nor b's stored image
    expect(recolorSignature).toHaveBeenLastCalledWith('data:b', PRINT_INK);
    await act(async () => { second.resolve('data:b-ink'); });
    expect(shown()).toHaveAttribute('src', 'data:b-ink');
  });

  it('a slow recolour of the old signature that lands after the signature changed is dropped', async () => {
    const slow = deferred();
    const fast = deferred();
    recolorSignature.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { rerender } = render(sig('data:a'));
    rerender(sig('data:b'));
    await act(async () => { fast.resolve('data:b-ink'); });
    await act(async () => { slow.resolve('data:a-ink'); });
    expect(shown()).toHaveAttribute('src', 'data:b-ink');
  });
});
