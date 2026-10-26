/**
 * easyMode.js — the driver's Easy Mode switch (Settings → Easy Mode).
 *
 * One reader for the flag that the tab set, the ☰ menu, the invoice screen,
 * the PDF template and the tour all depend on. Reading it at call time gives the
 * flag as it is now. A running shell never changes mode by itself: it changes
 * only by a reload (the switch in EasyModeSetting, or PlanRunner when a plan
 * answer flips the mode), which is why the shell can decide its mode once.
 *
 * So a screen takes the mode it is given (App reads it once per mount and
 * passes it down) rather than reading the flag, which can already say
 * otherwise (shellModeShare.test scans for stray readers).
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
 * `easy` is the mode the shell was built with (App's easyMode), never a fresh
 * read of the flag: the two differ for a free driver with no plan answer yet.
 */
export function shareLabel(defaultLabel, easy) {
  return easy ? 'Print / Share' : defaultLabel;
}

/** The PDF layout for the shell's mode: Easy Mode prints the fill-in template. */
export function pdfLayoutFor(easy) {
  return easy ? 'template' : 'standard';
}
