/**
 * reminderMessage.js — builds a polite WhatsApp payment-reminder message for an
 * overdue invoice, plus the wa.me deep-link that opens it pre-filled.
 *
 * Pure functions — no React, no side effects. The caller supplies the already
 * computed amount due (the full total for an unpaid invoice, the remaining
 * balance for a partial one) and the days overdue, so this module stays a
 * simple, testable string builder. Mirrors the *bold* WhatsApp formatting and
 * phone-handling already used in InvoiceView.handleWhatsApp.
 */

import { buildWhatsAppUrl } from './invoiceUtils';

/**
 * Builds the reminder message body using the app's WhatsApp *bold* convention.
 * @param {object} p
 * @param {string} p.storeName
 * @param {number|string} p.invoiceNumber
 * @param {string} p.date - Invoice date string as stored on the invoice.
 * @param {number} p.amountDue - Outstanding balance in dollars.
 * @param {number} p.daysOverdue - Whole days since the invoice date.
 * @param {string} [p.businessName]
 * @returns {string}
 */
export function buildReminderMessage({ storeName, invoiceNumber, date, amountDue, daysOverdue, overdue = true, businessName = '' }) {
  // Overdue reminders name the days past due; an early (manual) nudge stays
  // gentle and doesn't claim the invoice is late.
  const statusLine = overdue
    ? `A friendly reminder that invoice *#${invoiceNumber}* from ${date} is now *${daysOverdue} day${daysOverdue === 1 ? '' : 's'}* past due.`
    : `A friendly reminder about invoice *#${invoiceNumber}* from ${date}, which is still outstanding.`;
  return [
    `Hi *${storeName}*,`,
    '',
    statusLine,
    '',
    `Amount due: *$${Number(amountDue).toFixed(2)}*`,
    '',
    'Please let me know when payment can be arranged. Thank you!',
    ...(businessName ? [`— ${businessName}`] : []),
  ].join('\n');
}

/**
 * Builds the wa.me deep link that opens WhatsApp with the reminder pre-filled.
 * Falls back to a number-less link (user picks the contact) when no phone is
 * saved for the store — handled by the shared buildWhatsAppUrl.
 * @param {object} p - Same fields as buildReminderMessage, plus storePhone.
 * @param {string} [p.storePhone]
 * @returns {string}
 */
export function buildReminderUrl(p) {
  return buildWhatsAppUrl(p.storePhone, buildReminderMessage(p));
}
