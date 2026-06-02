/**
 * useContactImport — wraps the Web Contacts API for importing a contact's
 * name, phone, and address into the invoice form.
 *
 * Browser support: iOS Safari 14.5+, Chrome for Android 80+.
 * Falls back gracefully on desktop / unsupported browsers.
 *
 * Usage:
 *   const { supported, importContact } = useContactImport();
 *   const contact = await importContact();
 *   // contact → { name, phone, address } | null (user cancelled)
 */

/**
 * Returns true when the Contacts API is available on this device.
 * Checks both existence AND that 'name' is in the supported properties,
 * because some browsers expose the object without full support.
 */
export function isContactsSupported() {
  try {
    return (
      'contacts' in navigator &&
      'ContactsManager' in window &&
      typeof navigator.contacts.select === 'function'
    );
  } catch {
    return false;
  }
}

/**
 * Formats a ContactAddress object into a single human-readable string.
 * Handles both the flat-string and structured-object shapes browsers return.
 */
function formatAddress(addr) {
  if (!addr) return '';

  // Some browsers return a plain string
  if (typeof addr === 'string') return addr.trim();

  const parts = [];

  // addressLine is an array of strings (street lines)
  if (Array.isArray(addr.addressLine) && addr.addressLine.length > 0) {
    parts.push(addr.addressLine.filter(Boolean).join(', '));
  } else if (typeof addr.addressLine === 'string' && addr.addressLine.trim()) {
    parts.push(addr.addressLine.trim());
  }

  if (addr.city?.trim())       parts.push(addr.city.trim());
  if (addr.region?.trim())     parts.push(addr.region.trim());
  if (addr.postalCode?.trim()) parts.push(addr.postalCode.trim());
  if (addr.country?.trim() && addr.country.trim().toLowerCase() !== 'us' &&
      addr.country.trim().toLowerCase() !== 'united states') {
    parts.push(addr.country.trim());
  }

  return parts.join(', ');
}

/**
 * Opens the native contact picker and resolves with:
 *   { name: string, phone: string, address: string }
 * or null if the user cancels or an error occurs.
 */
export async function pickContact() {
  if (!isContactsSupported()) return null;

  try {
    // Ask for all useful fields; browser will only return what it has
    const props = ['name', 'tel', 'address'];
    const results = await navigator.contacts.select(props, { multiple: false });

    if (!results || results.length === 0) return null;

    const c = results[0];

    // name: array of strings
    const name = Array.isArray(c.name) && c.name.length > 0
      ? c.name[0].trim()
      : '';

    // tel: array of { value } objects or plain strings
    const rawPhone = Array.isArray(c.tel) && c.tel.length > 0
      ? (typeof c.tel[0] === 'object' ? c.tel[0].value : c.tel[0])
      : '';
    const phone = (rawPhone || '').trim();

    // address: array of ContactAddress objects
    const rawAddr = Array.isArray(c.address) && c.address.length > 0
      ? c.address[0]
      : null;
    const address = formatAddress(rawAddr);

    return { name, phone, address };
  } catch (err) {
    // AbortError = user cancelled — that's fine
    if (err?.name !== 'AbortError') console.warn('Contact import failed:', err);
    return null;
  }
}
