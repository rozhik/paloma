import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { LibraryAccess, TaskDetails, TaskKind, TaskState } from '../../../shared/types.js';
import { db } from '../db/index.js';
import { all, run } from '../db/query.js';
import { tasks } from '../db/schema.js';
import { runWithAccess } from '../auth/scope.js';
import { fail } from '../services/apiError.js';

export const ENDED_STATES: readonly TaskState[] = ['finished', 'cancelled', 'failed'];
/** Ended tasks are listed this long, and at most this many. */
export const KEEP_ENDED_MS = 7 * 24 * 60 * 60 * 1000;
export const KEEP_ENDED_COUNT = 100;
/** Progress is saved at most this often while a task runs; state changes are saved at once. */
export const PROGRESS_SAVE_MS = 1000;

export const isEnded = (state: TaskState): boolean => ENDED_STATES.includes(state);

/** What anyone may see about a task besides its progress. */
export interface TaskSubject {
  photoCount?: number;
  aiTaskId?: string;
  aiTaskName?: string | null;
  /** The configured folder of a scan */
  folder?: string;
}

/** A task as the server keeps it. `params` is private to the server; `details` is shown to its owner. */
export interface TaskRecord<P = unknown, D extends TaskDetails = TaskDetails> {
  id: string;
  kind: TaskKind;
  ownerId: string | null;
  ownerName: string | null;
  system: boolean;
  state: TaskState;
  position: number;
  subject: TaskSubject;
  params: P;
  access: LibraryAccess | null;
  details: D;
  total: number;
  done: number;
  failed: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface NewTask<P, D extends TaskDetails> {
  /** Chosen by the caller when it must know the id before the task is added */
  id?: string;
  kind: TaskKind;
  /** The user who adds it; null with auth off. Ignored for system tasks */
  owner?: { id: string; name: string } | null;
  system?: boolean;
  subject: TaskSubject;
  params: P;
  access?: LibraryAccess | null;
  details: D;
  total?: number;
}

/** The running task as its handler sees it. */
export interface TaskRun<P = unknown, D extends TaskDetails = TaskDetails> {
  readonly task: TaskRecord<P, D>;
  /** True once pausing or cancelling was asked: the handler ends the units in progress and returns */
  stopping(): boolean;
  /** Saves progress, params and details; at most once per PROGRESS_SAVE_MS */
  progress(): void;
}

/**
 * Does the work of one kind of task. `run` continues from what `task.params` and the library say is done, so a
 * paused, interrupted or restarted task picks up where it stopped. Throwing `TaskFailed` (or anything else) ends
 * the task as `failed` with the message.
 */
export interface TaskHandler<P = unknown, D extends TaskDetails = TaskDetails> {
  kind: TaskKind;
  run(run: TaskRun<P, D>): Promise<void>;
}

/** Thrown by a handler when its task cannot go on. */
export class TaskFailed extends Error {}

const now = () => new Date().toISOString();

type Row = typeof tasks.$inferSelect;

function fromRow(row: Row): TaskRecord {
  return {
    id: row.id, kind: row.kind, ownerId: row.ownerId, ownerName: row.ownerName, system: row.system, state: row.state, position: row.position,
    subject: JSON.parse(row.subject) as TaskSubject, params: JSON.parse(row.params) as unknown,
    access: row.access ? JSON.parse(row.access) as LibraryAccess : null, details: JSON.parse(row.details) as TaskDetails,
    total: row.total, done: row.done, failed: row.failed, error: row.error, createdAt: row.createdAt, startedAt: row.startedAt, endedAt: row.endedAt,
  };
}

function toRow(task: TaskRecord): Row {
  return {
    id: task.id, kind: task.kind, ownerId: task.ownerId, ownerName: task.ownerName, system: task.system, state: task.state, position: task.position,
    subject: JSON.stringify(task.subject), params: JSON.stringify(task.params), access: task.access ? JSON.stringify(task.access) : null,
    details: JSON.stringify(task.details), total: task.total, done: task.done, failed: task.failed, error: task.error, createdAt: task.createdAt,
    startedAt: task.startedAt, endedAt: task.endedAt,
  };
}

const stateError = (task: TaskRecord, action: string): never =>
  fail(409, 'task_state', `A ${task.state} task cannot be ${action}`, { state: task.state });

/** Positions closer than this are renumbered before a task goes between them. */
const MIN_GAP = 1e-6;

/**
 * The server's task queue: one task runs at a time, the first waiting one in position order. Tasks are kept in
 * the `tasks` table and survive a restart. Permission checks are the caller's (tasks/permissions.ts).
 */
export class TaskQueue {
  private readonly handlers = new Map<TaskKind, TaskHandler<any, any>>();
  private readonly byId = new Map<string, TaskRecord>();
  private loading: Promise<void> | null = null;
  private loaded = false;
  private held = false;
  private current: TaskRecord | null = null;
  private readonly enders = new Map<string, Array<(task: TaskRecord) => void>>();
  private idlers: Array<() => void> = [];
  private readonly saveTimers = new Map<string, { timer: NodeJS.Timeout | null; last: number }>();
  /** Called after a task changes state; used by scans to know when their task has ended */
  private readonly listeners = new Set<(task: TaskRecord) => void>();

