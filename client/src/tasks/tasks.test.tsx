import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MeResponse, Permission, TaskInfo } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { useAuthStore } from '../auth/authStore.js';
import { DEFAULT_UI_SETTINGS, useUiSettings } from '../settings/uiSettings.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { userMenuItemsFor } from '../shell/userMenu.js';
import { TaskRing, TaskIndicator } from './TaskIndicator.js';
import { TasksView, moveTargets } from './TasksView.js';
import { taskMessage, taskTitle } from './taskText.js';
import { useTasks } from './useTasks.js';

const task = (patch: Partial<TaskInfo>): TaskInfo => ({
  id: 't', kind: 'export', state: 'waiting', system: false, ownerId: 'u1', ownerName: 'Ben Avery', mine: true, canControl: true,
  photoCount: 12, aiTaskId: null, aiTaskName: null, folder: null, total: 12, done: 0, failed: 0, error: null, details: null,
  createdAt: '2026-10-13T10:00:00Z', startedAt: null, endedAt: null, ...patch,
});
const t = i18n.t.bind(i18n) as never;
const html = (node: React.ReactElement) => renderToStaticMarkup(node).replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

/** Sets a store's state also for static rendering, which reads the initial state. */
function patch<S>(store: { setState: (s: Partial<S>) => void; getInitialState: () => S }, value: Partial<S>) {
  store.setState(value);
  Object.assign(store.getInitialState() as object, value);
}

function signIn(permissions: Permission[]) {
  const me = { authMode: 'on', user: { id: 'u1', username: 'ann', displayName: 'Ann', permissions, roleName: 'Editor' } } as unknown as MeResponse;
  patch(useAuthStore, { me, phase: 'ready' });
}

beforeAll(async () => {
  await initI18n('en');
});

afterEach(() => {
  patch(useUiSettings, { level: DEFAULT_UI_SETTINGS.level });
  patch(useAuthStore, { me: null, phase: 'loading' });
  patch(useTasks, { tasks: [], ended: [], error: null });
  patch(usePalomaStore, { currentView: 'library' });
});

describe('task texts', () => {
  it('names the task by its kind, AI task or folder', () => {
    expect(taskTitle(task({ kind: 'ai', aiTaskId: 'tags', aiTaskName: null }), t)).toBe(i18n.t('ai.task.tags'));
    expect(taskTitle(task({}), t)).toBe(i18n.t('tasks.title.export', { count: 12 }));
    expect(taskTitle(task({ kind: 'scan', system: true, folder: '/photos/2024' }), t)).toBe(i18n.t('tasks.title.scanFolder', { folder: '2024' }));
    expect(taskTitle(task({ kind: 'scan', system: true, folder: null }), t)).toBe(i18n.t('tasks.title.scan'));
  });

  it('sums up an ended AI run, export and face detection', () => {
    const ai = task({
      kind: 'ai', aiTaskId: 'tags', state: 'finished', total: 30, done: 30, failed: 2,
      details: { kind: 'ai', output: 'tags', again: false, tagsAdded: 95, descriptionsSet: 0, inputTokens: 1000, outputTokens: 50, credits: 0.12, failures: [], photoIds: [] },
    });
    const message = taskMessage(ai, t);
    expect(message).toContain(i18n.t('ai.run.processed', { task: 'Tags', count: 28 }));
    expect(message).toContain(i18n.t('ai.run.tagsAdded', { count: 95 }));
    expect(message).toContain(i18n.t('ai.run.failed', { count: 2 }));
    expect(message).toContain(i18n.t('ai.run.credits', { credits: 0.12 }));
    expect(message).toContain('0.12');
    const free = task({ ...ai, details: { ...ai.details!, credits: 0 } as never });
    expect(taskMessage(free, t)).not.toContain(i18n.t('ai.run.credits', { credits: 0 }));
    expect(taskMessage(task({ state: 'finished', details: { kind: 'export', outputDir: 'trip', files: ['a', 'b'], quotaExceeded: false } }), t))
      .toBe(i18n.t('tasks.message.exported', { count: 2, folder: 'trip' }));
    expect(taskMessage(task({ state: 'finished', photoCount: 10, details: { kind: 'export', outputDir: 'trip', files: ['a'], quotaExceeded: true } }), t))
      .toBe(i18n.t('export.quotaPartial', { done: 1, requested: 10 }));
    expect(taskMessage(task({ kind: 'faces', state: 'cancelled', total: 30, details: { kind: 'faces', faces: 17, photos: 11, failures: [], photoIds: [] } }), t))
      .toBe(`${i18n.t('tasks.message.cancelled', { task: i18n.t('tasks.title.faces', { count: 12 }) })} ${i18n.t('faces.found', { faces: 17, photos: 11 })}`);
  });

  it('shows why a task failed', () => {
    expect(taskMessage(task({ kind: 'ai', aiTaskId: 'tags', state: 'failed', error: 'Incorrect API key provided' }), t))
      .toBe(i18n.t('tasks.message.failed', { task: 'Tags', message: 'Incorrect API key provided' }));
  });
});

