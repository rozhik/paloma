import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { DetectedFaceInput } from '../../../shared/types.js';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';

/** Face detection tasks through the API with a stub detector: photos wider than 150 px have one face. */
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let queue: typeof import('../tasks/queue.js');
let anna: TestClient;
let vera: TestClient;
const ids: number[] = [];
let detected: string[] = [];
let onDetect: () => Promise<void> = async () => {};

const face = (): DetectedFaceInput => ({ rect: { left: 0.1, top: 0.1, right: 0.4, bottom: 0.5 }, score: 0.9, descriptor: Array.from({ length: 128 }, () => 0.1) });

const taskOf = async (id: string) => (await anna.get('/tasks')).body.tasks.find((t: { id: string }) => t.id === id);

beforeAll(async () => {
  let tmpDir: string;
  ({ cleanup, tmpDir } = await openTestDatabase('paloma_faces_task_test_', { PALOMA_AUTH: 'on' }));
  app = await startTestApp();
  queue = await import('../tasks/queue.js');
  const { detection } = await import('./detectTask.js');
  detection.detector = {
    prepare: async () => {},
    detect: async (file) => {
      detected.push(file);
      await onDetect();
      return (await sharp(file).metadata()).width! > 150 ? [face()] : [];
    },
  };
  const { db } = await import('../db/index.js');
  const schema = await import('../db/schema.js');
  const dir = path.join(tmpDir, 'photos');
  fs.mkdirSync(dir, { recursive: true });
  const folderId = db.insert(schema.folders).values({ path: dir, name: 'photos', indexedAt: '' }).returning().get().id;
  for (const width of [100, 160, 200, 120]) {
    await sharp({ create: { width, height: 100, channels: 3, background: '#777' } }).jpeg().toFile(path.join(dir, `p${width}.jpg`));
    ids.push(db.insert(schema.photos).values({ folderId, filename: `p${width}.jpg`, fileHash: `hash-${width}`, width, height: 100, createdAt: '' }).returning().get().id);
  }
  const users = await import('../auth/users.js');
  await users.createUser({ username: 'anna', roleId: 'admin', password: 'correct horse battery' }, { mustChangePassword: false });
  await users.createUser({ username: 'vera', roleId: 'viewer', password: 'correct horse battery' }, { mustChangePassword: false });
  anna = new TestClient(app.base);
  vera = new TestClient(app.base);
  await anna.post('/auth/login/password', { username: 'anna', password: 'correct horse battery' });
  await vera.post('/auth/login/password', { username: 'vera', password: 'correct horse battery' });
});

afterAll(async () => {
  await queue.taskQueue.idle();
  await app.close();
  cleanup();
});

describe('face detection tasks', () => {
  it('needs people.manage and valid photo ids', async () => {
    const refused = await vera.post('/faces/detect', { photoIds: ids });
    expect([refused.status, refused.body.params.permission]).toEqual([403, 'people.manage']);
    expect((await anna.post('/faces/detect', { photoIds: [] })).status).toBe(400);
  });

  it('pauses after the photo in progress and detects the rest when resumed', async () => {
    let calls = 0;
    let taskId = '';
    onDetect = async () => {
      calls += 1;
      if (calls === 2) await anna.post(`/tasks/${taskId}/pause`);
    };
    const started = await anna.post('/faces/detect', { photoIds: ids.slice(0, 3) });
    expect([started.status, started.body.task.kind, started.body.task.total]).toEqual([202, 'faces', 3]);
    taskId = started.body.task.id;
    await queue.taskQueue.idle();
    expect(await taskOf(taskId)).toMatchObject({ state: 'paused', done: 2, total: 3 });
    await anna.post(`/tasks/${taskId}/resume`);
    await queue.taskQueue.whenEnded(taskId);
    expect(await taskOf(taskId)).toMatchObject({ state: 'finished', done: 3, total: 3, details: { faces: 2, photos: 2 } });
    expect(detected).toHaveLength(3);
    onDetect = async () => {};
  });

  it('skips photos already detected, and adds no task when every photo is done', async () => {
    detected = [];
    const started = await anna.post('/faces/detect', { photoIds: ids });
    expect(started.body.task.total).toBe(1);
    await queue.taskQueue.whenEnded(started.body.task.id);
    expect(detected.map((file) => path.basename(file))).toHaveLength(1);
    const again = await anna.post('/faces/detect', { photoIds: ids });
    expect([again.status, again.body.task]).toEqual([200, null]);
    const unassigned = await anna.get('/faces/unassigned');
    expect(unassigned.status).toBe(200);
  });
});
