import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';
import { seedAiProviders, writeTestPlugin } from '../plugins/testing.js';
import { buildLibrary, type TestLibrary } from '../model/testLibrary.js';
import type { AiAnswer, AiRequest } from '../plugins/api.js';
import { connectMcp } from './testClient.js';

/**
 * MCP tools with users on, through API tokens: anna (admin) makes the tokens; `viewer` has library.view only,
 * `editor` every editor permission; `lim` is an editor who sees folder `home` only.
 */
type Fake = (request: AiRequest) => Promise<AiAnswer> | AiAnswer;
const fake = globalThis as unknown as { __aiFake: Fake };
const FAKE_PROVIDER = `
export function activate() {
  return { aiProviders: [{ id: 'fake', label: 'Fake vision', listModels: async () => [{ id: 'm' }], run: (request, ctx) => globalThis.__aiFake(request, ctx) }] };
}
`;

let cleanup: () => void;
let tmpDir: string;
let app: Awaited<ReturnType<typeof startTestApp>>;
let lib: TestLibrary;
let viewer: Client;
let editor: Client;
let lim: Client;
let limAi: Client;
let anna: TestClient;
let queueModule: typeof import('../tasks/queue.js');
const queue = () => queueModule;
let runner: typeof import('../ai/runner.js');

const BIRDS = 'c9ea9fa67022f38a3c771894d2a8a468';
const ROY = 'b8e4117cf1d6615b';

type ToolResult = { isError?: boolean; content: { type: string; text?: string; data?: string; mimeType?: string }[]; structuredContent?: Record<string, unknown> };
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
const json = (result: ToolResult) => JSON.parse(result.content.find((item) => item.type === 'text')!.text!);

beforeAll(async () => {
  ({ cleanup, tmpDir } = await openTestDatabase('paloma_mcp_tools_test_', { PALOMA_AUTH: 'on', OPENAI_API_KEY: '', OPENAI_BASE_URL: '' }));
  writeTestPlugin(path.join(tmpDir, 'plugins'), 'fake-vision', { module: FAKE_PROVIDER });
  seedAiProviders(path.join(tmpDir, 'data'), [{ id: 'fake', name: 'Fake vision', type: 'fake' }]);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  app = await startTestApp();
  runner = await import('../ai/runner.js');
  queueModule = await import('../tasks/queue.js');
  runner.timing.sleep = async () => {};
  lib = await buildLibrary(path.join(tmpDir, 'photos'), {
    trip: {
      photos: {
        sunrise: { dateTaken: '2024-05-09T06:00:00', width: 1000, height: 750 }, birds: { dateTaken: '2024-05-08T06:00:00' },
        // Hidden, with a real image that must never be served
        secret: { dateTaken: '2024-05-07T06:00:00', isHidden: true },
        // An empty file that cannot be decoded
        broken: { dateTaken: '2024-05-06T06:00:00' },
      },
      sidecar: {
        albums: { [BIRDS]: { name: 'Birds' } },
        people: { [ROY]: { name: 'Roy Avery', email: null, googleId: null } },
        photos: {
          'sunrise.jpg': { caption: 'Sunrise over hills', albums: [BIRDS] }, 'birds.jpg': { albums: [BIRDS], faces: [{ person: ROY }] },
          'secret.jpg': { hidden: true },
        },
      },
    },
    home: { photos: { cat: { dateTaken: '2023-01-01T10:00:00' } } },
  });
  for (const [folder, stem, width, height] of [['trip', 'sunrise', 1000, 750], ['trip', 'birds', 400, 300], ['trip', 'secret', 400, 300], ['home', 'cat', 400, 300]] as const) {
    await sharp({ create: { width, height, channels: 3, background: '#468' } }).jpeg().toFile(path.join(lib.dir[folder], `${stem}.jpg`));
  }

  const users = await import('../auth/users.js');
  await users.createUser({ username: 'anna', roleId: 'admin', password: 'correct horse battery' });
  await users.createUser({ username: 'limmy', roleId: 'editor', password: 'correct horse battery', access: { all: false, folders: [lib.dir.home] } });
  const session = async (username: string) => {
    const c = new TestClient(app.base);
    expect((await c.post('/auth/login/password', { username, password: 'correct horse battery' })).status).toBe(200);
    return c;
  };
  anna = await session('anna');
  const token = async (client: TestClient, permissions: string[]) => (await client.post('/auth/tokens', { name: permissions.join(','), permissions })).body.value as string;
  viewer = await connectMcp(app.base, await token(anna, ['library.view']));
  editor = await connectMcp(app.base, await token(anna, ['library.view', 'photos.edit', 'albums.manage', 'people.manage', 'ai.run', 'export']));
  const limmy = await session('limmy');
  lim = await connectMcp(app.base, await token(limmy, ['library.view', 'photos.edit']));
  limAi = await connectMcp(app.base, await token(limmy, ['library.view', 'ai.run']));
  expect((await anna.patch('/plugins/fake-vision', { enabled: true })).status).toBe(200);
  expect((await anna.patch('/ai/tasks/tags', { provider: 'fake', model: 'm' })).body.ready).toBe(true);
});

