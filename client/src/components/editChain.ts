import type { EditStep } from '../../../shared/types.js';

/** The editor's chain with undo and redo history. */
export interface ChainState {
  steps: EditStep[];
  past: EditStep[][];
  future: EditStep[][];
  /**
   * Set while consecutive changes go to the same trailing step (dragging a slider), so they
   * share one undo entry; cleared by any other action.
   */
  merging: string | null;
}

export type ChainAction =
  /** Start editing a saved chain; clears the history */
  | { type: 'load'; steps: EditStep[] }
  /** Apply a filter: updates the last step if it uses the same filter, else appends a step */
  | { type: 'apply'; filter: string; params: Record<string, unknown> }
  /** Change parameters of the step at `index` */
  | { type: 'update'; index: number; params: Record<string, unknown> }
  | { type: 'remove'; index: number }
  /** Turn by a quarter: combines with a trailing `rotate` step, which disappears at 0° */
  | { type: 'rotate'; delta: 90 | -90 }
  /** Remove every step ("Reset to original"); can be undone */
  | { type: 'reset' }
  | { type: 'undo' }
  | { type: 'redo' }
  /** End a run of merged changes, so the next change gets its own undo entry */
  | { type: 'commit' };

export const initialChain = (steps: EditStep[] = []): ChainState => ({ steps, past: [], future: [], merging: null });

function same(a: EditStep[], b: EditStep[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Records `steps` as the new chain, with one undo entry unless the change continues the current merge. */
function change(state: ChainState, steps: EditStep[], merging: string | null = null): ChainState {
  if (same(steps, state.steps)) return { ...state, merging };
  const continues = merging !== null && merging === state.merging;
  return {
    steps,
    past: continues ? state.past : [...state.past, state.steps],
    future: [],
    merging,
  };
}

const ROTATE = 'rotate';

export function chainReducer(state: ChainState, action: ChainAction): ChainState {
  switch (action.type) {
    case 'load':
      return initialChain(action.steps);

    case 'apply': {
      const last = state.steps[state.steps.length - 1];
      if (last && last.filter === action.filter && last.enabled !== false) {
        const steps = [...state.steps.slice(0, -1), { ...last, ...action.params, filter: action.filter }];
        return change(state, steps, `apply:${action.filter}`);
      }
      return change(state, [...state.steps, { filter: action.filter, ...action.params }], `apply:${action.filter}`);
    }

    case 'update': {
      const step = state.steps[action.index];
      if (!step) return state;
      const steps = state.steps.map((s, i) => (i === action.index ? { ...s, ...action.params, filter: s.filter } : s));
      return change(state, steps, `update:${action.index}`);
    }

    case 'remove':
      if (!state.steps[action.index]) return state;
      return change(state, state.steps.filter((_, i) => i !== action.index));

    case 'rotate': {
      const last = state.steps[state.steps.length - 1];
      if (last?.filter === ROTATE && last.enabled !== false && typeof last.angle === 'number') {
        const angle = (((last.angle + action.delta) % 360) + 360) % 360;
        const rest = state.steps.slice(0, -1);
        return change(state, angle === 0 ? rest : [...rest, { ...last, angle }]);
      }
      return change(state, [...state.steps, { filter: ROTATE, angle: (action.delta + 360) % 360 }]);
    }

    case 'reset':
      return change(state, []);

    case 'undo': {
      if (state.past.length === 0) return state;
      return {
        steps: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.steps, ...state.future],
        merging: null,
      };
    }

    case 'redo': {
      if (state.future.length === 0) return state;
      return { steps: state.future[0], past: [...state.past, state.steps], future: state.future.slice(1), merging: null };
    }

    case 'commit':
      return state.merging === null ? state : { ...state, merging: null };
  }
}
