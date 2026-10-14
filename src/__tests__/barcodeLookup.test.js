/**
 * barcodeLookup.test.js
 *
 * A scanned barcode is named by two remote sources: Open Food Facts (food only,
 * called straight from the app) and UPCitemdb (general merchandise — motor oil,
 * shirts). UPCitemdb only allows requests from its own website, so the app's
 * direct call was blocked by CORS on every scan and only food ever resolved.
 * It now goes through Keiro's own route, api/barcode.js, which calls UPCitemdb
 * from the server.
 *
 * fetch is stubbed; nothing here touches the network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));

import { Capacitor } from '@capacitor/core';
import { GET } from '../../api/barcode.js';
import { lookupBarcode } from '../utils/barcodeApi';

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const offMiss = () => jsonResponse(200, { status: 0, status_verbose: 'product not found' });
const offHit = (name, brands = '') => jsonResponse(200, { status: 1, product: { product_name: name, brands } });
const upcHit = (title) => jsonResponse(200, { code: 'OK', total: 1, items: [{ title }] });
const upcMiss = () => jsonResponse(200, { code: 'OK', total: 0, items: [] });

const routeRequest = (code) => new Request(`https://keiro.example/api/barcode?code=${code}`);

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  Capacitor.isNativePlatform.mockReturnValue(false);
});
afterEach(() => vi.unstubAllGlobals());

describe('api/barcode.js (server route)', () => {
  it('names a non-food product from UPCitemdb', async () => {
    fetchMock.mockResolvedValue(upcHit('Mobil 1 High Mileage Full Synthetic Motor Oil 5W-30  5 Quart'));

    const res = await GET(routeRequest('071924145009'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Mobil 1 High Mileage Full Synthetic Motor Oil 5W-30 5 Quart' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.upcitemdb.com/prod/trial/lookup?upc=071924145009');
  });

  it('lets the app and the iOS app (another origin) read the answer', async () => {
    fetchMock.mockResolvedValue(upcHit('Gildan Heavy Cotton T-Shirt'));

    const res = await GET(routeRequest('734071864611'));

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('caches a found product for a long time, to spare the shared daily quota', async () => {
    fetchMock.mockResolvedValue(upcHit('Gildan Heavy Cotton T-Shirt'));

    const res = await GET(routeRequest('734071864611'));

    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage=2592000/);
  });

  it('answers name: null for a product UPCitemdb does not know, cached briefly', async () => {
    fetchMock.mockResolvedValue(upcMiss());

    const res = await GET(routeRequest('0071181000240'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: null });
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage=86400/);
  });

  it('treats a code UPCitemdb calls invalid as not found', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { code: 'INVALID_UPC', message: 'Not a valid UPC code.' }));

    const res = await GET(routeRequest('12345678'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: null });
  });

  it('rejects anything but 8–14 digits without calling UPCitemdb', async () => {
    for (const code of ['', '1234', 'ABC-123', '123456789012345', '0071181000240%26x%3D1']) {
      const res = await GET(routeRequest(code));
      expect(res.status, code).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a failure (out of quota) as 502 and never caches it', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { code: 'TOO_FAST' }));

    const res = await GET(routeRequest('071924145009'));

    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('reports UPCitemdb being unreachable as 502', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const res = await GET(routeRequest('071924145009'));

    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('lookupBarcode (in the app)', () => {
  it('uses Open Food Facts first and stops there when it knows the product', async () => {
    fetchMock.mockResolvedValueOnce(offHit('Chunky Salsa Mild', 'Tostitos'));

    expect(await lookupBarcode('028400055970')).toBe('Tostitos Chunky Salsa Mild');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks Keiro’s own route when Open Food Facts has nothing, never UPCitemdb directly', async () => {
    fetchMock.mockResolvedValueOnce(offMiss()).mockResolvedValueOnce(jsonResponse(200, { name: 'Mobil 1 5W-30' }));

    expect(await lookupBarcode('071924145009')).toBe('Mobil 1 5W-30');
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls[1]).toBe('/api/barcode?code=071924145009');
    expect(urls.some(u => u.includes('upcitemdb.com'))).toBe(false);
  });

  it('in the iOS app, calls the route on the production site', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    fetchMock.mockResolvedValueOnce(offMiss()).mockResolvedValueOnce(jsonResponse(200, { name: 'Mobil 1 5W-30' }));

    await lookupBarcode('071924145009');

    expect(fetchMock.mock.calls[1][0]).toBe('https://keiro-mutammimas-projects.vercel.app/api/barcode?code=071924145009');
  });

  it('returns null when neither source knows the product', async () => {
    fetchMock.mockResolvedValueOnce(offMiss()).mockResolvedValueOnce(jsonResponse(200, { name: null }));

    expect(await lookupBarcode('0071181000240')).toBeNull();
  });

  it('returns null when the route fails', async () => {
    fetchMock.mockResolvedValueOnce(offMiss()).mockResolvedValueOnce(jsonResponse(502, { error: 'lookup unavailable' }));

    expect(await lookupBarcode('071924145009')).toBeNull();
  });
});