afterAll(async () => {
  await (await import('../tasks/queue.js')).taskQueue.idle();
  for (const client of [viewer, editor, lim, limAi]) await client?.close();
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

describe('tool list', () => {
  it('offers a view-only token only the reading tools', async () => {
    const names = (await viewer.listTools()).tools.map((tool) => tool.name).sort();
    expect(names).toEqual(['describe_model', 'get_objects', 'library_stats', 'list_objects', 'list_tasks', 'search_photos', 'view_photo']);
  });

  it('offers an editor token every tool', async () => {
    const names = (await editor.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['apply_changes', 'start_ai_run', 'get_ai_run', 'cancel_ai_run', 'list_ai_tasks', 'list_tasks', 'export_photos']));
  });

  it('describes every input of every tool', async () => {
    for (const tool of (await editor.listTools()).tools) {
      for (const [name, property] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect((property as { description?: string }).description, `${tool.name}.${name}`).toEqual(expect.any(String));
      }
    }
  });
});

describe('reading tools', () => {
  it('describes the model with the guide and the schema', async () => {
    const result = await call(viewer, 'describe_model');
    expect(result.content[0].text).toContain('# Paloma photo library');
    expect(JSON.parse(result.content[1].text!).$defs.PhotoDocument).toBeDefined();
  });

  it('searches photos by text', async () => {
    const body = json(await call(viewer, 'search_photos', { query: 'sunrise', limit: 20 }));
    expect(body.total).toBe(1);
    expect(body.items).toEqual([expect.objectContaining({ type: 'photo', id: lib.id.sunrise, caption: 'Sunrise over hills' })]);
  });

  it('lists ids that are not found', async () => {
    const body = json(await call(viewer, 'get_objects', { type: 'photo', ids: [lib.id.cat, 99999] }));
    expect(body.items.map((item: { id: number }) => item.id)).toEqual([lib.id.cat]);
    expect(body.notFound).toEqual([99999]);
  });

  it('lists albums', async () => {
    const body = json(await call(viewer, 'list_objects', { type: 'album' }));
    expect(body.items).toEqual([expect.objectContaining({ id: BIRDS, name: 'Birds', photoCount: 2 })]);
  });

  it('gives the statistics of an album', async () => {
    const body = json(await call(viewer, 'library_stats', { album: BIRDS }));
    expect(body).toMatchObject({ photoCount: 2, takenFrom: '2024-05-08T06:00:00', takenTo: '2024-05-09T06:00:00' });
    expect(body.people).toEqual([expect.objectContaining({ id: ROY, name: 'Roy Avery' })]);
  });

  it('shows a user with limited access only their part of the library', async () => {
    const body = json(await call(lim, 'search_photos', {}));
    expect(body.items.map((item: { id: number }) => item.id)).toEqual([lib.id.cat]);
    expect(json(await call(lim, 'get_objects', { type: 'photo', ids: [lib.id.sunrise] })).notFound).toEqual([lib.id.sunrise]);
  });
});

describe('view_photo', () => {
  it('returns a JPEG fitted in maxSize and the document', async () => {
    const result = await call(viewer, 'view_photo', { id: lib.id.sunrise, maxSize: 800 });
    const image = result.content.find((item) => item.type === 'image')!;
    expect(image.mimeType).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(image.data!, 'base64')).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 800, 600]);
    expect(json(result)).toMatchObject({ type: 'photo', id: lib.id.sunrise });
  });

  it('renders unsaved edits without saving them', async () => {
    const before = fs.readFileSync(path.join(lib.dir.trip, '.paloma.json'), 'utf-8');
    const result = await call(viewer, 'view_photo', { id: lib.id.sunrise, maxSize: 800, edits: [{ filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } }] });
    const meta = await sharp(Buffer.from(result.content[0].data!, 'base64')).metadata();
    // The left half of 1000×750, already within 800, is not enlarged
    expect([meta.width, meta.height]).toEqual([500, 750]);
    expect(fs.readFileSync(path.join(lib.dir.trip, '.paloma.json'), 'utf-8')).toBe(before);
  });

  it('reports invalid edits and photos the user cannot see', async () => {
    const invalid = await call(viewer, 'view_photo', { id: lib.id.sunrise, edits: [{ filter: 'brightness', amount: 500 }] });
    expect([invalid.isError, json(invalid).code]).toEqual([true, 'edits_invalid']);
    const unseen = await call(lim, 'view_photo', { id: lib.id.sunrise });
    expect([unseen.isError, json(unseen).code]).toEqual([true, 'object_not_found']);
  });
});

