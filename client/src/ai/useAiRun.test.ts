import { describe, it, expect, beforeEach } from 'vitest';
import type { TaskInfo } from '../../../shared/types.js';
import { useAiRun, type AiRunDeps } from './useAiRun.js';
import { useTasks } from '../tasks/useTasks.js';

function fakeDeps(): AiRunDeps & { started: unknown[]; added: number } {
  const deps = {
    started: [] as unknown[],
    added: 0,
    start: async (taskId: string, photoIds: number[], again: boolean) => {
      deps.started.push([taskId, photoIds, again]);
      return { id: 't1', kind: 'ai' } as TaskInfo;
    },
  };
  return Object.assign(deps, { added: async () => { deps.added = (deps.added as number) + 1; } }) as never;
}

const state = () => useAiRun.getState();

beforeEach(() => {
  useAiRun.setState({ finished: 0, error: null });
});

describe('AI run store', () => {
  it('adds a run of the task on the photos to the queue', async () => {
    const deps = fakeDeps();
    await state().run('tags', [{ id: 1 }, { id: 2 }], true, deps);
    expect(deps.started).toEqual([['tags', [1, 2], true]]);
    expect(state().error).toBeNull();
  });

  it('fetches the photos first when given a function, and adds nothing for none', async () => {
    const deps = fakeDeps();
    await state().run('tags', async () => [], false, deps);
    expect(deps.started).toEqual([]);
  });

  it('keeps the refusal of the server', async () => {
    const refused = new Error('not ready');
    await state().run('tags', [{ id: 1 }], false, { start: async () => { throw refused; }, added: async () => {} });
    expect(state().error).toBe(refused);
  });

  it('counts the AI runs that end, so views showing AI results reload', async () => {
    const running = { id: 'r', kind: 'ai', state: 'running', mine: true } as TaskInfo;
    useTasks.setState({ tasks: [running], ended: [] });
    await useTasks.getState().refresh({ list: async () => ({ tasks: [{ ...running, state: 'finished' }] }) } as never);
    expect(state().finished).toBe(1);
  });
});
