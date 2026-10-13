import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { ExportTaskDetails, ScanTaskDetails, TaskInfo } from '../../../shared/types.js';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';
import type { TaskRecord, TaskRun } from '../tasks/queue.js';

/**
 * The tasks API with auth on. Tasks are added straight to the queue; the `export` and `scan` handlers here wait
 * for `release()` before each unit. anna: admin; eddie, eve: editors; vera: viewer; lim: editor with one folder.
 */
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let queueMod: typeof import('../tasks/queue.js');
let users: typeof import('../auth/users.js');
const client: Record<string, TestClient> = {};
const userId: Record<string, string> = {};
let waiting: Array<() => void> = [];

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
const release = async () => {
  await settle();
  waiting.shift()?.();
  await settle();
};

const exportDetails = (outputDir: string): ExportTaskDetails => ({ kind: 'export', outputDir, files: [`${outputDir}/a.jpg`], quotaExceeded: false });

const addExport = (owner: string, outputDir = 'holiday', units = 2) => queueMod.taskQueue.add({
  kind: 'export', owner: { id: userId[owner], name: owner }, subject: { photoCount: 12 }, params: { units },
  access: { all: true }, details: exportDetails(outputDir), total: units,
});

const addScan = (folder: string) => queueMod.taskQueue.add<{ units: number }, ScanTaskDetails>({
  kind: 'scan', system: true, subject: { folder }, params: { units: 1 }, details: { kind: 'scan', mode: 'full', indexed: 0, removed: 0 },
});

const listed = async (who: string, task: TaskRecord): Promise<TaskInfo> =>
  (await client[who].get('/tasks')).body.tasks.find((t: TaskInfo) => t.id === task.id);

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_tasks_routes_test_', { PALOMA_AUTH: 'on' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  app = await startTestApp();
  queueMod = await import('../tasks/queue.js');
  const unitHandler = async ({ task, stopping, progress }: TaskRun<{ units: number }>) => {
    while (task.done < task.params.units && !stopping()) {
      await new Promise<void>((resolve) => waiting.push(resolve));
      task.done += 1;
      progress();
    }
  };
  queueMod.taskQueue.register({ kind: 'export', run: unitHandler });
  queueMod.taskQueue.register({ kind: 'scan', run: unitHandler });
  users = await import('../auth/users.js');
  for (const [username, roleId] of [['anna', 'admin'], ['eddie', 'editor'], ['eve', 'editor'], ['vera', 'viewer']]) {
    userId[username] = (await users.createUser({ username, roleId, password: 'correct horse battery', displayName: `${username[0].toUpperCase()}${username.slice(1)} Avery` }, { mustChangePassword: false })).id;
  }
  userId.lim = (await users.createUser({ username: 'lim', roleId: 'editor', password: 'correct horse battery', access: { all: false, folders: ['/photos/a'] } }, { mustChangePassword: false })).id;
  for (const username of Object.keys(userId)) {
    client[username] = new TestClient(app.base);
    expect((await client[username].post('/auth/login/password', { username, password: 'correct horse battery' })).status).toBe(200);
  }
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

beforeEach(async () => {
  // Ends whatever the last test left running
  for (const task of queueMod.taskQueue.active()) await queueMod.taskQueue.cancel(task.id);
  while (waiting.length > 0) await release();
  await queueMod.taskQueue.idle();
});

describe('listing', () => {
  it('needs a login', async () => {
    expect((await new TestClient(app.base).get('/tasks')).status).toBe(401);
  });

  it('shows another user\'s export with its starter and progress, without its destination or files', async () => {
    const task = await addExport('eve');
    await settle();
    const seen = await listed('vera', task);
    expect(seen).toMatchObject({ kind: 'export', state: 'running', ownerName: 'Eve Avery', mine: false, canControl: false, photoCount: 12, total: 2, done: 0 });
    expect([seen.details, seen.error]).toEqual([null, null]);
    expect(JSON.stringify(seen)).not.toContain('holiday');
    const own = await listed('eve', task);
    expect(own).toMatchObject({ mine: true, canControl: true, details: { outputDir: 'holiday', files: ['holiday/a.jpg'] } });
    expect((await listed('anna', task)).details).toMatchObject({ outputDir: 'holiday' });
  });

  it('shows a scan\'s folder only to users who see the whole library', async () => {
    const scan = await addScan('/photos/private');
    await settle();
    expect(await listed('lim', scan)).toMatchObject({ system: true, ownerName: null, folder: null, canControl: false });
    expect(await listed('eddie', scan)).toMatchObject({ folder: '/photos/private', canControl: false });
    expect(await listed('anna', scan)).toMatchObject({ folder: '/photos/private', canControl: true });
  });

  it('lists running, waiting and paused tasks in queue order, then ended tasks', async () => {
    const a = await addExport('eve');
    const b = await addExport('eddie');
    const c = await addExport('eve');
    await settle();
    await queueMod.taskQueue.pause(b.id);
    const ids = (await client.vera.get('/tasks')).body.tasks.map((t: TaskInfo) => t.id);
    expect(ids.slice(0, 3)).toEqual([a.id, b.id, c.id]);
  });
});