describe('Tasks view', () => {
  it('shows who started each task, and offers controls only on the rows the user may change', () => {
    patch(useTasks, {
      tasks: [
        task({ id: 'r', state: 'running', done: 4 }),
        task({ id: 'o', mine: false, canControl: false, ownerName: 'Eve Avery' }),
        task({ id: 's', kind: 'scan', system: true, mine: false, canControl: false, folder: null }),
      ],
    });
    const markup = html(<TasksView />);
    expect(markup).toContain('Eve Avery');
    expect(markup).toContain(i18n.t('tasks.startedBySystem'));
    expect(markup).toContain('4 / 12');
    const row = (id: string) => markup.slice(markup.indexOf(`data-task="${id}"`), markup.indexOf('</li>', markup.indexOf(`data-task="${id}"`)));
    expect(row('r')).toContain(i18n.t('tasks.pause'));
    expect(row('o')).not.toContain(i18n.t('tasks.cancel'));
    expect(row('o')).toContain('draggable="false"');
    expect(row('s')).not.toContain(i18n.t('tasks.pause'));
  });

  it('moves a task among the slots the user may use', () => {
    const tasks = [task({ id: 'm1' }), task({ id: 'o', mine: false }), task({ id: 'm2' }), task({ id: 'm3' })];
    expect(moveTargets(tasks[2], tasks, false)).toEqual({ up: 'm1', down: null });
    expect(moveTargets(tasks[0], tasks, false)).toEqual({ up: undefined, down: 'm3' });
    expect(moveTargets(tasks[2], tasks, true)).toEqual({ up: 'o', down: null });
  });
});

describe('task indicator', () => {
  it('shows the progress of the user\'s running task, or how many of theirs wait', () => {
    expect(html(<TaskRing running={task({ state: 'running', done: 3 })} waiting={0} onOpen={() => {}} />)).toContain('3 / 12');
    expect(html(<TaskRing running={null} waiting={2} onOpen={() => {}} />))
      .toContain(`aria-label="${i18n.t('tasks.indicator.waiting', { count: 2 })}"`);
  });

  it('is shown for the user\'s tasks from Easy, not at Child', () => {
    patch(useTasks, { tasks: [task({})] });
    patch(useUiSettings, { level: 'easy' });
    expect(html(<TaskIndicator />)).toContain('face-progress');
    patch(useUiSettings, { level: 'child' });
    expect(html(<TaskIndicator />)).toBe('');
  });

  it('offers the Tasks view in the user menu from Easy', () => {
    signIn(['library.view']);
    expect(userMenuItemsFor('child')).not.toContain('tasks');
    expect(userMenuItemsFor('easy')).toContain('tasks');
  });
});
