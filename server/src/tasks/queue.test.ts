import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { ExportTaskDetails, TaskState } from '../../../shared/types.js';
import { openTestDatabase } from '../auth/testing.js';
import type { TaskQueue as TaskQueueType, TaskRecord, TaskRun } from './queue.js';

/**
 * The queue with a test handler of kind `export`: each task processes `params.units` units; a unit resolves when
 * the test calls `step()`, so tests decide when work happens.
 */
let cleanup: () => void;
let mod: typeof import('./queue.js');
let queue: TaskQueueType;
let started: string[];
let waiting: Array<() => void>;

const details = (): ExportTaskDetails => ({ kind: 'export', outputDir: 'x', files: [], quotaExceeded: false });

/** Lets queued promises and timers settle. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};

/** Ends the unit in progress. */
async function step(): Promise<void> {
  await settle();
  waiting.shift()?.();
  await settle();
}

function newQueue(): TaskQueueType {
  const q = new mod.TaskQueue();
  q.register({
    kind: 'export',
    run: async ({ task, stopping, progress }: TaskRun<{ units: number; fail?: string }>) => {
      started.push(task.id);
      while (task.done < task.params.units && !stopping()) {
        await new Promise<void>((resolve) => waiting.push(resolve));
        task.done += 1;
        progress();
        if (task.params.fail && task.done === 1) throw new mod.TaskFailed(task.params.fail);
      }
    },
  });
  return q;
}

const add = (owner: string | null, units = 2, extra: { system?: boolean; fail?: string } = {}) => queue.add({
  kind: 'export', owner: owner ? { id: owner, name: owner.toUpperCase() } : null, system: extra.system, subject: { photoCount: units },
  params: { units, ...(extra.fail ? { fail: extra.fail } : {}) }, details: details(), total: units,
});

const order = () => queue.active().map((t) => `${t.system ? 'sys' : t.ownerId}:${t.state}`);
const stateOf = async (task: TaskRecord): Promise<TaskState> => (await queue.get(task.id)).state;

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_task_queue_test_'));
  mod = await import('./queue.js');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
  cleanup();
});

beforeEach(async () => {
  const { connection } = await import('../db/index.js');
  connection().exec('DELETE FROM tasks');
  started = [];
  waiting = [];
  queue = newQueue();
});

describe('order and running', () => {
  it('runs one task at a time in the order they were added', async () => {
    const a = await add('anna');
    const b = await add('ben');
    await settle();
    expect(started).toEqual([a.id]);
    expect(order()).toEqual(['anna:running', 'ben:waiting']);
    await step();
    await step();
    expect(await stateOf(a)).toBe('finished');
    expect(started).toEqual([a.id, b.id]);
    await step();
    await step();
    expect(await stateOf(b)).toBe('finished');
    expect((await queue.get(b.id)).done).toBe(2);
  });

  it('skips a paused task and starts the next waiting one', async () => {
    const a = await add('anna');
    const b = await add('ben');
    const c = await add('carol');
    await queue.pause(b.id);
    await step();
    await step();
    expect(started).toEqual([a.id, c.id]);
    expect(await stateOf(b)).toBe('paused');
  });

  it('places a system task after waiting system tasks and before waiting user tasks', async () => {
    await add('anna');
    await add('ben');
    await add(null, 1, { system: true });
    await add(null, 1, { system: true });
    await settle();
    expect(order()).toEqual(['anna:running', 'sys:waiting', 'sys:waiting', 'ben:waiting']);
  });

  it('fails a task with the handler\'s message', async () => {
    const a = await add('anna', 3, { fail: 'The provider refused the key' });
    await step();
    const task = await queue.get(a.id);
    expect([task.state, task.error, task.endedAt !== null]).toEqual(['failed', 'The provider refused the key', true]);
  });

  it('keeps server paths out of a failed task\'s message', async () => {
    const a = await add('anna', 3, { fail: "ENOENT: no such file or directory, open '/srv/photos/trip/a.jpg'" });
    await step();
    expect((await queue.get(a.id)).error).toBe("ENOENT: no such file or directory, open '<path>'");
  });

  it('holds tasks until released', async () => {
    queue.hold();
    const a = await add('anna');
    await settle();
    expect(await stateOf(a)).toBe('waiting');
    queue.release();
    await settle();
    expect(await stateOf(a)).toBe('running');
  });
});

