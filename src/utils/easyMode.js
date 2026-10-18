/**
 * easyMode.js — the driver's Easy Mode switch (Settings → Easy Mode).
 *
 * One reader for the flag that the tab set, the ☰ menu, the invoice screen,
 * the PDF template and the tour all depend on. Toggling it reloads the app
 * (see EasyModeSetting), so reading it at call time is always current.
 */
import { STORAGE_KEYS } from './constants';
import { onFreePlan } from './plan';

/** Whether Easy Mode is switched on on this device. */
export function isEasyMode() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.EASY_MODE)) === true; } catch { return false; }
}

/**
 * Easy Mode only shapes the driver app; store owners never get it. A
 * signed-in driver on the free plan is always in it: normal mode is part of
 * Pro (docs/specs/2026-10-16-pricing-design.md §1).
 */
export function easyModeFor(role) {
  return role !== 'store_owner' && (isEasyMode() || onFreePlan());
}

/**
 * The label for a "share this invoice's PDF" button. In Easy Mode the driver
 * prints from the iPhone share sheet, so every such button says Print / Share.
 */
export function shareLabel(defaultLabel) {
  return isEasyMode() ? 'Print / Share' : defaultLabel;
}
