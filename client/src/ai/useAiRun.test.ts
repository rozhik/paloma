import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AiRunInfo, AiRunStatus } from '../../../shared/types.js';
import { useAiRun, type AiRunDeps } from './useAiRun.js';

const run = (patch: Partial<AiRunInfo> = {}): AiRunInfo => ({
  id: 'r1', taskId: 'tags', taskName: null, output: 'tags', state: 'running', total: 30, done: 12, failed: 0, tagsAdded: 0,
  descriptionsSet: 0, inputTokens: 0, outputTokens: 0, error: null, failures: [], photoIds: [], startedAt: '', endedAt: null, ...patch,
});

function fakeDeps(statuses: AiRunStatus[]): AiRunDeps & { ended: ReturnType<typeof vi.fn>; started: unknown[] } {
  const started: unknown[] = [];
  return {
    started,
    status: async () => statuses.shift() ?? { current: null, last: null },
    start: async (taskId, photoIds, again) => { started.push([taskId, photoIds, again]); return run({ done: 0, total: photoIds.length }); },
    cancel: async () => ({ current: run({ state: 'cancelling' }), last: null }),
    ended: vi.fn(),
  };
}

const state = () => useAiRun.getState();

beforeEach(() => {
  useAiRun.setState({ current: null, result: null, finished: 0 });
});

describe('AI run store', () => {
  it('shows the progress of a run after a reload', async () => {
    await state().refresh(fakeDeps([{ current: run(), last: null }]));
    expect(state().current).toMatchObject({ done: 12, total: 30 });
  });

  it('does not show how an old run ended when the page opens', async () => {
    await state().refresh(fakeDeps([{ current: null, last: run({ state: 'finished', done: 30 }) }]));
    expect([state().current, state().result, state().finished]).toEqual([null, null, 0]);
  });

  it('shows the summary when a watched run ends, and reloads the views', async () => {
    const finished = run({ state: 'finished', done: 30, tagsAdded: 95, endedAt: 'x' });
    const deps = fakeDeps([{ current: run(), last: null }, { current: null, last: finished }]);
    await state().refresh(deps);
    await state().refresh(deps);
    expect(state().current).toBeNull();
    expect(state().result).toMatchObject({ state: 'finished', tagsAdded: 95 });
    expect(state().finished).toBe(1);
    expect(deps.ended).toHaveBeenCalledWith(finished);
  });

  it('starts a run with the ids of the photos', async () => {
    const deps = fakeDeps([]);
    await state().start('objects', [{ id: 4 }, { id: 9 }], true, deps);
    expect(deps.started).toEqual([['objects', [4, 9], true]]);
    expect(state().current).toMatchObject({ total: 2, state: 'running' });
  });

  it('shows the run as stopping after cancel', async () => {
    useAiRun.setState({ current: run() });
    await state().cancel(fakeDeps([]));
    expect(state().current?.state).toBe('cancelling');
  });
});