describe('hidden photos', () => {
  it('lists a hidden photo as not found unless asked for, and then without images', async () => {
    const body = json(await call(viewer, 'get_objects', { type: 'photo', ids: [lib.id.sunrise, lib.id.secret] }));
    expect([body.items.map((item: { id: number }) => item.id), body.notFound]).toEqual([[lib.id.sunrise], [lib.id.secret]]);
    const asked = json(await call(viewer, 'get_objects', { type: 'photo', ids: [lib.id.secret], includeHidden: true }));
    expect(asked.items).toEqual([expect.objectContaining({ id: lib.id.secret, hidden: true })]);
    expect(asked.items[0].images).toBeUndefined();
  });

  it('gives no images for hidden photos found by a search with includeHidden', async () => {
    const body = json(await call(viewer, 'search_photos', { includeHidden: true, limit: 200 }));
    const secret = body.items.find((item: { id: number }) => item.id === lib.id.secret);
    expect(secret).toMatchObject({ hidden: true });
    expect(secret.images).toBeUndefined();
    expect(body.items.find((item: { id: number }) => item.id === lib.id.sunrise).images.thumbnail.url).toEqual(expect.any(String));
  });

  it('does not render a hidden photo, whatever is asked', async () => {
    for (const args of [{ id: lib.id.secret }, { id: lib.id.secret, edits: [] }]) {
      const result = await call(editor, 'view_photo', args);
      expect([result.isError, json(result).code]).toEqual([true, 'object_not_found']);
      expect(result.content.some((item) => item.type === 'image')).toBe(false);
    }
  });
});