describe('pause, resume and cancel', () => {
  it('pauses the running task after its unit in progress, starts the next, and continues it when resumed', async () => {
    const a = await add('anna', 3);
    const b = await add('ben', 1);
    await settle();
    expect((await queue.pause(a.id)).state).toBe('pausing');
    await step();
    expect([await stateOf(a), (await queue.get(a.id)).done]).toEqual(['paused', 1]);
    expect(await stateOf(b)).toBe('running');
    await queue.resume(a.id);
    await step();
    expect(await stateOf(b)).toBe('finished');
    await step();
    await step();
    const resumed = await queue.get(a.id);
    expect([resumed.state, resumed.done]).toEqual(['finished', 3]);
  });

  it('resumes a pausing task as running', async () => {
    const a = await add('anna', 2);
    await settle();
    await queue.pause(a.id);
    expect((await queue.resume(a.id)).state).toBe('running');
    await step();
    await step();
    expect(await stateOf(a)).toBe('finished');
  });

  it('refuses to resume a running task, and to pause an ended one', async () => {
    const a = await add('anna', 1);
    await settle();
    await expect(queue.resume(a.id)).rejects.toMatchObject({ status: 409, body: { code: 'task_state', params: { state: 'running' } } });
    await step();
    await expect(queue.pause(a.id)).rejects.toMatchObject({ status: 409 });
  });

  it('cancels a waiting task at once, and a running one after its unit in progress', async () => {
    const a = await add('anna', 3);
    const b = await add('ben');
    await settle();
    expect((await queue.cancel(b.id)).state).toBe('cancelled');
    expect((await queue.cancel(a.id)).state).toBe('cancelling');
    await step();
    const task = await queue.get(a.id);
    expect([task.state, task.done]).toEqual(['cancelled', 1]);
    expect(started).toEqual([a.id]);
  });

  it('cancels the tasks of a user', async () => {
    const a = await add('anna', 2);
    const b = await add('anna');
    const c = await add('ben');
    await settle();
    await queue.cancelOwnedBy('anna');
    await step();
    expect([await stateOf(a), await stateOf(b), await stateOf(c)]).toEqual(['cancelled', 'cancelled', 'running']);
  });

  it('removes only ended tasks', async () => {
    const a = await add('anna', 1);
    await settle();
    await expect(queue.remove(a.id)).rejects.toMatchObject({ status: 409 });
    await step();
    await queue.remove(a.id);
    await expect(queue.get(a.id)).rejects.toMatchObject({ status: 404, body: { code: 'task_not_found' } });
  });

  it('resolves whenEnded with the ended task', async () => {
    const a = await add('anna', 1);
    const ended = queue.whenEnded(a.id);
    await step();
    expect((await ended).state).toBe('finished');
  });
});

describe('moving', () => {
  const notAllowed = (): never => {
    throw new Error('not allowed');
  };

  it('swaps two own tasks around another user\'s task', async () => {
    await add('zed', 1);
    const tags = await add('anna');
    await add('ben');
    const objects = await add('anna');
    await settle();
    await queue.move(objects.id, tags.id, true, notAllowed);
    expect(queue.active().slice(1).map((t) => t.id === objects.id ? 'objects' : t.id === tags.id ? 'tags' : t.ownerId))
      .toEqual(['objects', 'ben', 'tags']);
  });

  it('does not let an owner overtake another user\'s task', async () => {
    await add('zed', 1);
    const export_ = await add('ben');
    const tags = await add('anna');
    await settle();
    await expect(queue.move(tags.id, export_.id, true, notAllowed)).rejects.toThrow('not allowed');
    expect(queue.active().map((t) => t.ownerId)).toEqual(['zed', 'ben', 'anna']);
  });

  it('lets an administrator move a task to any position, and to the end', async () => {
    await add('zed', 1);
    const export_ = await add('ben');
    const tags = await add('carol');
    await settle();
    await queue.move(tags.id, export_.id, false, notAllowed);
    expect(queue.active().map((t) => t.ownerId)).toEqual(['zed', 'carol', 'ben']);
    await queue.move(tags.id, null, false, notAllowed);
    expect(queue.active().map((t) => t.ownerId)).toEqual(['zed', 'ben', 'carol']);
  });

  it('refuses to move the running task', async () => {
    const a = await add('anna');
    await add('anna');
    await settle();
    await expect(queue.move(a.id, null, true, notAllowed)).rejects.toMatchObject({ status: 409 });
  });

  it('keeps moving when positions get close', async () => {
    await add('zed', 1);
    const a = await add('carol');
    const b = await add('carol');
    await settle();
    for (let i = 0; i < 60; i++) await queue.move(i % 2 ? a.id : b.id, i % 2 ? b.id : a.id, false, notAllowed);
    expect(new Set(queue.active().map((t) => t.position)).size).toBe(3);
  });
});

describe('restart', () => {
  it('puts a running task back in front as waiting, keeps paused tasks paused, and ends cancelling ones', async () => {
    const a = await add('anna', 3);
    const b = await add('ben');
    const c = await add('carol');
    await settle();
    await step();
    await queue.pause(b.id);
    const { connection } = await import('../db/index.js');
    connection().prepare("UPDATE tasks SET state = 'cancelling' WHERE id = ?").run(c.id);
    connection().prepare('UPDATE tasks SET done = 1 WHERE id = ?').run(a.id);

    // A new server: the old queue's unit in progress never ends
    queue = newQueue();
    waiting = [];
    queue.hold();
    await queue.load();
    const sys = await add(null, 1, { system: true });
    expect(queue.active().map((t) => [t.id, t.state])).toEqual([[sys.id, 'waiting'], [a.id, 'waiting'], [b.id, 'paused']]);
    expect(await stateOf(c)).toBe('cancelled');
    queue.release();
    await step();
    await step();
    await step();
    const resumed = await queue.get(a.id);
    expect([resumed.state, resumed.done]).toEqual(['finished', 3]);
  });

  it('drops ended tasks older than 7 days and beyond the newest 100', async () => {
    const { connection } = await import('../db/index.js');
    const insert = connection().prepare(`INSERT INTO tasks (id, kind, state, position, subject, params, details, created_at, ended_at)
      VALUES (?, 'export', 'finished', 0, '{}', '{}', '{}', ?, ?)`);
    const day = 24 * 60 * 60 * 1000;
    insert.run('old', '2020-01-01', new Date(Date.now() - 8 * day).toISOString());
    for (let i = 0; i < 101; i++) insert.run(`t${i}`, '2020-01-01', new Date(Date.now() - i * 1000).toISOString());
    queue = newQueue();
    const ids = (await queue.list()).map((t) => t.id);
    expect(ids).toHaveLength(100);
    expect(ids).not.toContain('old');
    expect(ids).not.toContain('t100');
    expect(ids[0]).toBe('t0');
  });
});
