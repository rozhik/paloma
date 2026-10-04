import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let geo: typeof import('./geoApi.js');
let cache: typeof import('./placeCache.js');
let geocoding: typeof import('./geocoding.js');
let GeocoderService: typeof import('./GeocoderService.js').GeocoderService;
let photoApi: typeof import('./photoApi.js');
let location: typeof import('./location.js');
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_geo_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');
  vi.stubEnv('PALOMA_GEOCODER_URL', '');
  vi.stubEnv('PALOMA_MAP_TILE_URL', 'http://tiles.local/{z}/{x}/{y}.png');

  geo = await import('./geoApi.js');
  cache = await import('./placeCache.js');
  geocoding = await import('./geocoding.js');
  ({ GeocoderService } = await import('./GeocoderService.js'));
  photoApi = await import('./photoApi.js');
  location = await import('./location.js');
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let folderA: number;
let folderB: number;

type PhotoSeed = { lat?: number; lon?: number; hidden?: boolean; starred?: boolean; folder?: number };

function addPhoto(filename: string, { lat, lon, hidden = false, starred = false, folder = folderA }: PhotoSeed = {}): number {
  return db.insert(schema.photos).values({
    folderId: folder, filename, fileHash: `hash-${filename}`, createdAt: '', isHidden: hidden, isStarred: starred,
    latitude: lat ?? null, longitude: lon ?? null, locationSource: lat === undefined ? null : 'user',
    geoCell: lat === undefined || lon === undefined ? null : location.geoCell(lat, lon),
  }).returning({ id: schema.photos.id }).get().id;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Installs a geocoder whose requests go to `handler`; returns the fetch mock. */
function useGeocoder(handler: (url: URL) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string | URL | Request) => handler(new URL(String(url))));
  geocoding.setGeocoder(new GeocoderService({ baseUrl: 'https://geo.example', contact: null, fetch: fetchMock as typeof fetch, minIntervalMs: 0 }));
  return fetchMock;
}