describe('server paths', () => {
  it('keeps them out of documents', async () => {
    const results = [
      await call(viewer, 'search_photos', { limit: 200 }),
      await call(viewer, 'list_objects', { type: 'folder' }),
      await call(viewer, 'get_objects', { type: 'photo', ids: [lib.id.sunrise] }),
      await call(viewer, 'view_photo', { id: lib.id.sunrise, maxSize: 64 }),
    ];
    for (const result of results) {
      const text = result.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n');
      expect(text).not.toContain(lib.dir.trip);
      expect(text).not.toContain(tmpDir);
    }
    const doc = json(results[2]).items[0];
    expect(doc.folder).toEqual({ id: lib.folderId.trip, name: 'trip' });
  });

  it('reports a photo that cannot be decoded without its path', async () => {
    const result = await call(viewer, 'view_photo', { id: lib.id.broken });
    expect([result.isError, json(result).code]).toEqual([true, 'render_failed']);
    expect(result.content[0].text).not.toMatch(/(^|[\s'"])\/\w/);
    expect(result.content[0].text).not.toContain(tmpDir);
  });

  it('redacts POSIX and Windows paths in results, but not ratios or URLs', async () => {
    const { jsonResult, errorResult } = await import('./tools.js');
    const result = jsonResult({ a: 'open /srv/photos/a.jpg', b: ['C:\\Users\\anna\\x.jpg'], c: 'crop 1/2', d: 'http://localhost:3001/api/mcp/media/x' });
    expect(result.structuredContent).toEqual({ a: 'open <path>', b: ['<path>'], c: 'crop 1/2', d: 'http://localhost:3001/api/mcp/media/x' });
    expect((result as ToolResult).content[0].text).not.toContain('/srv/photos');
    expect((errorResult({ code: 'internal', error: "ENOENT '/srv/x/y.jpg'" }) as ToolResult).content[0].text).toContain("ENOENT '<path>'");
  });
});

describe('argument limits', () => {
  it('refuses a value over its limit as invalid_field naming the field, before running', async () => {
    const query = await call(viewer, 'search_photos', { query: 'q'.repeat(501) });
    expect([query.isError, json(query)]).toMatchObject([true, { code: 'invalid_field', params: { field: 'query' } }]);
    const edits = await call(viewer, 'view_photo', { id: lib.id.sunrise, edits: Array.from({ length: 101 }, () => ({ filter: 'sepia' })) });
    expect([edits.isError, json(edits)]).toMatchObject([true, { code: 'invalid_field', params: { field: 'edits' } }]);
    expect(edits.content.some((item) => item.type === 'image')).toBe(false);
    const big = await call(editor, 'apply_changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.cat, set: { caption: 'x'.repeat(70 * 1024) } }] });
    expect(json(big)).toMatchObject({ code: 'invalid_field', params: { field: 'changes' } });
    const dir = await call(editor, 'export_photos', { photoIds: [lib.id.cat], outputDir: 'd'.repeat(201) });
    expect(json(dir)).toMatchObject({ code: 'invalid_field', params: { field: 'outputDir' } });
  });

  it('accepts each limit at its exact value', async () => {
    const { TOOLS, parseArgs } = await import('./tools.js');
    const tool = (name: string) => TOOLS.find((candidate) => candidate.name === name)!;
    const ok = (name: string, args: Record<string, unknown>) => expect('args' in parseArgs(tool(name), args), name).toBe(true);
    ok('search_photos', { query: 'q'.repeat(500), tag: 't'.repeat(100), album: 'a'.repeat(100), person: 'p'.repeat(100) });
    ok('view_photo', { id: 1, edits: Array.from({ length: 100 }, () => ({ filter: 'sepia' })) });
    ok('get_objects', { type: 'photo', ids: Array.from({ length: 200 }, (_, i) => i + 1) });
    ok('start_ai_run', { taskId: 't'.repeat(100), photoIds: Array.from({ length: 1000 }, (_, i) => i + 1) });
    ok('export_photos', { photoIds: [1], outputDir: 'd'.repeat(200) });
    ok('apply_changes', { changes: Array.from({ length: 1000 }, () => ({ op: 'update' })) });
    expect('error' in parseArgs(tool('get_objects'), { type: 'photo', ids: Array.from({ length: 201 }, (_, i) => i + 1) })).toBe(true);
    expect('error' in parseArgs(tool('start_ai_run'), { taskId: 'tags', photoIds: Array.from({ length: 1001 }, (_, i) => i + 1) })).toBe(true);
  });

  it('publishes the limits in the tool schemas', async () => {
    const search = (await viewer.listTools()).tools.find((tool) => tool.name === 'search_photos')!;
    expect((search.inputSchema.properties as Record<string, { maxLength?: number }>).query.maxLength).toBe(500);
  });
});

describe('image links', () => {
  type Images = { thumbnail: { url: string }; preview: { url: string } };

  it('come with search results and work without a token, privately and without caching', async () => {
    const body = json(await call(viewer, 'search_photos', { query: 'sunrise' }));
    expect(body.uri_valid_time_sec).toBe(300);
    const images = body.items[0].images as Images;
    expect(images.thumbnail.url).toMatch(new RegExp(`^${app.base}/mcp/media/[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{43}$`));
    for (const url of [images.thumbnail.url, images.preview.url]) {
      expect(url).not.toMatch(/sunrise|trip|hash-/);
      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).format).toEqual(expect.any(String));
    }
  });

  it('come with view_photo for the same image, but not for unsaved edits', async () => {
    const result = await call(viewer, 'view_photo', { id: lib.id.sunrise, maxSize: 200 });
    const body = json(result);
    expect(body.uri_valid_time_sec).toBe(300);
    const res = await fetch(body.image.url);
    expect([res.status, res.headers.get('content-type')]).toEqual([200, 'image/jpeg']);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([200, 150]);

    const edited = json(await call(viewer, 'view_photo', { id: lib.id.sunrise, maxSize: 200, edits: [{ filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } }] }));
    expect(edited.image).toBeNull();
    expect(edited.imageNote).toEqual(expect.any(String));
  });

  it('stop working for a tampered link, a photo hidden afterwards and a revoked token', async () => {
    const created = (await anna.post('/auth/tokens', { name: 'links', permissions: ['library.view'] })).body as { id: string; value: string };
    const client = await connectMcp(app.base, created.value);
    const urlOf = async (id: number) => (json(await call(client, 'get_objects', { type: 'photo', ids: [id] })).items[0].images as Images).thumbnail.url;

    const url = await urlOf(lib.id.birds);
    expect((await fetch(url)).status).toBe(200);
    const [payload, signature] = url.slice(url.lastIndexOf('/') + 1).split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), p: lib.id.secret })).toString('base64url');
    const tampered = await fetch(url.replace(payload, forged));
    expect(tampered.status).toBe(404);
    expect(await tampered.text()).not.toContain(tmpDir);
    expect((await fetch(url.replace(signature, 'A'.repeat(43)))).status).toBe(404);

    const hideBirds = (hidden: boolean) => call(editor, 'apply_changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.birds, set: { hidden } }] });
    await hideBirds(true);
    expect((await fetch(url)).status).toBe(404);
    await hideBirds(false);
    expect((await fetch(url)).status).toBe(200);

    expect((await anna.delete(`/auth/tokens/${created.id}`)).status).toBeLessThan(300);
    expect((await fetch(url)).status).toBe(404);
    await client.close().catch(() => {});
  });
});

