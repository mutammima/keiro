/**
 * barcodeFormat.test.js
 *
 * Two kinds of barcode never get a name from a lookup unless Keiro handles them:
 *
 *  - UPC-E: the 8-digit compressed UPC printed on small items (cans, gum).
 *    UPCitemdb rejects it as INVALID_UPC but knows the 12-digit UPC-A it
 *    expands to (04963406 → 049000006346, a Coca-Cola can). EAN-8 codes are
 *    also 8 digits but are not UPC-E, so expansion goes by the scanner's
 *    reported format, never by length.
 *  - Store-made (GS1 "restricted circulation") codes: weighed deli/meat items,
 *    store labels, internal stock codes. GS1 prefixes 020–029, 040–049 and
 *    200–299. No database will ever have them.
 */

import { describe, it, expect } from 'vitest';
import { expandUpcE, normalizeScannedBarcode, isStoreMadeBarcode } from '../utils/barcodeFormat';

describe('expandUpcE', () => {
  // One pair per expansion rule (the 7th digit picks the rule).
  it.each([
    ['04963406', '049000006346'], // 0–2: Coca-Cola can, checked against UPCitemdb
    ['01234514', '012100003454'],
    ['01234523', '012200003453'],
    ['01234531', '012300000451'], // 3
    ['01234543', '012340000053'], // 4
    ['01234565', '012345000065'], // 5–9
    ['11234593', '112345000093'], // number system 1
  ])('expands %s to %s', (upcE, upcA) => {
    expect(expandUpcE(upcE)).toBe(upcA);
  });

  it('rejects a wrong check digit', () => {
    expect(expandUpcE('04963407')).toBeNull();
  });

  it('rejects anything that is not UPC-E shaped', () => {
    for (const code of ['24963406', '4963406', '049634060', '0496340A', '']) {
      expect(expandUpcE(code), code).toBeNull();
    }
  });
});

describe('normalizeScannedBarcode', () => {
  it('expands a code the scanner reported as UPC-E', () => {
    expect(normalizeScannedBarcode('04963406', 'UPC_E')).toBe('049000006346');
  });

  it('leaves an EAN-8 alone even when it would expand', () => {
    expect(normalizeScannedBarcode('01234565', 'EAN_8')).toBe('01234565');
  });

  it('leaves a code alone when the format is unknown', () => {
    expect(normalizeScannedBarcode('04963406', undefined)).toBe('04963406');
  });

  it('keeps a UPC-E with a bad check digit as scanned', () => {
    expect(normalizeScannedBarcode('04963407', 'UPC_E')).toBe('04963407');
  });

  it('leaves ordinary codes alone', () => {
    expect(normalizeScannedBarcode('071924145009', 'UPC_A')).toBe('071924145009');
    expect(normalizeScannedBarcode('0071924145009', 'EAN_13')).toBe('0071924145009');
  });
});

describe('isStoreMadeBarcode', () => {
  it.each([
    '212345678900',  // UPC-A number system 2: random-weight (deli, meat)
    '0212345678900', // the same as 13 digits
    '412345678901',  // UPC-A number system 4: in-store / internal
    '0412345678901',
    '2001234567893', // EAN-13 200–299: in-store labels
    '2991234567890',
  ])('%s is store-made', (code) => {
    expect(isStoreMadeBarcode(code)).toBe(true);
  });

  it.each([
    '049000006346',  // Coca-Cola (UPC-A, number system 0)
    '0049000006346',
    '071924145009',  // Mobil 1
    '0312345678901', // number system 3 (drugs) is a real product range
    '9780306406157', // ISBN
    '96385074',      // EAN-8: not classified
    '10049000006343', // GTIN-14 case code: not classified
    'manual_motor_oil',
    '',
  ])('%s is not store-made', (code) => {
    expect(isStoreMadeBarcode(code)).toBe(false);
  });
});
