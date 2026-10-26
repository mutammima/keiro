/**
 * incrementalSync.js — refresh a cloud-backed local list without re-downloading it.
 *
 * Keiro's lists (invoices, cross-account orders, a store's shared invoices)
 * reload on every Realtime event, fallback poll, foreground and tab mount —
 * all four tabs mount at once. Re-downloading the whole set each time is the
 * read pattern that blew the Supabase egress cap in Jul 2026 (CLAUDE.md,
 * "Egress"). A loader made here:
 *   • downloads everything on the first load after the app opens;
 *   • later fetches the id list (a few bytes a row) plus only the rows changed
 *     since the newest updated_at seen, and rebuilds the list from those — so
 *     rows still come, change and go exactly as on the server;
 *   • falls back to a full download if the list lacks a row the server has;
 *   • downloads everything again if the server has no updated_at column to
 *     filter on (its migration not run), rather than freezing the list;
 *   • shares one request between loads that start at the same time;
 *   • returns the stored list unchanged when the cloud can't be reached.
 *
 * With `owner`, the stored list remembers whose it is: a different signed-in
 * account (a switch without a reload, or a sign-in after the session ended
 * server-side, which leaves local data in place) starts from a full download
 * and never sees the previous account's rows, even offline.
 *
 * The overlap re-reads rows stamped up to 10 minutes before the newest one, for
 * clocks that drift and commits that land late.
 */

import { writeLocal } from './storageRoom';

const SYNC_OVERLAP_MS = 10 * 60 * 1000;
// Postgres "undefined column": the table's updated_at migration hasn't run.
const MISSING_COLUMN = '42703';

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch { return null; }
}

function newestStamp(rows, floor) {
  return rows.reduce((max, r) => {
    const t = Date.parse(r.updated_at || r.created_at || r.createdAt || '');
    return isNaN(t) ? max : Math.max(max, t);
  }, floor);
}

export function byCreatedDesc(a, b) {
  return (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
}

/**
 * @param {object} o
 * @param {string} o.key                 localStorage key holding the list
 * @param {() => Promise<{data, error}>} o.full          every row
 * @param {() => Promise<{data, error}>} o.ids           every row's id only
 * @param {(sinceIso: string) => Promise<{data, error}>} o.changedSince
 * @param {(row) => object} [o.map]       server row → list item
 * @param {(item) => *} [o.idOf]          an item's id
 * @param {(row) => *} [o.rowIdOf]        an id row's id
 * @param {(list: object[]) => object[]} [o.view]  last say on what is returned
 *   (e.g. local changes still waiting to upload); the server's rows are stored
 * @param {(id) => boolean} [o.absentOnPurpose]  ids the list leaves out on purpose,
 *   which must not trigger a full download
 * @param {() => Promise<string|null>} [o.owner]  the signed-in account; the list
 *   is then stored as { owner, rows } and only read back by that account
 * @param {(stored: object[]|null) => object[]} [o.fallback]  what to return when
 *   the cloud can't be reached; gets the stored list, or null if there is none
 *   (for `owner`: none for this account)
 * @returns {() => Promise<object[]>}
 */
export function incrementalLoader({
  key, full, ids, changedSince,
  map = row => row,
  idOf = item => item.id,
  rowIdOf = row => row.id,
  view = list => list,
  absentOnPurpose = () => false,
  owner = null,
  fallback = stored => view(stored ?? []),
}) {
  let watermark = null; // newest server updated_at seen (ms); null until a full load for `scope`
  let scope = null;     // the owner the watermark and stored rows belong to
  let inFlight = null;

  function stored() {
    const v = readJson(key);
    if (!owner) return Array.isArray(v) ? v : null;
    return v && v.owner === scope && Array.isArray(v.rows) ? v.rows : null;
  }

  // Through storageRoom, like lsSet: a full phone frees room or raises the
  // storage banner instead of losing the write silently. Not if the account
  // changed while the request ran: a sign-out has wiped the list by then, and
  // writing it back would leave that account's rows on the phone.
  async function store(rows) {
    if (owner && (await owner()) !== scope) return null;
    writeLocal(key, JSON.stringify(owner ? { owner: scope, rows } : rows));
    return view(rows);
  }

  async function fullLoad() {
    const { data, error } = await full();
    if (error || !data) return null;
    watermark = newestStamp(data, 0);
    return store(data.map(map));
  }

  async function changesOnly() {
    const since = new Date(watermark - SYNC_OVERLAP_MS).toISOString();
    const [idRes, changedRes] = await Promise.all([ids(), changedSince(since)]);
    if (changedRes.error?.code === MISSING_COLUMN) return fullLoad();
    if (idRes.error || !idRes.data || changedRes.error || !changedRes.data) return null;

    const live = new Set(idRes.data.map(rowIdOf));
    const changed = changedRes.data.map(map);
    const changedIds = new Set(changed.map(idOf));
    const kept = (stored() ?? []).filter(item => live.has(idOf(item)) && !changedIds.has(idOf(item)));
    const merged = [...changed, ...kept].sort(byCreatedDesc);

    const have = new Set(merged.map(idOf));
    if ([...live].some(id => !have.has(id) && !absentOnPurpose(id))) return fullLoad();

    watermark = newestStamp(changedRes.data, watermark);
    return store(merged);
  }

  async function run() {
    if (owner) {
      const who = await owner();
      if (who !== scope) { scope = who; watermark = null; }
    }
    const result = await (watermark === null ? fullLoad() : changesOnly());
    return result ?? fallback(stored());
  }

  return function load() {
    if (!inFlight) inFlight = run().finally(() => { inFlight = null; });
    return inFlight;
  };
}
