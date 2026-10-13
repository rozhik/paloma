import type { Permission, TaskInfo, TaskKind } from '../../../shared/types.js';
import type { Principal } from '../auth/principal.js';
import { fail } from '../services/apiError.js';
import { isEnded, type TaskRecord } from './queue.js';

/** The permission that starts a task of each kind, and that its owner needs to control it. Scans are the system's. */
export const KIND_PERMISSION: Record<Exclude<TaskKind, 'scan'>, Permission> = {
  ai: 'ai.run',
  faces: 'people.manage',
  export: 'export',
};

/** With auth off, the single user controls every task, as users.manage does. */
export const controlsAll = (principal: Principal): boolean => principal.via === 'off' || principal.permissions.has('users.manage');

/** Whether the task was started by this principal's user (with auth off: every task that is not the system's). */
export function isOwn(principal: Principal, task: TaskRecord): boolean {
  if (task.system) return false;
  return principal.via === 'off' ? true : principal.user !== null && task.ownerId === principal.user.id;
}

/**
 * The permission the principal lacks to pause, resume, cancel or move the task, or to remove it once ended; null
 * when allowed. Another user's or a system task needs users.manage; an own task the permission of its kind.
 */
export function missingControl(principal: Principal, task: TaskRecord): Permission | null {
  if (controlsAll(principal)) return null;
  if (!isOwn(principal, task)) return 'users.manage';
  if (isEnded(task.state)) return null;
  const permission = KIND_PERMISSION[task.kind as Exclude<TaskKind, 'scan'>];
  return permission && !principal.permissions.has(permission) ? permission : null;
}

export function forbidden(permission: Permission): never {
  fail(403, 'permission_required', `This needs the permission ${permission}`, { permission });
}

export function requireControl(principal: Principal, task: TaskRecord): void {
  const missing = missingControl(principal, task);
  if (missing) forbidden(missing);
}

/**
 * The task as the principal may see it: everything for its owner and users.manage; for others only the kind,
 * subject, state, progress, times and who started it. A scan's folder is shown only to users who see the whole
 * library. `ownerNames` has the current display names of existing users.
 */
export function taskInfo(principal: Principal, task: TaskRecord, ownerNames: ReadonlyMap<string, string> = new Map()): TaskInfo {
  const mine = isOwn(principal, task);
  const full = mine || controlsAll(principal);
  return {
    id: task.id,
    kind: task.kind,
    state: task.state,
    system: task.system,
    ownerId: task.ownerId,
    ownerName: (task.ownerId && ownerNames.get(task.ownerId)) ?? task.ownerName,
    mine,
    canControl: missingControl(principal, task) === null,
    photoCount: task.subject.photoCount ?? null,
    aiTaskId: task.subject.aiTaskId ?? null,
    aiTaskName: task.subject.aiTaskName ?? null,
    folder: task.subject.folder !== undefined && principal.access.all ? task.subject.folder : null,
    total: task.total,
    done: task.done,
    failed: task.failed,
    error: full ? task.error : null,
    details: full ? structuredClone(task.details) : null,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    endedAt: task.endedAt,
  };
}
