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
 *   • shares one request between loads that start at the same time;
 *   • returns the stored list unchanged when the cloud can't be reached.
 *
 * The overlap re-reads rows stamped up to 10 minutes before the newest one, for
 * clocks that drift and commits that land late.
 */

const SYNC_OVERLAP_MS = 10 * 60 * 1000;

function readList(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

function writeList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); }
  catch (e) { console.error('incrementalSync: localStorage write failed', e); }
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
 * @param {(list: object[]) => object[]} [o.view]  last say on what is stored and
 *   returned (e.g. local changes still waiting to upload)
 * @param {(id) => boolean} [o.absentOnPurpose]  ids the list leaves out on purpose,
 *   which must not trigger a full download
 * @returns {() => Promise<object[]>}
 */
export function incrementalLoader({
  key, full, ids, changedSince,
  map = row => row,
  idOf = item => item.id,
  rowIdOf = row => row.id,
  view = list => list,
  absentOnPurpose = () => false,
}) {
  let watermark = null; // newest server updated_at seen (ms); null until this launch's full load
  let inFlight = null;

  function store(list) {
    const shown = view(list);
    writeList(key, shown);
    return shown;
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
    if (idRes.error || !idRes.data || changedRes.error || !changedRes.data) return null;

    const live = new Set(idRes.data.map(rowIdOf));
    const changed = changedRes.data.map(map);
    const changedIds = new Set(changed.map(idOf));
    const kept = readList(key).filter(item => live.has(idOf(item)) && !changedIds.has(idOf(item)));
    const merged = [...changed, ...kept].sort(byCreatedDesc);

    const have = new Set(merged.map(idOf));
    if ([...live].some(id => !have.has(id) && !absentOnPurpose(id))) return fullLoad();

    watermark = newestStamp(changedRes.data, watermark);
    return store(merged);
  }

  return function load() {
    if (!inFlight) {
      inFlight = (watermark === null ? fullLoad() : changesOnly())
        .then(result => result ?? readList(key))
        .finally(() => { inFlight = null; });
    }
    return inFlight;
  };
}
