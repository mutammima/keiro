/**
 * signatureImage.test.js
 *
 * The pad's canvas is backed at devicePixelRatio (3× on an iPhone). Saving that
 * made each signature ~9× larger than a signature printed small needs.
 */

import { describe, it, expect, vi } from 'vitest';
import { exportSignature } from '../utils/signatureImage';

function fakeCanvas({ cssW, cssH, dpr }) {
  return {
    width: cssW * dpr,
    height: cssH * dpr,
    getBoundingClientRect: () => ({ width: cssW, height: cssH }),
    toDataURL: vi.fn(() => 'data:full-size'),
  };
}

describe('exportSignature', () => {
  it('saves at on-screen size, not the device-pixel backing store', () => {
    const source = fakeCanvas({ cssW: 320, cssH: 90, dpr: 3 });
    const drawImage = vi.fn();
    const out = { getContext: () => ({ drawImage }), toDataURL: vi.fn(() => 'data:small') };
    const doc = { createElement: vi.fn(() => out) };

    expect(exportSignature(source, doc)).toBe('data:small');
    expect(out.width).toBe(320);
    expect(out.height).toBe(90);
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0, 320, 90);
  });

  it('uses the canvas as it is when it is already 1×', () => {
    const source = fakeCanvas({ cssW: 320, cssH: 90, dpr: 1 });
    const doc = { createElement: vi.fn() };
    expect(exportSignature(source, doc)).toBe('data:full-size');
    expect(doc.createElement).not.toHaveBeenCalled();
  });
});