describe('controlling', () => {
  it('lets the owner pause, resume and cancel their task', async () => {
    const running = await addExport('eve', 'x', 3);
    await settle();
    expect((await client.eve.post(`/tasks/${running.id}/pause`)).body.state).toBe('pausing');
    expect((await client.eve.post(`/tasks/${running.id}/resume`)).body.state).toBe('running');
    const { status, body } = await client.eve.delete(`/tasks/${running.id}`);
    expect([status, body.task.state]).toEqual([200, 'cancelling']);
    await release();
    expect((await listed('eve', running)).state).toBe('cancelled');
  });

  it('refuses another user\'s task to an editor, naming users.manage, and allows it to an administrator', async () => {
    const task = await addExport('eve');
    await settle();
    for (const [method, url] of [['POST', `/tasks/${task.id}/pause`], ['DELETE', `/tasks/${task.id}`], ['POST', `/tasks/${task.id}/move`]]) {
      const { status, body } = await client.eddie.send(method, url, method === 'POST' ? { before: null } : undefined);
      expect([status, body.params?.permission], url).toEqual([403, 'users.manage']);
    }
    expect((await listed('eve', task)).state).toBe('running');
    expect((await client.anna.delete(`/tasks/${task.id}`)).body.task.state).toBe('cancelling');
  });

  it('refuses a system task to everyone but users.manage', async () => {
    const scan = await addScan('/photos/a');
    expect((await client.eddie.post(`/tasks/${scan.id}/pause`)).status).toBe(403);
    expect((await client.anna.post(`/tasks/${scan.id}/pause`)).body.state).toMatch(/paus/);
  });

  it('needs the permission of the task\'s kind to control an own task', async () => {
    const task = await addExport('vera');
    const { status, body } = await client.vera.delete(`/tasks/${task.id}`);
    expect([status, body.code, body.params.permission]).toEqual([403, 'permission_required', 'export']);
    expect((await listed('vera', task)).canControl).toBe(false);
  });

  it('answers 404 for an unknown task and 409 for a change its state does not allow', async () => {
    expect((await client.anna.post('/tasks/nope/pause')).status).toBe(404);
    const task = await addExport('eve');
    await settle();
    const { status, body } = await client.eve.post(`/tasks/${task.id}/resume`);
    expect([status, body.code, body.params.state]).toEqual([409, 'task_state', 'running']);
  });

  it('removes an own ended task from the list', async () => {
    const task = await addExport('eve', 'x', 1);
    await release();
    expect((await listed('eve', task)).state).toBe('finished');
    expect((await client.eddie.delete(`/tasks/${task.id}`)).status).toBe(403);
    expect((await client.eve.delete(`/tasks/${task.id}`)).body).toEqual({ task: null });
    expect(await listed('eve', task)).toBeUndefined();
  });
});

describe('moving', () => {
  it('reorders own tasks without overtaking other users', async () => {
    await addExport('anna', 'first', 1);
    const tags = await addExport('eve');
    const export_ = await addExport('eddie');
    const objects = await addExport('eve');
    await settle();
    expect((await client.eve.post(`/tasks/${objects.id}/move`, { before: tags.id })).status).toBe(200);
    const order = async () => (await client.vera.get('/tasks')).body.tasks.slice(1, 4).map((t: TaskInfo) => t.id);
    expect(await order()).toEqual([objects.id, export_.id, tags.id]);

    const refused = await client.eve.post(`/tasks/${tags.id}/move`, { before: export_.id });
    expect([refused.status, refused.body.params.permission]).toEqual([403, 'users.manage']);
    expect((await client.eve.post(`/tasks/${tags.id}/move`, { before: 'x'.repeat(0) })).status).toBe(400);

    expect((await client.anna.post(`/tasks/${tags.id}/move`, { before: objects.id })).status).toBe(200);
    expect(await order()).toEqual([tags.id, objects.id, export_.id]);
  });
});

describe('users', () => {
  it('cancels the waiting tasks of a deleted user, and keeps their name on ended tasks', async () => {
    const temp = await users.createUser({ username: 'temp', roleId: 'editor', password: 'correct horse battery', displayName: 'Temp User' }, { mustChangePassword: false });
    userId.temp = temp.id;
    await addExport('anna', 'busy', 1);
    const task = await addExport('temp');
    await users.deleteUser(userId.anna, temp.id);
    const seen = await listed('anna', task);
    expect([seen.state, seen.done, seen.ownerName]).toEqual(['cancelled', 0, 'temp']);
  });

  it('cancels the tasks of a disabled user', async () => {
    const task = await addExport('eddie');
    await users.updateUser(userId.anna, userId.eddie, { enabled: false });
    await release();
    expect((await listed('anna', task)).state).toBe('cancelled');
    await users.updateUser(userId.anna, userId.eddie, { enabled: true });
  });
});
