import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { sharp } from '../plugins/testing.js';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let photosDir: string;
let server: Server;
let base: string;
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');
let Scanner: typeof import('../services/FolderScannerService.js').FolderScannerService;
let photoId: number;
let bigId: number;
let bigDir: string;

const sha = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sidecarPath = () => path.join(photosDir, '.paloma.json');
const sidecar = () => JSON.parse(fs.readFileSync(sidecarPath(), 'utf-8'));
const editsRow = () => db.select().from(schema.edits).all();

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_edits_routes_test_')));
  photosDir = path.join(tmpDir, 'photos');
  fs.mkdirSync(photosDir);
  // 400×300: left half red, right half blue
  await sharp({ create: { width: 400, height: 300, channels: 3, background: '#0000ff' } })
    .composite([{ input: await sharp({ create: { width: 200, height: 300, channels: 3, background: '#ff0000' } }).png().toBuffer(), left: 0, top: 0 }])
    .jpeg({ quality: 95 })
    .toFile(path.join(photosDir, 'a.jpg'));

  bigDir = path.join(tmpDir, 'big');
  fs.mkdirSync(bigDir);
  await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#808080' } }).jpeg().toFile(path.join(bigDir, 'big.jpg'));

  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PLUGINS_DIR', path.join(tmpDir, 'no-plugins'));
  vi.stubEnv('PALOMA_EXPORT_DIR', path.join(tmpDir, 'export'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});

  await (await import('../db/index.js')).openDatabase();
  const { default: express } = await import('express');
  const router = (await import('./index.js')).default as unknown as import('express').Router;
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  ({ FolderScannerService: Scanner } = await import('../services/FolderScannerService.js'));
  await (await import('../plugins/index.js')).pluginRegistry.init();
  await Scanner.startConfiguredFolders({ photosDirs: [photosDir, bigDir], excludeDirs: [] });
  const idOf = (filename: string) => db.select().from(schema.photos).all().find((p) => p.filename === filename)!.id;
  photoId = idOf('a.jpg');
  bigId = idOf('big.jpg');

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use((await import('../services/apiError.js')).apiErrorHandler);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await Scanner.stopAll();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  fs.rmSync(sidecarPath(), { force: true });
  db.delete(schema.edits).run();
});

afterEach(async () => {
  fs.chmodSync(photosDir, 0o755);
});

const send = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, type, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};

