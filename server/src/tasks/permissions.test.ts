import { describe, it, expect } from 'vitest';
import type { Permission } from '../../../shared/types.js';
import { OFF_PRINCIPAL, type Principal } from '../auth/principal.js';
import type { UserRow } from '../auth/users.js';
import { missingControl, taskInfo } from './permissions.js';
import type { TaskRecord } from './queue.js';

const task = (over: Partial<TaskRecord>): TaskRecord => ({
  id: 't', kind: 'ai', ownerId: 'u1', ownerName: 'Ann', system: false, state: 'waiting', position: 1, subject: { aiTaskId: 'tags', aiTaskName: null, photoCount: 3 },
  params: {}, access: null, details: { kind: 'ai', output: 'tags', again: false, tagsAdded: 0, descriptionsSet: 0, inputTokens: 0, outputTokens: 0, failures: [], photoIds: [1] },
  total: 3, done: 0, failed: 0, error: 'boom', createdAt: '', startedAt: null, endedAt: null, ...over,
});

const user = (id: string, permissions: Permission[], all = true): Principal => ({
  user: { id } as UserRow, permissions: new Set(permissions), access: all ? { all: true } : { all: false, folders: [], albums: [] }, via: 'session', rateLimit: null,
});

describe('task permissions', () => {
  it('with auth off, every task is controlled and every user task is the user\'s own', () => {
    expect(missingControl(OFF_PRINCIPAL, task({ system: true, kind: 'scan', ownerId: null }))).toBeNull();
    expect(taskInfo(OFF_PRINCIPAL, task({ ownerId: null })).mine).toBe(true);
    expect(taskInfo(OFF_PRINCIPAL, task({ system: true, kind: 'scan', ownerId: null })).mine).toBe(false);
  });

  it('needs the kind\'s permission for an own task that has not ended, and nothing to remove it once ended', () => {
    expect(missingControl(user('u1', ['library.view']), task({}))).toBe('ai.run');
    expect(missingControl(user('u1', ['library.view']), task({ state: 'finished' }))).toBeNull();
    expect(missingControl(user('u2', ['ai.run']), task({}))).toBe('users.manage');
  });

  it('hides the details and the error of other users\' tasks', () => {
    const seen = taskInfo(user('u2', ['library.view']), task({}), new Map([['u1', 'Ann Avery']]));
    expect(seen).toMatchObject({ ownerName: 'Ann Avery', aiTaskId: 'tags', photoCount: 3, details: null, error: null, mine: false });
  });
});