  register(handler: TaskHandler<any, any>): void {
    this.handlers.set(handler.kind, handler);
  }

  /** Keeps tasks from starting until `release()`; the server holds the queue until its start-up scans are added. */
  hold(): void {
    this.held = true;
  }

  release(): void {
    this.held = false;
    this.kick();
  }

  onChange(listener: (task: TaskRecord) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Reads the tasks once: a task that was running is waiting again at the front of the queue, one that was being
   * cancelled is cancelled, and old ended tasks are dropped.
   */
  load(): Promise<void> {
    this.loading ??= (async () => {
      const rows = (await all(db.select().from(tasks))).map(fromRow);
      const active = rows.filter((task) => !isEnded(task.state));
      let front = Math.min(1, ...active.map((task) => task.position)) - active.length;
      const changed: TaskRecord[] = [];
      for (const task of rows) {
        this.byId.set(task.id, task);
        if (task.state === 'running' || task.state === 'pausing') {
          task.state = 'waiting';
          task.position = front++;
          changed.push(task);
        } else if (task.state === 'cancelling') {
          task.state = 'cancelled';
          task.endedAt = now();
          changed.push(task);
        }
      }
      for (const task of changed) await this.save(task);
      await this.prune();
      this.loaded = true;
    })();
    return this.loading.then(() => this.kick());
  }

  /** Running, waiting and paused tasks in queue order. */
  active(): TaskRecord[] {
    return [...this.byId.values()].filter((task) => !isEnded(task.state))
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  }

  /** Ended tasks, newest first. */
  ended(): TaskRecord[] {
    return [...this.byId.values()].filter((task) => isEnded(task.state))
      .sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));
  }

  async list(): Promise<TaskRecord[]> {
    await this.load();
    return [...this.active(), ...this.ended()];
  }

  async get(id: string): Promise<TaskRecord> {
    await this.load();
    const task = this.byId.get(id);
    if (!task) fail(404, 'task_not_found', `Task ${id} not found`, { id });
    return task;
  }

  /** The first task that has not ended and matches, in queue order. */
  async find(match: (task: TaskRecord) => boolean): Promise<TaskRecord | undefined> {
    await this.load();
    return this.active().find(match);
  }

  /**
   * Adds a task: a user's at the end of the queue, a system task after the waiting system tasks and before the
   * first waiting or paused user task.
   */
  async add<P, D extends TaskDetails>(input: NewTask<P, D>): Promise<TaskRecord<P, D>> {
    await this.load();
    const system = input.system === true;
    const task: TaskRecord<P, D> = {
      id: input.id ?? crypto.randomUUID(), kind: input.kind, ownerId: system ? null : input.owner?.id ?? null, ownerName: system ? null : input.owner?.name ?? null,
      system, state: 'waiting', position: 0, subject: input.subject, params: input.params, access: input.access ?? null, details: input.details,
      total: input.total ?? 0, done: 0, failed: 0, error: null, createdAt: now(), startedAt: null, endedAt: null,
    };
    const queue = this.active();
    const firstUser = system ? queue.findIndex((t) => !t.system && t.state !== 'running' && t !== this.current) : -1;
    task.position = firstUser === -1 ? this.positionBetween(queue.at(-1), undefined)! : await this.positionBefore(queue, firstUser);
    this.byId.set(task.id, task as TaskRecord);
    await this.save(task as TaskRecord);
    this.kick();
    return task;
  }

