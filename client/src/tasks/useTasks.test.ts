import { describe, it, expect, beforeEach } from 'vitest';
import type { TaskInfo } from '../../../shared/types.js';
import { canDropBefore, pollInterval, POLL_ACTIVE_MS, POLL_IDLE_MS, useTasks, type TaskDeps } from './useTasks.js';

const task = (patch: Partial<TaskInfo>): TaskInfo => ({
  id: 't', kind: 'export', state: 'waiting', system: false, ownerId: 'u1', ownerName: 'Ann', mine: true, canControl: true, photoCount: 2,
  aiTaskId: null, aiTaskName: null, folder: null, total: 2, done: 0, failed: 0, error: null, details: null, createdAt: '', startedAt: null,
  endedAt: null, ...patch,
});

const deps = (lists: TaskInfo[][], calls: string[] = []): TaskDeps => ({
  list: async () => ({ tasks: lists.shift() ?? [] }),
  pause: async (id) => { calls.push(`pause ${id}`); },
  resume: async (id) => { calls.push(`resume ${id}`); },
  cancel: async (id) => { calls.push(`cancel ${id}`); },
  move: async (id, before) => { calls.push(`move ${id} ${before}`); },
});

beforeEach(() => {
  useTasks.setState({ tasks: [], ended: [], error: null, viewers: 0 });
});

describe('task queue store', () => {
  it('polls often while the user has a task in the queue or the view is open, and rarely otherwise', () => {
    expect(pollInterval([], false)).toBe(POLL_IDLE_MS);
    expect(pollInterval([task({ mine: false })], false)).toBe(POLL_IDLE_MS);
    expect(pollInterval([task({ state: 'finished' })], false)).toBe(POLL_IDLE_MS);
    expect(pollInterval([task({})], false)).toBe(POLL_ACTIVE_MS);
    expect(pollInterval([task({ kind: 'scan', system: true, mine: false })], false)).toBe(POLL_ACTIVE_MS);
    expect(pollInterval([], true)).toBe(POLL_ACTIVE_MS);
  });

  it('keeps a message for the user\'s tasks that end while watched, not for old or others\' tasks', async () => {
    const own = task({ id: 'a', state: 'running' });
    const other = task({ id: 'b', state: 'running', mine: false });
    const old = task({ id: 'c', state: 'finished' });
    await useTasks.getState().refresh(deps([[own, other, old]]));
    expect(useTasks.getState().ended).toEqual([]);
    await useTasks.getState().refresh(deps([[{ ...own, state: 'finished' }, { ...other, state: 'cancelled' }, old]]));
    expect(useTasks.getState().ended.map((t) => t.id)).toEqual(['a']);
    useTasks.getState().dismissEnded('a');
    expect(useTasks.getState().ended).toEqual([]);
  });

  it('acts on a task and reloads the queue, keeping a refusal', async () => {
    const calls: string[] = [];
    await useTasks.getState().act('pause', 'a', deps([[task({ id: 'a', state: 'paused' })]], calls));
    await useTasks.getState().move('a', null, deps([], calls));
    expect(calls).toEqual(['pause a', 'move a null']);
    const refusing = { ...deps([]), cancel: async () => { throw new Error('403'); } };
    await useTasks.getState().act('cancel', 'a', refusing);
    expect(useTasks.getState().error).toEqual(new Error('403'));
  });
});

describe('dropping a dragged task', () => {
  const mine1 = task({ id: 'm1' });
  const mine2 = task({ id: 'm2' });
  const others = task({ id: 'o', mine: false, canControl: false });
  const running = task({ id: 'r', state: 'running' });
  const queue = [running, mine1, others, mine2];

  it('lets an owner drop only before their own waiting or paused tasks, or at the end', () => {
    expect(canDropBefore(mine2, mine1, queue, false)).toBe(true);
    expect(canDropBefore(mine2, others, queue, false)).toBe(false);
    expect(canDropBefore(mine2, running, queue, false)).toBe(false);
    expect(canDropBefore(mine1, null, queue, false)).toBe(true);
    expect(canDropBefore(mine1, mine1, queue, false)).toBe(false);
  });

  it('lets users.manage drop before any waiting task', () => {
    expect(canDropBefore(mine2, others, queue, true)).toBe(true);
  });
});
