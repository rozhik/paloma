import { describe, it, expect } from 'vitest';
import { chainReducer, initialChain, type ChainAction, type ChainState } from './editChain.js';

const run = (state: ChainState, ...actions: ChainAction[]) => actions.reduce(chainReducer, state);

describe('chainReducer', () => {
  it('merges consecutive slider changes into one step and one undo entry', () => {
    const state = run(
      initialChain([{ filter: 'sepia' }]),
      { type: 'apply', filter: 'brightness', params: { amount: 20 } },
      { type: 'apply', filter: 'brightness', params: { amount: 35 } },
    );
    expect(state.steps).toEqual([{ filter: 'sepia' }, { filter: 'brightness', amount: 35 }]);
    expect(run(state, { type: 'undo' }).steps).toEqual([{ filter: 'sepia' }]);
  });

  it('gives a new undo entry to a second drag after a commit, still updating the same step', () => {
    const state = run(
      initialChain(),
      { type: 'apply', filter: 'brightness', params: { amount: 20 } },
      { type: 'commit' },
      { type: 'apply', filter: 'brightness', params: { amount: 35 } },
    );
    expect(state.steps).toEqual([{ filter: 'brightness', amount: 35 }]);
    expect(run(state, { type: 'undo' }).steps).toEqual([{ filter: 'brightness', amount: 20 }]);
  });

  it('appends a step when the last step uses another filter', () => {
    const state = run(
      initialChain([{ filter: 'brightness', amount: 20 }]),
      { type: 'apply', filter: 'sepia', params: {} },
      { type: 'apply', filter: 'brightness', params: { amount: 10 } },
    );
    expect(state.steps.map((s) => s.filter)).toEqual(['brightness', 'sepia', 'brightness']);
  });

  it('does not merge into a step that is not enabled', () => {
    const state = run(initialChain([{ filter: 'bw', enabled: false }]), { type: 'apply', filter: 'bw', params: {} });
    expect(state.steps).toEqual([{ filter: 'bw', enabled: false }, { filter: 'bw' }]);
  });

  it('combines rotations and drops the step at 0°', () => {
    let state = run(initialChain(), { type: 'rotate', delta: 90 });
    expect(state.steps).toEqual([{ filter: 'rotate', angle: 90 }]);
    state = run(state, { type: 'rotate', delta: 90 });
    expect(state.steps).toEqual([{ filter: 'rotate', angle: 180 }]);
    state = run(state, { type: 'rotate', delta: -90 }, { type: 'rotate', delta: -90 });
    expect(state.steps).toEqual([]);
    expect(run(initialChain(), { type: 'rotate', delta: -90 }).steps).toEqual([{ filter: 'rotate', angle: 270 }]);
  });

  it('starts a new rotate step after another filter', () => {
    const state = run(initialChain([{ filter: 'rotate', angle: 90 }, { filter: 'bw' }]), { type: 'rotate', delta: 90 });
    expect(state.steps).toEqual([{ filter: 'rotate', angle: 90 }, { filter: 'bw' }, { filter: 'rotate', angle: 90 }]);
  });

  it('updates and removes a step by position, keeping unknown steps untouched', () => {
    const grain = { filter: 'grain', amount: 30 };
    let state = run(initialChain([grain, { filter: 'brightness', amount: 10 }, { filter: 'sepia' }]),
      { type: 'update', index: 1, params: { amount: 50 } });
    expect(state.steps).toEqual([grain, { filter: 'brightness', amount: 50 }, { filter: 'sepia' }]);
    state = run(state, { type: 'remove', index: 2 });
    expect(state.steps).toEqual([grain, { filter: 'brightness', amount: 50 }]);
    expect(state.steps[0]).toBe(grain);
  });

  it('undoes and redoes changes in order', () => {
    let state = run(initialChain(), { type: 'rotate', delta: 90 }, { type: 'apply', filter: 'bw', params: {} });
    state = run(state, { type: 'undo' });
    expect(state.steps).toEqual([{ filter: 'rotate', angle: 90 }]);
    state = run(state, { type: 'undo' });
    expect(state.steps).toEqual([]);
    expect(run(state, { type: 'undo' })).toBe(state);
    state = run(state, { type: 'redo' }, { type: 'redo' });
    expect(state.steps).toEqual([{ filter: 'rotate', angle: 90 }, { filter: 'bw' }]);
  });

  it('drops the redo history after a new change', () => {
    const state = run(initialChain(), { type: 'rotate', delta: 90 }, { type: 'undo' }, { type: 'apply', filter: 'bw', params: {} });
    expect(state.future).toEqual([]);
    expect(run(state, { type: 'redo' }).steps).toEqual([{ filter: 'bw' }]);
  });

  it('resets to the original in a way that can be undone', () => {
    const steps = [{ filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } }, { filter: 'sepia' }];
    const state = run(initialChain(steps), { type: 'reset' });
    expect(state.steps).toEqual([]);
    expect(run(state, { type: 'undo' }).steps).toEqual(steps);
  });

  it('does not record changes that change nothing', () => {
    const state = run(initialChain([{ filter: 'bw' }]), { type: 'apply', filter: 'bw', params: {} }, { type: 'remove', index: 5 });
    expect(state.past).toEqual([]);
  });

  it('load replaces the chain and clears the history', () => {
    const state = run(initialChain(), { type: 'rotate', delta: 90 }, { type: 'load', steps: [{ filter: 'bw' }] });
    expect(state).toEqual(initialChain([{ filter: 'bw' }]));
  });
});