describe('apply_changes', () => {
  it('lists before and after in a dry run and writes nothing', async () => {
    const before = fs.existsSync(path.join(lib.dir.home, '.paloma.json'));
    const body = json(await call(editor, 'apply_changes', {
      dryRun: true, changes: [{ op: 'update', type: 'photo', ids: [lib.id.cat, lib.id.birds], set: { tags: { add: ['sea'] } } }],
    }));
    expect(body.dryRun).toBe(true);
    expect(body.results[0].objects).toEqual([
      { id: lib.id.cat, changes: { tags: { from: [], to: ['sea'] } } },
      { id: lib.id.birds, changes: { tags: { from: [], to: ['sea'] } } },
    ]);
    expect(fs.existsSync(path.join(lib.dir.home, '.paloma.json'))).toBe(before);
  });

  it('returns the code, change and field of an invalid change', async () => {
    const result = await call(editor, 'apply_changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.cat, set: { fileName: 'x.jpg' } }] });
    expect(result.isError).toBe(true);
    expect(json(result)).toMatchObject({ code: 'read_only_field', params: { index: 0, field: 'fileName' } });
  });

  it('applies a changeset', async () => {
    const body = json(await call(editor, 'apply_changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.cat, set: { star: true } }] }));
    expect(body.results[0].objects).toEqual([{ id: lib.id.cat, changes: { star: { from: false, to: true } } }]);
    expect(lib.readSidecar('home').photos['cat.jpg']).toMatchObject({ star: true });
  });
});

describe('AI and export tools', () => {
  it('runs Tags on photos and reports the progress', async () => {
    fake.__aiFake = () => ({ tags: [{ name: 'gray', confidence: 0.9 }] });
    const tasks = json(await call(editor, 'list_ai_tasks')).tasks;
    expect(tasks).toContainEqual(expect.objectContaining({ id: 'tags', ready: true }));
    const started = json(await call(editor, 'start_ai_run', { taskId: 'tags', photoIds: [lib.id.cat, lib.id.birds] }));
    expect(started).toMatchObject({ kind: 'ai', aiTaskId: 'tags', total: 2, mine: true });
    await queue().taskQueue.whenEnded(started.id);
    expect(json(await call(editor, 'get_ai_run', { taskId: started.id }))).toMatchObject({ state: 'finished', done: 2, details: { tagsAdded: 2 } });
    expect(json(await call(editor, 'get_ai_run'))).toMatchObject({ id: started.id });
  });

  it('queues a second run behind the one in progress, and lists both', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fake.__aiFake = async () => {
      await gate;
      return { tags: [] };
    };
    const first = json(await call(editor, 'start_ai_run', { taskId: 'tags', photoIds: [lib.id.sunrise], again: true }));
    const second = await call(editor, 'start_ai_run', { taskId: 'tags', photoIds: [lib.id.cat], again: true });
    expect([second.isError, json(second).state]).toEqual([undefined, 'waiting']);
    const listed = json(await call(viewer, 'list_tasks')).tasks.map((task: { id: string }) => task.id);
    expect(listed.slice(0, 2)).toEqual([first.id, json(second).id]);

    const refused = await call(limAi, 'cancel_ai_run', { taskId: first.id });
    expect([refused.isError, json(refused).params]).toEqual([true, { permission: 'users.manage' }]);
    expect(json(await call(editor, 'cancel_ai_run', { taskId: json(second).id }))).toMatchObject({ state: 'cancelled' });
    release();
    await queue().taskQueue.idle();
  });

  it('exports into the export folder and refuses a folder outside it', async () => {
    const body = json(await call(editor, 'export_photos', { photoIds: [lib.id.cat], outputDir: 'trip-2024', resizeWidth: 100 }));
    expect(body).toMatchObject({ state: 'finished', count: 1, files: [path.join('trip-2024', 'exported_cat.jpg')] });
    const outside = await call(editor, 'export_photos', { photoIds: [lib.id.cat], outputDir: '../../etc' });
    expect([outside.isError, json(outside).params]).toEqual([true, { field: 'outputDir' }]);
  });
});

describe('resources', () => {
  it('serves the guide and the schema as the REST endpoints do', async () => {
    const guide = await viewer.readResource({ uri: 'paloma://guide' });
    expect(guide.contents[0]).toMatchObject({ mimeType: 'text/markdown' });
    const { aiGuide } = await import('../model/guide.js');
    expect((guide.contents[0] as { text: string }).text).toBe(aiGuide());
    const schema = await viewer.readResource({ uri: 'paloma://schema' });
    expect(JSON.parse((schema.contents[0] as { text: string }).text).$id).toBe('paloma://schema');
  });
});
