/**
 * barcodeFormat.js — barcode forms that need handling before a lookup.
 *
 * - UPC-E: the 8-digit compressed UPC on small items (cans, gum). Lookup
 *   services index the 12-digit UPC-A it stands for — UPCitemdb rejects
 *   04963406 as INVALID_UPC but knows 049000006346. EAN-8 codes are also 8
 *   digits and are NOT UPC-E, so expansion goes by the scanner's reported
 *   format, never by length.
 * - Store-made codes: GS1 "restricted circulation" numbers (prefixes 020–029,
 *   040–049, 200–299) — weighed deli/meat items, store labels, internal stock
 *   codes. Only meaningful inside one store or company; no database has them.
 */

/** UPC-A / EAN-13 check digit for the digits before it. */
function checkDigit(digits) {
  let sum = 0;
  // Weights alternate 3,1,3,… from the digit nearest the check digit.
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += Number(digits[i]) * w;
  return String((10 - (sum % 10)) % 10);
}

/**
 * Expands an 8-digit UPC-E (number system 0 or 1, six digits, check digit) to
 * its 12-digit UPC-A. Returns null if it isn't a valid UPC-E.
 * @param {string} code
 * @returns {string|null}
 */
export function expandUpcE(code) {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [ns, d1, d2, d3, d4, d5, d6, check] = code;
  let maker, item;
  if (d6 <= '2')      { maker = d1 + d2 + d6 + '00'; item = '00' + d3 + d4 + d5; }
  else if (d6 === '3') { maker = d1 + d2 + d3 + '00'; item = '000' + d4 + d5; }
  else if (d6 === '4') { maker = d1 + d2 + d3 + d4 + '0'; item = '0000' + d5; }
  else                 { maker = d1 + d2 + d3 + d4 + d5; item = '0000' + d6; }
  const body = ns + maker + item;
  return checkDigit(body) === check ? body + check : null;
}

/**
 * The form a scanned barcode is looked up and saved under: a UPC-E is
 * expanded to UPC-A; everything else is kept as scanned.
 * @param {string} code - decoded text
 * @param {string} [format] - html5-qrcode's formatName, e.g. 'UPC_E', 'EAN_8'
 * @returns {string}
 */
export function normalizeScannedBarcode(code, format) {
  if (format !== 'UPC_E') return code;
  return expandUpcE(code) ?? code;
}

/**
 * Whether a 12- or 13-digit code is a store-made (restricted circulation)
 * barcode. Other lengths are never classified.
 * @param {string} code
 * @returns {boolean}
 */
export function isStoreMadeBarcode(code) {
  if (!/^\d{12,13}$/.test(code)) return false;
  const gtin13 = code.padStart(13, '0');
  return gtin13.startsWith('02') || gtin13.startsWith('04') || gtin13.startsWith('2');
}