  /** Waiting → paused; running → pausing, paused once its units in progress end. */
  async pause(id: string): Promise<TaskRecord> {
    const task = await this.get(id);
    if (task.state === 'waiting') task.state = 'paused';
    else if (task.state === 'running') task.state = 'pausing';
    else if (task.state !== 'paused' && task.state !== 'pausing') stateError(task, 'paused');
    await this.changed(task);
    return task;
  }

  /** Paused → waiting at its position; pausing → running again. */
  async resume(id: string): Promise<TaskRecord> {
    const task = await this.get(id);
    if (task.state === 'paused') task.state = 'waiting';
    else if (task.state === 'pausing') task.state = 'running';
    else stateError(task, 'resumed');
    await this.changed(task);
    this.kick();
    return task;
  }

  /** Waiting or paused → cancelled at once; running → cancelling, cancelled once its units in progress end. */
  async cancel(id: string): Promise<TaskRecord> {
    const task = await this.get(id);
    if (task.state === 'waiting' || task.state === 'paused') {
      task.state = 'cancelled';
      task.endedAt = now();
      await this.changed(task);
      this.ended$(task);
    } else if (task.state === 'running' || task.state === 'pausing') {
      task.state = 'cancelling';
      await this.changed(task);
    } else if (task.state !== 'cancelling') {
      stateError(task, 'cancelled');
    }
    return task;
  }

  /** Removes an ended task from the list. */
  async remove(id: string): Promise<void> {
    const task = await this.get(id);
    if (!isEnded(task.state)) stateError(task, 'removed');
    this.byId.delete(id);
    await run(db.delete(tasks).where(eq(tasks.id, id)));
  }

  /** Cancels every task of a user that has not ended (the user was disabled or deleted). */
  async cancelOwnedBy(userId: string): Promise<void> {
    await this.load();
    for (const task of this.active().filter((t) => t.ownerId === userId && t.state !== 'cancelling')) await this.cancel(task.id);
  }

  /**
   * Moves a waiting or paused task before `before` (null: to the end). `ownOnly` keeps every other user's task in
   * its place: the owner's movable tasks are reordered within the positions they hold, and `before` must be one
   * of them; anything else is refused with `notAllowed`.
   */
  async move(id: string, before: string | null, ownOnly: boolean, notAllowed: () => never): Promise<TaskRecord> {
    const task = await this.get(id);
    if (task.state !== 'waiting' && task.state !== 'paused') stateError(task, 'moved');
    if (before === id) return task;
    const target = before === null ? null : await this.get(before);
    if (target && target.state !== 'waiting' && target.state !== 'paused') stateError(target, 'moved before');
    const movable = (t: TaskRecord) => (t.state === 'waiting' || t.state === 'paused') && t !== this.current;

    if (ownOnly) {
      const own = this.active().filter((t) => movable(t) && !t.system && t.ownerId === task.ownerId);
      if (target && !own.includes(target)) notAllowed();
      const slots = own.map((t) => t.position);
      const order = own.filter((t) => t !== task);
      order.splice(target ? order.indexOf(target) : order.length, 0, task);
      for (const [index, t] of order.entries()) {
        if (t.position !== slots[index]) {
          t.position = slots[index];
          await this.save(t);
        }
      }
      return task;
    }

    const queue = this.active().filter((t) => t !== task);
    task.position = target ? await this.positionBefore(queue, queue.indexOf(target)) : this.positionBetween(queue.at(-1), undefined)!;
    await this.save(task);
    this.kick();
    return task;
  }

  /** Resolves with the task once it has ended. */
  async whenEnded(id: string): Promise<TaskRecord> {
    const task = await this.get(id);
    if (isEnded(task.state)) return task;
    return new Promise((resolve) => {
      this.enders.set(id, [...(this.enders.get(id) ?? []), resolve]);
    });
  }

  /** Resolves when no task runs and none waits (paused tasks may remain); for tests and shutdown. */
  async idle(): Promise<void> {
    await this.load();
    if (!this.current && !this.active().some((t) => t.state === 'waiting')) return;
    await new Promise<void>((resolve) => this.idlers.push(resolve));
  }

  // --- running ---

  private kick(): void {
    if (!this.loaded || this.held || this.current) return;
    const next = this.active().find((task) => task.state === 'waiting');
    if (!next) {
      const idlers = this.idlers;
      this.idlers = [];
      for (const resolve of idlers) resolve();
      return;
    }
    this.current = next;
    void this.execute(next);
  }