describe('PUT /api/photos/:id/edits', () => {
  it('saves the chain to the sidecar and the library, with defaults filled in', async () => {
    const { status, body } = await send('PUT', `/photos/${photoId}/edits`, { edits: [{ filter: 'rotate', angle: 90 }, { filter: 'brightness' }] });
    expect(status).toBe(200);
    const chain = [{ filter: 'rotate', angle: 90 }, { filter: 'brightness', amount: 0 }];
    expect(body.edits).toEqual(chain);
    expect(body.thumbnailUrl).toMatch(new RegExp(`^/api/photos/${photoId}/thumbnail\\?r=`));
    expect(sidecar().photos['a.jpg']).toEqual({ edits: chain, modified: expect.any(String) });
    expect(JSON.parse(editsRow()[0].editInstructionsJson)).toEqual(chain);
  });

  it('removes all edits with an empty list', async () => {
    await send('PUT', `/photos/${photoId}/edits`, { edits: [{ filter: 'sepia' }] });
    const { status, body } = await send('PUT', `/photos/${photoId}/edits`, { edits: [] });
    expect(status).toBe(200);
    expect(body).toMatchObject({ edits: null, thumbnailUrl: expect.stringMatching(/^\/api\/cache\/thumbnail\//) });
    expect(sidecar().photos['a.jpg']).toBeUndefined();
    expect(editsRow()).toEqual([]);
  });

  it('keeps steps of unavailable filters as sent', async () => {
    const grain = { filter: 'grain', amount: 30, enabled: false };
    const { body } = await send('PUT', `/photos/${photoId}/edits`, { edits: [grain, { filter: 'bw' }] });
    expect(body.edits).toEqual([grain, { filter: 'bw' }]);
  });

  it('rejects an invalid chain with 400 and changes nothing', async () => {
    await send('PUT', `/photos/${photoId}/edits`, { edits: [{ filter: 'sepia' }] });
    const before = fs.readFileSync(sidecarPath(), 'utf-8');
    for (const body of [{ edits: [{ filter: 'brightness', amount: 500 }] }, { edits: 'sepia' }, {}, { edits: [{ amount: 1 }] }]) {
      expect(await send('PUT', `/photos/${photoId}/edits`, body)).toMatchObject({ status: 400, body: { code: 'edits_invalid' } });
    }
    const { body } = await send('PUT', `/photos/${photoId}/edits`, { edits: [{ filter: 'brightness', amount: 500 }] });
    expect(body.params).toEqual({ step: 1, filter: 'brightness', param: 'amount' });
    expect(fs.readFileSync(sidecarPath(), 'utf-8')).toBe(before);
    expect(JSON.parse(editsRow()[0].editInstructionsJson)).toEqual([{ filter: 'sepia' }]);
  });

  it('responds 404 for an unknown photo', async () => {
    expect(await send('PUT', '/photos/999999/edits', { edits: [] })).toMatchObject({ status: 404, body: { code: 'photo_not_found' } });
  });

  it('fails for a corrupt sidecar, leaving the file and the library unchanged', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.writeFileSync(sidecarPath(), '{ broken');
    const { status, body } = await send('PUT', `/photos/${photoId}/edits`, { edits: [{ filter: 'bw' }] });
    expect(status).toBe(409);
    expect(body.code).toBe('sidecar_unreadable');
    expect(fs.readFileSync(sidecarPath(), 'utf-8')).toBe('{ broken');
    expect(editsRow()).toEqual([]);
  });

  it('never writes the photo or any file other than .paloma.json in its folder', async () => {
    const photo = path.join(photosDir, 'a.jpg');
    const before = sha(photo);
    await send('PUT', `/photos/${photoId}/edits`, { edits: [{ filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } }] });
    expect(sha(photo)).toBe(before);
    expect(fs.readdirSync(photosDir).sort()).toEqual(['.paloma.json', 'a.jpg']);
  });

  it('no longer offers the MVP edit route', async () => {
    expect((await send('POST', `/photos/${photoId}/edit`, { editInstructions: {} })).status).toBe(404);
  });
});

describe('POST /api/photos/:id/preview', () => {
  it('renders unsaved steps fitted within maxSize and saves nothing', async () => {
    const { status, type, body } = await send('POST', `/photos/${bigId}/preview`, { edits: [{ filter: 'rotate', angle: 90 }], maxSize: 1200 });
    expect(status).toBe(200);
    expect(type).toBe('image/webp');
    const meta = await sharp(body as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([900, 1200]);
    expect(fs.existsSync(path.join(bigDir, '.paloma.json'))).toBe(false);
    expect(editsRow()).toEqual([]);
  });

  it('shows the effect of the steps', async () => {
    const { body } = await send('POST', `/photos/${photoId}/preview`, {
      edits: [{ filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } }, { filter: 'bw' }],
      maxSize: 400,
    });
    const { data, info } = await sharp(body as Buffer).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([200, 300]);
    expect(data[0]).toBe(data[1]);
  });

  it('reports the size the steps give at full resolution', async () => {
    const res = await fetch(`${base}/photos/${bigId}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits: [{ filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } }], maxSize: 1024 }),
    });
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1024);
    expect([res.headers.get('x-paloma-full-width'), res.headers.get('x-paloma-full-height')]).toEqual(['2000', '3000']);
  });

  it.each([
    ['crop', [{ filter: 'crop64', rect: { left: 0.13, top: 0.07, right: 0.71, bottom: 0.94 } }]],
    ['rotate', [{ filter: 'rotate', angle: 90 }]],
    ['straighten', [{ filter: 'straighten', angle: 3.7 }]],
    ['crop, rotate and straighten', [
      { filter: 'crop64', rect: { left: 0.21, top: 0.1, right: 0.83, bottom: 0.77 } },
      { filter: 'rotate', angle: 270 },
      { filter: 'straighten', angle: -6.3 },
    ]],
  ])('reports a full size within 0.5% of a full-size render for %s', async (_case, edits) => {
    const { RenderService } = await import('../services/RenderService.js');
    const { libraryLookup } = await import('../services/libraryImages.js');
    const full = await RenderService.renderWithSize(path.join(bigDir, 'big.jpg'), edits, { lookup: libraryLookup });
    for (const maxSize of [800, 1600]) {
      const res = await fetch(`${base}/photos/${bigId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edits, maxSize }),
      });
      expect(res.status).toBe(200);
      // Whole-pixel details such as straighten's 2 px margin scale with the preview, hence a relative bound
      expect(Math.abs(Number(res.headers.get('x-paloma-full-width')) - full.width)).toBeLessThanOrEqual(Math.max(1, Math.round(full.width * 0.005)));
      expect(Math.abs(Number(res.headers.get('x-paloma-full-height')) - full.height)).toBeLessThanOrEqual(Math.max(1, Math.round(full.height * 0.005)));
    }
  });

  it('validates the steps and maxSize', async () => {
    expect(await send('POST', `/photos/${photoId}/preview`, { edits: [{ filter: 'contrast', amount: -101 }] }))
      .toMatchObject({ status: 400, body: { code: 'edits_invalid' } });
    expect(await send('POST', `/photos/${photoId}/preview`, { edits: [], maxSize: 99999 }))
      .toMatchObject({ status: 400, body: { code: 'invalid_field', params: { field: 'maxSize' } } });
    expect(await send('POST', '/photos/999999/preview', { edits: [] })).toMatchObject({ status: 404 });
  });
});