beforeEach(() => {
  geocoding.setGeocoder(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  for (const table of [schema.albumPhotos, schema.photos, schema.folders, schema.geoPlaces, schema.geoSearch]) db.delete(table).run();
  folderA = db.insert(schema.folders).values({ path: '/a', name: 'a', indexedAt: '' }).returning({ id: schema.folders.id }).get().id;
  folderB = db.insert(schema.folders).values({ path: '/b', name: 'b', indexedAt: '' }).returning({ id: schema.folders.id }).get().id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getGeoSettings', () => {
  it('reports the tile server and that geocoding is off', () => {
    expect(geo.getGeoSettings()).toEqual({
      geocoding: false,
      tileUrl: 'http://tiles.local/{z}/{x}/{y}.png',
      tileAttribution: expect.stringContaining('OpenStreetMap'),
    });
  });
});

describe('listGeoPoints', () => {
  it('returns only geotagged photos with their thumbnail', () => {
    const a = addPhoto('a.jpg', { lat: 49.84, lon: 24.03 });
    addPhoto('b.jpg');

    expect(geo.listGeoPoints({})).toEqual([{ id: a, lat: 49.84, lon: 24.03, thumbnailUrl: '/api/cache/thumbnail/hash-a.jpg' }]);
  });

  it('is not limited to one page of the photo list', () => {
    for (let i = 0; i < 600; i++) addPhoto(`${i}.jpg`, { lat: 10, lon: 20 });
    expect(geo.listGeoPoints({})).toHaveLength(600);
  });

  it('follows the folder, album, starred, hidden and search filters', () => {
    const a = addPhoto('lviv.jpg', { lat: 49.84, lon: 24.03, starred: true });
    const b = addPhoto('kyiv.jpg', { lat: 50.45, lon: 30.52, folder: folderB });
    addPhoto('hidden.jpg', { lat: 1, lon: 2, hidden: true });
    db.insert(schema.albumPhotos).values({ photoId: b, token: 'c9ea' }).run();
    const ids = (query: Record<string, string>) => geo.listGeoPoints(query).map((p) => p.id).sort();

    expect(ids({ folderId: String(folderA) })).toEqual([a]);
    expect(ids({ album: 'c9ea' })).toEqual([b]);
    expect(ids({ starred: 'true' })).toEqual([a]);
    expect(ids({ query: 'kyi' })).toEqual([b]);
    expect(ids({ includeHidden: 'true' })).toHaveLength(3);
    expect(ids({ ids: `${b},x,${a}` })).toEqual([a, b].sort());
    expect(ids({ ids: '' })).toEqual([]);
  });
});

describe('searchPlaces', () => {
  const LVIV = [{ display_name: 'Lviv, Ukraine', lat: '49.84', lon: '24.03', boundingbox: ['49.77', '49.9', '23.9', '24.13'] }];

  it('responds 503 when geocoding is off', async () => {
    expect(await geo.searchPlaces('Lviv', 'en')).toMatchObject({ status: 503, body: { code: 'geocoder_disabled' } });
  });

  it('rejects an empty query with 400', async () => {
    useGeocoder(() => json([]));
    expect(await geo.searchPlaces('  ', 'en')).toMatchObject({ status: 400, body: { code: 'query_required' } });
    expect(await geo.searchPlaces(undefined, 'en')).toMatchObject({ status: 400, body: { code: 'query_required' } });
  });

  it('returns results and answers the same query from the cache, also after a restart', async () => {
    const first = useGeocoder(() => json(LVIV));
    const result = await geo.searchPlaces('Lviv', 'uk');
    expect(result).toEqual({ status: 200, body: [{ name: 'Lviv, Ukraine', lat: 49.84, lon: 24.03, bounds: { south: 49.77, west: 23.9, north: 49.9, east: 24.13 } }] });
    expect(first.mock.calls[0][0].toString()).toContain('accept-language=uk');

    // A new geocoder instance, as after a restart; the cache lives in the database
    const second = useGeocoder(() => json([]));
    expect(await geo.searchPlaces('  LVIV ', 'uk')).toEqual(result);
    expect(second).not.toHaveBeenCalled();
    await geo.searchPlaces('Lviv', 'en');
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('responds 502 when the geocoder fails, and does not cache the failure', async () => {
    useGeocoder(() => json({}, 503));
    expect(await geo.searchPlaces('Lviv', 'en')).toMatchObject({ status: 502, body: { code: 'geocoder_failed' } });

    useGeocoder(() => json(LVIV));
    expect((await geo.searchPlaces('Lviv', 'en')).status).toBe(200);
  });

  it('falls back to English for an invalid language', async () => {
    const fetchMock = useGeocoder(() => json([]));
    await geo.searchPlaces('Lviv', 'en;DROP');
    expect(fetchMock.mock.calls[0][0].toString()).toContain('accept-language=en');
  });
});

describe('place cache', () => {
  it('stores names, unknown places and failures with a growing retry delay', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    cache.savePlace('4845:2455', 'en', 'Yaremche, Ivano-Frankivsk Oblast, Ukraine', now);
    cache.savePlace('50:-3000', 'en', null, now);
    expect(cache.getCachedPlace('4845:2455', 'en')).toMatchObject({ status: 'ok', searchText: 'yaremche, ivano-frankivsk oblast, ukraine' });
    expect(cache.getCachedPlace('50:-3000', 'en')).toMatchObject({ status: 'none', name: null });

    cache.savePlaceFailure('4984:2403', 'en', now);
    expect(cache.getCachedPlace('4984:2403', 'en')).toMatchObject({ status: 'failed', attempts: 1, retryAt: '2026-10-05T12:01:00.000Z' });
    cache.savePlaceFailure('4984:2403', 'en', now);
    expect(cache.getCachedPlace('4984:2403', 'en')).toMatchObject({ attempts: 2, retryAt: '2026-10-05T12:02:00.000Z' });
    expect(cache.retryDelayMs(20)).toBe(60 * 60_000);

    cache.savePlace('4984:2403', 'en', 'Lviv', now);
    expect(cache.getCachedPlace('4984:2403', 'en')).toMatchObject({ status: 'ok', attempts: 0, retryAt: null });
  });
});

describe('place names', () => {
  const now = new Date('2026-10-05T12:00:00Z');

  beforeEach(() => {
    cache.savePlace(location.geoCell(48.45, 24.55), 'en', 'Yaremche, Ivano-Frankivsk Oblast, Ukraine', now);
    cache.savePlace(location.geoCell(48.45, 24.55), 'uk', 'Яремче, Івано-Франківська область, Україна', now);
    cache.savePlace(location.geoCell(49.84, 24.03), 'en', 'Lviv, Lviv Oblast, Ukraine', now);
    cache.savePlace(location.geoCell(49.85, 24.02), 'en', 'Lviv, Lviv Oblast, Ukraine', now);
    cache.savePlace(location.geoCell(0.5, -30), 'en', null, now);
  });

  it('returns each photo\'s place in the requested language, or null', () => {
    addPhoto('yaremche.jpg', { lat: 48.4512, lon: 24.5534 });
    addPhoto('kyiv.jpg', { lat: 50.45, lon: 30.52 });
    addPhoto('plain.jpg');
    const placeOf = (lang?: string) => Object.fromEntries(photoApi.listPhotos(lang ? { lang } : {}).map((p) => [p.filename, p.place]));

    expect(placeOf('en')).toEqual({
      'yaremche.jpg': 'Yaremche, Ivano-Frankivsk Oblast, Ukraine', 'kyiv.jpg': null, 'plain.jpg': null,
    });
    expect(placeOf('uk')['yaremche.jpg']).toBe('Яремче, Івано-Франківська область, Україна');
    expect(placeOf()['yaremche.jpg']).toBeNull();
  });

  it('finds photos by place name in any language, ignoring case beyond ASCII', () => {
    addPhoto('IMG_1.jpg', { lat: 48.45, lon: 24.55 });
    addPhoto('IMG_2.jpg', { lat: 49.84, lon: 24.03 });
    const found = (query: string) => photoApi.listPhotos({ query }).map((p) => p.filename).sort();

    expect(found('yaremche')).toEqual(['IMG_1.jpg']);
    expect(found('ЯРЕМЧЕ')).toEqual(['IMG_1.jpg']);
    expect(found('ukraine')).toEqual(['IMG_1.jpg', 'IMG_2.jpg']);
    expect(found('img_2')).toEqual(['IMG_2.jpg']);
    expect(geo.listGeoPoints({ query: 'lviv' })).toHaveLength(1);
  });

  it('groups the selection by place with counts, bounds and pending photos', () => {
    useGeocoder(() => json({}));
    addPhoto('l1.jpg', { lat: 49.84, lon: 24.03 });
    addPhoto('l2.jpg', { lat: 49.841, lon: 24.031 });
    addPhoto('l3.jpg', { lat: 49.85, lon: 24.02 });
    addPhoto('y1.jpg', { lat: 48.45, lon: 24.55 });
    addPhoto('k1.jpg', { lat: 50.45, lon: 30.52 });
    addPhoto('sea.jpg', { lat: 0.5, lon: -30 });
    addPhoto('plain.jpg');
    addPhoto('other.jpg', { lat: 48.45, lon: 24.55, folder: folderB });

    expect(geo.listPlaces({ folderId: String(folderA), lang: 'en' })).toEqual({
      status: 200,
      body: {
        places: [
          { name: 'Lviv, Lviv Oblast, Ukraine', count: 3, bounds: { south: 49.84, west: 24.02, north: 49.85, east: 24.031 } },
          { name: 'Yaremche, Ivano-Frankivsk Oblast, Ukraine', count: 1, bounds: { south: 48.45, west: 24.55, north: 48.45, east: 24.55 } },
        ],
        pending: 1,
      },
    });
  });

  it('responds 503 for places when geocoding is off', () => {
    expect(geo.listPlaces({ lang: 'en' })).toMatchObject({ status: 503, body: { code: 'geocoder_disabled' } });
  });
});