  private async execute(task: TaskRecord): Promise<void> {
    try {
      task.state = 'running';
      task.startedAt ??= now();
      task.error = null;
      await this.changed(task);
      const handler = this.handlers.get(task.kind);
      const context: TaskRun = {
        task,
        stopping: () => task.state !== 'running',
        progress: () => this.saveSoon(task),
      };
      try {
        if (!handler) throw new TaskFailed(`Tasks of kind ${task.kind} cannot run`);
        // A fresh access scope: the task may have been started from inside another request
        await runWithAccess(task.access ?? { all: true }, () => handler.run(context));
        // Pause or cancel may have been asked while the handler ran
        const asked = task.state as TaskState;
        task.state = asked === 'cancelling' ? 'cancelled' : asked === 'pausing' ? 'paused' : 'finished';
      } catch (err) {
        if ((task.state as TaskState) === 'cancelling') {
          task.state = 'cancelled';
        } else {
          task.state = 'failed';
          task.error = err instanceof Error ? err.message : String(err);
          if (!(err instanceof TaskFailed)) console.error(`Task ${task.id} (${task.kind}) failed:`, err);
        }
      }
      if (isEnded(task.state)) task.endedAt = now();
      await this.changed(task);
      if (isEnded(task.state)) {
        this.ended$(task);
        await this.prune();
      }
    } catch (err) {
      console.error(`Failed to save task ${task.id}:`, err);
    } finally {
      this.current = null;
      setImmediate(() => this.kick());
    }
  }

  private ended$(task: TaskRecord): void {
    const enders = this.enders.get(task.id) ?? [];
    this.enders.delete(task.id);
    for (const resolve of enders) resolve(task);
  }

  // --- saving ---

  /** Saves a state change at once and tells the listeners. */
  private async changed(task: TaskRecord): Promise<void> {
    await this.save(task);
    for (const listener of this.listeners) listener(task);
  }

  private async save(task: TaskRecord): Promise<void> {
    const pending = this.saveTimers.get(task.id);
    if (pending?.timer) clearTimeout(pending.timer);
    this.saveTimers.set(task.id, { timer: null, last: Date.now() });
    const row = toRow(task);
    await run(db.insert(tasks).values(row).onConflictDoUpdate({ target: tasks.id, set: row }));
  }

  private saveSoon(task: TaskRecord): void {
    const entry = this.saveTimers.get(task.id) ?? { timer: null, last: 0 };
    if (entry.timer) return;
    const wait = Math.max(0, entry.last + PROGRESS_SAVE_MS - Date.now());
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (this.byId.get(task.id) === task) this.save(task).catch((err) => console.error(`Failed to save task ${task.id}:`, err));
    }, wait);
    entry.timer.unref?.();
    this.saveTimers.set(task.id, entry);
  }

  /** Drops ended tasks older than KEEP_ENDED_MS and beyond the KEEP_ENDED_COUNT newest. */
  private async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - KEEP_ENDED_MS).toISOString();
    const drop = this.ended().filter((task, index) => index >= KEEP_ENDED_COUNT || (task.endedAt ?? '') < cutoff).map((task) => task.id);
    if (drop.length === 0) return;
    for (const id of drop) {
      this.byId.delete(id);
      this.saveTimers.delete(id);
    }
    await run(db.delete(tasks).where(inArray(tasks.id, drop)));
  }

  // --- positions ---

  /** A position between `queue[index - 1]` and `queue[index]`; renumbers the queue when they are too close. */
  private async positionBefore(queue: TaskRecord[], index: number): Promise<number> {
    const position = this.positionBetween(queue[index - 1], queue[index]);
    if (position !== null) return position;
    await this.renumber();
    return this.positionBetween(queue[index - 1], queue[index])!;
  }

  private positionBetween(previous: TaskRecord | undefined, next: TaskRecord | undefined): number | null {
    if (previous && next) return next.position - previous.position < MIN_GAP ? null : (previous.position + next.position) / 2;
    if (previous) return previous.position + 1;
    if (next) return next.position - 1;
    return 1;
  }

  /** Spreads the positions of the tasks that have not ended to 1, 2, 3… */
  private async renumber(): Promise<void> {
    for (const [index, task] of this.active().entries()) {
      task.position = index + 1;
      await this.save(task);
    }
  }
}

export const taskQueue = new TaskQueue();