describe('GET /api/photos/:id/thumbnail and preview', () => {
  it('serves the image as rendered through the saved edits, cached for the URL', async () => {
    const saved = await send('PUT', `/photos/${photoId}/edits`, { edits: [{ filter: 'bw' }] });
    const res = await fetch(`${base.replace(/\/api$/, '')}${saved.body.thumbnailUrl}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([250, 250]);
    expect(Math.abs(data[0] - data[1])).toBeLessThan(3);

    const preview = await fetch(`${base.replace(/\/api$/, '')}${saved.body.previewUrl}`);
    const meta = await sharp(Buffer.from(await preview.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([400, 300]);
  });

  it('responds 404 for an unknown photo', async () => {
    expect((await send('GET', '/photos/999999/thumbnail')).status).toBe(404);
  });
});

describe('POST /api/export', () => {
  it('exports the photo rendered at full size through its edits', async () => {
    await send('PUT', `/photos/${photoId}/edits`, { edits: [{ filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } }] });
    // The destination is a folder inside the export folder
    const { status, body } = await send('POST', '/export', { photoIds: [photoId], outputDir: 'trip' });
    expect([status, body.kind, body.photoCount]).toEqual([202, 'export', 1]);
    const { taskQueue } = await import('../tasks/queue.js');
    const ended = await taskQueue.whenEnded(body.id);
    expect(ended.details).toMatchObject({ outputDir: 'trip', files: [expect.stringMatching(/^trip\//)], quotaExceeded: false });
    const exported = path.join(tmpDir, 'export', (ended.details as { files: string[] }).files[0]);
    const { data, info } = await sharp(exported).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([200, 300]);
    // Only the red left half: the right edge is red, not blue
    const at = ((150 * info.width) + info.width - 1) * info.channels;
    expect(data[at]).toBeGreaterThan(200);
    expect(data[at + 2]).toBeLessThan(60);
  });

  it('refuses a destination outside the export folder', async () => {
    const outside = path.join(tmpDir, 'elsewhere');
    const { status, body } = await send('POST', '/export', { photoIds: [photoId], outputDir: outside });
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'invalid_field', params: { field: 'outputDir' } });
    expect(fs.existsSync(outside)).toBe(false);
  });
});
