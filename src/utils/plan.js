/**
 * plan.js — the free plan and Keiro Pro on this phone
 * (docs/specs/2026-10-16-pricing-design.md §1, §3, §4).
 *
 * The one reader for "is this account Pro?" and "how many free invoices are
 * left?". The server's answer (my_plan(), supabase-pricing.sql) is cached with
 * when it was fetched; offline, a cached Pro stays Pro until a few days past
 * its paid-until date, and with no answer at all the account is Free. Only a
 * signed-in driver is ever limited: guests keep their own cap, store owners
 * keep everything.
 *
 * Every screen imports this module, so it stays dependency-light: it reads and
 * writes localStorage directly (many tests mock storage.js / guestMode.js /
 * storageRoom.js with partial factories), and it loads services/db and
 * syncQueue only when it needs them — importing the Supabase client without
 * a configured URL throws, and CI has no .env.
 */
import {
  STORAGE_KEYS, EVENTS, MS_PER_DAY, FREE_INVOICES_PER_MONTH, OFFLINE_PRO_GRACE_DAYS,
  PLAN_COPY,
} from './constants';
import { localMonth } from './invoiceUtils';

function read(key, fallback = null) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function announce() {
  try { window.dispatchEvent(new CustomEvent(EVENTS.PLAN_CHANGE)); } catch { /* no DOM */ }
}
function isGuestNow() {
  try { return localStorage.getItem(STORAGE_KEYS.GUEST_MODE) === 'true'; } catch { return false; }
}
function isStoreOwner() {
  return read(STORAGE_KEYS.USER_ROLE, 'driver') === 'store_owner';
}
function shortDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The cached my_plan() answer, or null when the server never answered on this phone. */
export function getCachedPlan() {
  const p = read(STORAGE_KEYS.PLAN_CACHE);
  return p && typeof p === 'object' ? p : null;
}

/**
 * Whether a cached answer still means Pro at `now`. Free forever has no end;
 * anything else stays Pro offline until OFFLINE_PRO_GRACE_DAYS past its
 * paid-until date, so a paying driver is never locked out for lack of signal.
 * @param {object|null} plan
 * @param {Date} [now]
 */
export function isProNow(plan, now = new Date()) {
  if (!plan?.pro) return false;
  if (plan.proUntil == null) return plan.source === 'manual';
  const until = Date.parse(plan.proUntil);
  return Number.isFinite(until) && now.getTime() <= until + OFFLINE_PRO_GRACE_DAYS * MS_PER_DAY;
}

export function isPro(now = new Date()) {
  return isProNow(getCachedPlan(), now);
}

/** A signed-in driver who isn't Pro — the only account the plan limits. */
export function onFreePlan(now = new Date()) {
  return !isStoreOwner() && !isGuestNow() && !isPro(now);
}

/** New invoices made this local month: the larger of this phone's count and the server's. */
export function invoicesUsedThisMonth(now = new Date()) {
  const month = localMonth(now);
  const usage = read(STORAGE_KEYS.USAGE);
  const local = usage?.month === month ? Number(usage.count) || 0 : 0;
  const plan = getCachedPlan();
  const server = plan?.month === month ? Number(plan.usedThisMonth) || 0 : 0;
  return Math.max(local, server);
}

export function freeInvoicesLeft(now = new Date()) {
  return Math.max(0, FREE_INVOICES_PER_MONTH - invoicesUsedThisMonth(now));
}

/** Whether a new invoice (Duplicate included) may be made now. Edits are never limited. */
export function canCreateInvoice(now = new Date()) {
  return !onFreePlan(now) || freeInvoicesLeft(now) > 0;
}

/** Counts one new invoice saved on this phone. */
export function recordNewInvoice(now = new Date()) {
  const month = localMonth(now);
  const usage = read(STORAGE_KEYS.USAGE);
  const count = usage?.month === month ? (Number(usage.count) || 0) + 1 : 1;
  write(STORAGE_KEYS.USAGE, { month, count });
  announce();
}

