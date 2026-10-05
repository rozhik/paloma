import { describe, it, expect } from 'vitest';
import { chainReducer, initialChain, type ChainAction, type ChainState } from './editChain.js';

const run = (state: ChainState, ...actions: ChainAction[]) => actions.reduce(chainReducer, state);

describe('chainReducer', () => {
  it('merges consecutive slider changes into one step', () => {
    const state = run(
      initialChain([{ filter: 'sepia' }]),
      { type: 'apply', filter: 'brightness', params: { amount: 20 } },
      { type: 'apply', filter: 'brightness', params: { amount: 35 } },
    );
    expect(state.steps).toEqual([{ filter: 'sepia' }, { filter: 'brightness', amount: 35 }]);
    expect(state.merging).toBe('apply:brightness');
    expect(run(state, { type: 'commit' }).merging).toBeNull();
  });

  it('updates a trailing step of the same filter even after a commit, so undo removes the whole step', () => {
    const state = run(
      initialChain(),
      { type: 'apply', filter: 'brightness', params: { amount: 20 } },
      { type: 'commit' },
      { type: 'apply', filter: 'brightness', params: { amount: 35 } },
    );
    expect(state.steps).toEqual([{ filter: 'brightness', amount: 35 }]);
    expect(run(state, { type: 'undo' }).steps).toEqual([]);
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

  it('undoes by removing the last step, also of a saved or unknown chain', () => {
    const grain = { filter: 'grain', amount: 30 };
    let state = run(initialChain([grain, { filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } }]), { type: 'apply', filter: 'bw', params: {} });
    state = run(state, { type: 'undo' });
    expect(state.steps.map((s) => s.filter)).toEqual(['grain', 'crop64']);
    state = run(state, { type: 'undo' });
    expect(state.steps).toEqual([grain]);
    expect(state.steps[0]).toBe(grain);
  });

  it('does nothing when undoing an empty chain', () => {
    const state = initialChain();
    expect(run(state, { type: 'undo' })).toBe(state);
  });

  it('keeps the state when a change changes nothing', () => {
    const state = initialChain([{ filter: 'bw' }]);
    const next = run(state, { type: 'apply', filter: 'bw', params: {} });
    expect(next.steps).toBe(state.steps);
  });

  it('load replaces the chain', () => {
    const state = run(initialChain(), { type: 'rotate', delta: 90 }, { type: 'load', steps: [{ filter: 'bw' }] });
    expect(state).toEqual(initialChain([{ filter: 'bw' }]));
  });
});
