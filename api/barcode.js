/**
 * api/barcode.js — names a scanned barcode the app can't name by itself.
 *
 * Open Food Facts (called straight from the app, see src/utils/barcodeApi.js)
 * only knows food. UPCitemdb knows general merchandise — motor oil, shirts —
 * but only allows requests from its own website, so a direct call from the
 * browser or the iOS app is blocked by CORS. This Vercel Function calls it
 * from the server instead.
 *
 *   GET /api/barcode?code=<8–14 digits>
 *     200 { name }       name is null when UPCitemdb doesn't know the code, or
 *                        for a store-made barcode (never sent to UPCitemdb)
 *     400 { error }      not a barcode — UPCitemdb is never called
 *     502 { error }      UPCitemdb unreachable or out of quota — try again later
 *
 * The free trial tier allows 100 lookups a day per caller IP, and every Keiro
 * user shares this function's IP. Answers are cached on Vercel's CDN so a
 * product only costs one lookup: a found name for 30 days, a miss for a day.
 * Failures are never cached.
 */

import { isStoreMadeBarcode } from '../src/utils/barcodeFormat.js';

const UPCITEMDB = 'https://api.upcitemdb.com/prod/trial/lookup?upc=';
const BARCODE = /^\d{8,14}$/;
const TIMEOUT_MS = 6000;

const FOUND_CACHE = 'public, s-maxage=2592000, stale-while-revalidate=86400';
const MISS_CACHE = 'public, s-maxage=86400';

function reply(status, body, cacheControl) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': cacheControl,
      // The iOS app serves its pages from capacitor://localhost, another origin.
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function GET(request) {
  const code = new URL(request.url).searchParams.get('code') ?? '';
  if (!BARCODE.test(code)) return reply(400, { error: 'code must be 8-14 digits' }, 'no-store');
  // No database names a store-made code. The app skips these itself; this
  // keeps older app builds from spending the shared quota on them.
  if (isStoreMadeBarcode(code)) return reply(200, { name: null }, MISS_CACHE);

  let res;
  try {
    res = await fetch(UPCITEMDB + code, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return reply(502, { error: 'lookup unavailable' }, 'no-store');
  }

  // 400 is UPCitemdb's INVALID_UPC (e.g. a bad check digit): a definite "no
  // such product", not a failure. 429 (quota) and 5xx are failures.
  if (res.status === 400) return reply(200, { name: null }, MISS_CACHE);
  if (!res.ok) return reply(502, { error: 'lookup unavailable' }, 'no-store');

  let data;
  try {
    data = await res.json();
  } catch {
    return reply(502, { error: 'lookup unavailable' }, 'no-store');
  }

  // Titles come from retailer listings and often carry doubled spaces.
  const name = data?.items?.[0]?.title?.replace(/\s+/g, ' ').trim() || null;
  return reply(200, { name }, name ? FOUND_CACHE : MISS_CACHE);
}
