import { inArray } from 'drizzle-orm';
import type { TaskInfo, TaskList } from '../../../shared/types.js';
import type { Principal } from '../auth/principal.js';
import { db } from '../db/index.js';
import { all } from '../db/query.js';
import { users } from '../db/schema.js';
import { fail } from '../services/apiError.js';
import { controlsAll, forbidden, requireControl, taskInfo } from './permissions.js';
import { isEnded, taskQueue, type TaskRecord } from './queue.js';

/** Current display names of the owners of these tasks that still exist. */
async function ownerNames(list: TaskRecord[]): Promise<Map<string, string>> {
  const ids = [...new Set(list.map((task) => task.ownerId).filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await all(db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, ids)));
  return new Map(rows.map((row) => [row.id, row.displayName]));
}

/** One task as the principal sees it. */
export async function describeTask(principal: Principal, task: TaskRecord): Promise<TaskInfo> {
  return taskInfo(principal, task, await ownerNames([task]));
}

/** `GET /api/tasks`. */
export async function listTasks(principal: Principal): Promise<TaskList> {
  const list = await taskQueue.list();
  const names = await ownerNames(list);
  return { tasks: list.map((task) => taskInfo(principal, task, names)) };
}

/** `POST /api/tasks/:id/pause`. */
export async function pauseTask(principal: Principal, id: string): Promise<TaskInfo> {
  requireControl(principal, await taskQueue.get(id));
  return describeTask(principal, await taskQueue.pause(id));
}

/** `POST /api/tasks/:id/resume`. */
export async function resumeTask(principal: Principal, id: string): Promise<TaskInfo> {
  requireControl(principal, await taskQueue.get(id));
  return describeTask(principal, await taskQueue.resume(id));
}

/** `DELETE /api/tasks/:id`: cancels a task, or removes an ended one from the list. */
export async function cancelTask(principal: Principal, id: string): Promise<TaskInfo | null> {
  const task = await taskQueue.get(id);
  requireControl(principal, task);
  if (isEnded(task.state)) {
    await taskQueue.remove(id);
    return null;
  }
  return describeTask(principal, await taskQueue.cancel(id));
}

/**
 * `POST /api/tasks/:id/move {before}`: users.manage moves any waiting or paused task anywhere; an owner moves
 * their task only among their own tasks.
 */
export async function moveTask(principal: Principal, id: string, body: unknown): Promise<TaskInfo> {
  const before = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).before : undefined;
  if (before !== null && (typeof before !== 'string' || before === '')) {
    fail(400, 'invalid_field', 'before must be a task id or null', { field: 'before' });
  }
  requireControl(principal, await taskQueue.get(id));
  const moved = await taskQueue.move(id, before, !controlsAll(principal), () => forbidden('users.manage'));
  return describeTask(principal, moved);
}