/** "Nov 1": when this month's free invoices come back. */
export function resetDateLabel(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * After a FRESH answer from the server (never a missing or stale cache): a
 * free driver is moved into Easy Mode for good — so upgrading later never
 * switches modes by itself — with a one-time note; Pro releases uploads held
 * for the limit.
 */
export async function applyFreshPlan(prev, next) {
  if (isStoreOwner() || isGuestNow()) return;
  if (next.pro) {
    const { releaseHeldSyncs } = await import('./syncQueue');
    releaseHeldSyncs();
    return;
  }
  if (prev?.pro) write(STORAGE_KEYS.PLAN_NOTICE, 'ended');
  if (read(STORAGE_KEYS.EASY_MODE, false) !== true) {
    write(STORAGE_KEYS.EASY_MODE, true);
    const hasInvoices = (read(STORAGE_KEYS.LIST, []) || []).length > 0;
    if (!prev?.pro && hasInvoices) write(STORAGE_KEYS.PLAN_NOTICE, 'moved');
  }
}

let inflight = null;

/**
 * Asks the server for this account's plan and caches it. Concurrent calls
 * share one request. Never rejects: it resolves { ok: false } offline, signed
 * out, before supabase-pricing.sql is run, or when anything throws (a lazy
 * import that fails, releasing held uploads). With no answer the cache is
 * left as it was.
 * @returns {Promise<{ ok: boolean, plan?: object }>}
 */
export function refreshPlan() {
  if (!inflight) {
    inflight = fetchPlan()
      .catch((err) => { console.warn('refreshPlan failed', err); return { ok: false }; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

async function fetchPlan() {
  const db = await import('../services/db');
  const { data, error } = await db.getMyPlan();
  if (error || !data || typeof data !== 'object') return { ok: false };
  const prev = getCachedPlan();
  const next = {
    pro: data.pro === true,
    source: data.source ?? null,
    status: data.status ?? null,
    proUntil: data.pro_until ?? null,
    interval: data.interval ?? null,
    cancels: data.cancels === true,
    usedThisMonth: Number(data.used_this_month) || 0,
    month: data.month ?? null,
    fetchedAt: new Date().toISOString(),
  };
  write(STORAGE_KEYS.PLAN_CACHE, next);
  await applyFreshPlan(prev, next);
  announce();
  return { ok: true, plan: next };
}

/** Shows the Upgrade sheet (UpgradeHost), optionally with its own title. */
export function openUpgrade(title) {
  try { window.dispatchEvent(new CustomEvent(EVENTS.OPEN_UPGRADE, { detail: { title } })); } catch { /* no DOM */ }
}

/** Shows "You've used your 20 free invoices this month" (UpgradeHost). */
export function openFreeLimit() {
  try { window.dispatchEvent(new CustomEvent(EVENTS.OPEN_FREE_LIMIT)); } catch { /* no DOM */ }
}

/** + New / Duplicate: runs `go` under the limit, otherwise shows the limit sheet. */
export function guardNewInvoice(go) {
  if (!canCreateInvoice()) { openFreeLimit(); return false; }
  go();
  return true;
}

/**
 * What Settings → Plan shows for a cached answer. Payments come later (owner
 * decision 2026-10-17), so Pro today is always the owner's switch; a paid
 * record, once payments exist, shows plain "Pro".
 */
export function planSummary(plan, now = new Date()) {
  if (!isProNow(plan, now)) {
    return { label: PLAN_COPY.freeLabel, sub: PLAN_COPY.usedLine(invoicesUsedThisMonth(now), resetDateLabel(now)), action: 'upgrade' };
  }
  if (plan.source === 'manual') {
    return { label: plan.proUntil ? PLAN_COPY.proUntilLabel(shortDate(plan.proUntil)) : PLAN_COPY.proFreeLabel, sub: '', action: null };
  }
  return { label: PLAN_COPY.proLabel, sub: '', action: null };
}
