import type { EditStep } from '../../../shared/types.js';

/**
 * The editor's chain. Like Picasa's `filters=`, the chain is the history of the photo's edits: Undo removes
 * the last step, and nothing else is kept.
 */
export interface ChainState {
  steps: EditStep[];
  /**
   * Set while consecutive changes go to the same trailing step (dragging a slider); the change is saved once
   * it is committed. Cleared by any other action.
   */
  merging: string | null;
}

export type ChainAction =
  /** Start editing a saved chain */
  | { type: 'load'; steps: EditStep[] }
  /** Apply a filter: updates the last step if it uses the same filter, else appends a step */
  | { type: 'apply'; filter: string; params: Record<string, unknown> }
  /** Turn by a quarter: combines with a trailing `rotate` step, which disappears at 0° */
  | { type: 'rotate'; delta: 90 | -90 }
  /** Remove the last step */
  | { type: 'undo' }
  /** End a run of merged changes */
  | { type: 'commit' };

export const initialChain = (steps: EditStep[] = []): ChainState => ({ steps, merging: null });

function same(a: EditStep[], b: EditStep[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Records `steps` as the new chain; a change that changes nothing only updates the merge marker. */
function change(state: ChainState, steps: EditStep[], merging: string | null = null): ChainState {
  if (same(steps, state.steps)) return state.merging === merging ? state : { ...state, merging };
  return { steps, merging };
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

    case 'rotate': {
      const last = state.steps[state.steps.length - 1];
      if (last?.filter === ROTATE && last.enabled !== false && typeof last.angle === 'number') {
        const angle = (((last.angle + action.delta) % 360) + 360) % 360;
        const rest = state.steps.slice(0, -1);
        return change(state, angle === 0 ? rest : [...rest, { ...last, angle }]);
      }
      return change(state, [...state.steps, { filter: ROTATE, angle: (action.delta + 360) % 360 }]);
    }

    case 'undo':
      if (state.steps.length === 0) return state;
      return { steps: state.steps.slice(0, -1), merging: null };

    case 'commit':
      return state.merging === null ? state : { ...state, merging: null };
  }
}
