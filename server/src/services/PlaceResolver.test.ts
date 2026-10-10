import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi, type Mock } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { eq } from 'drizzle-orm';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');
let PlaceResolver: typeof import('./PlaceResolver.js').PlaceResolver;
let GeocoderService: typeof import('./GeocoderService.js').GeocoderService;

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_resolver_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  await (await import('../db/index.js')).openDatabase();
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  ({ PlaceResolver } = await import('./PlaceResolver.js'));
  ({ GeocoderService } = await import('./GeocoderService.js'));
});

afterAll(async () => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let folderId: number;
let now: Date;
let resolver: InstanceType<typeof PlaceResolver>;
let fetchMock: Mock<[url: string | URL | Request], Promise<Response>>;
let respond: (url: URL) => Response;

function addPhoto(filename: string, geoCell: string | null): void {
  db.insert(schema.photos).values({ folderId, filename, fileHash: filename, createdAt: '', geoCell }).run();
}

const placeOf = (cell: string, lang = 'en') =>
  db.select().from(schema.geoPlaces).where(eq(schema.geoPlaces.cell, cell)).all().find((row) => row.lang === lang);

beforeEach(async () => {
  for (const table of [schema.photos, schema.folders, schema.geoPlaces]) db.delete(table).run();
  folderId = db.insert(schema.folders).values({ path: '/a', name: 'a', indexedAt: '' }).returning({ id: schema.folders.id }).get().id;
  now = new Date('2026-10-05T12:00:00Z');
  respond = (url) => json({ address: { city: `City ${url.searchParams.get('lat')}`, country: url.searchParams.get('accept-language') } });
  fetchMock = vi.fn(async (url: string | URL | Request) => respond(new URL(String(url))));
  const geocoder = new GeocoderService({ baseUrl: 'https://geo.example', contact: null, fetch: fetchMock as typeof fetch, minIntervalMs: 0 });
  resolver = new PlaceResolver(() => geocoder, () => now);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  resolver.stop();
  vi.restoreAllMocks();
});

describe('PlaceResolver', () => {
  it('resolves nothing until a client asks for a language', async () => {
    addPhoto('a.jpg', '4845:2455');
    await resolver.drain();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('looks up each cell once per language, at the cell centre', async () => {
    addPhoto('a.jpg', '4845:2455');
    addPhoto('b.jpg', '4845:2455');
    addPhoto('c.jpg', '4984:2403');
    addPhoto('d.jpg', null);
    resolver.noteLanguage('en');
    resolver.noteLanguage('uk');

    await resolver.drain();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(placeOf('4845:2455')).toMatchObject({ status: 'ok', name: 'City 48.45, en' });
    expect(placeOf('4845:2455', 'uk')).toMatchObject({ name: 'City 48.45, uk' });
    expect(placeOf('4984:2403')).toMatchObject({ name: 'City 49.84, en' });

    await resolver.drain();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('resolves a newly geotagged photo when woken, without a restart', async () => {
    resolver.noteLanguage('en');
    addPhoto('a.jpg', '4845:2455');
    await resolver.drain();

    addPhoto('b.jpg', '4646:3072');
    await resolver.drain();

    expect(placeOf('4646:3072')).toMatchObject({ status: 'ok', name: 'City 46.46, en' });
  });

  it('retries a failed lookup only after its backoff', async () => {
    resolver.noteLanguage('en');
    addPhoto('a.jpg', '4845:2455');
    respond = () => json({}, 503);
    await resolver.drain();
    expect(placeOf('4845:2455')).toMatchObject({ status: 'failed', attempts: 1 });

    respond = () => json({ address: { town: 'Yaremche', country: 'Ukraine' } });
    await resolver.drain();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now = new Date(now.getTime() + 61_000);
    await resolver.drain();
    expect(placeOf('4845:2455')).toMatchObject({ status: 'ok', name: 'Yaremche, Ukraine' });
  });

  it('remembers places the geocoder does not know', async () => {
    resolver.noteLanguage('en');
    addPhoto('a.jpg', '0:-3000');
    respond = () => json({ error: 'Unable to geocode' });
    await resolver.drain();
    await resolver.drain();

    expect(placeOf('0:-3000')).toMatchObject({ status: 'none', name: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('starts with the languages already in the cache', async () => {
    db.insert(schema.geoPlaces).values({ cell: '1:1', lang: 'de', status: 'ok', name: 'X', updatedAt: '' }).run();
    addPhoto('a.jpg', '4845:2455');

    await resolver.start();
    await resolver.drain();

    expect(placeOf('4845:2455', 'de')).toMatchObject({ status: 'ok' });
  });

  it('does nothing while geocoding is off', async () => {
    const off = new PlaceResolver(() => null, () => now);
    off.noteLanguage('en');
    addPhoto('a.jpg', '4845:2455');
    await off.drain();
    expect(placeOf('4845:2455')).toBeUndefined();
  });
});
