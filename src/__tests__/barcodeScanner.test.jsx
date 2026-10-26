/**
 * barcodeScanner.test.jsx
 *
 * The scanner must hand on the barcode's format along with its digits: an
 * 8-digit UPC-E has to be expanded before lookup, and an 8-digit EAN-8 must
 * not be, and only the format tells them apart (see barcodeFormat.js).
 *
 * html5-qrcode is mocked: jsdom has no camera.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

let onDecode;
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    isScanning = true;
    start(_camera, _config, success) { onDecode = success; return Promise.resolve(null); }
    stop() { return Promise.resolve(); }
  },
}));

import BarcodeScanner from '../components/ui/BarcodeScanner';

describe('BarcodeScanner', () => {
  it('passes the reported format with the decoded text', async () => {
    const onScan = vi.fn();
    render(<BarcodeScanner onScan={onScan} onClose={vi.fn()} />);
    await waitFor(() => expect(onDecode).toBeTypeOf('function'));

    onDecode('04963406', { decodedText: '04963406', result: { text: '04963406', format: { formatName: 'UPC_E' } } });

    expect(onScan).toHaveBeenCalledWith('04963406', 'UPC_E');
  });

  it('passes no format when the scanner reports none', async () => {
    const onScan = vi.fn();
    render(<BarcodeScanner onScan={onScan} onClose={vi.fn()} />);
    await waitFor(() => expect(onDecode).toBeTypeOf('function'));

    onDecode('0071924145009', undefined);

    expect(onScan).toHaveBeenCalledWith('0071924145009', undefined);
  });
});
