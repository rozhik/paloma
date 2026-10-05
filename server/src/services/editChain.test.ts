import { describe, it, expect } from 'vitest';
import type { RegisteredFilter } from '../plugins/registry.js';
import { describeProblem, isEditChain, validateChain, type FilterLookup } from './editChain.js';

const filter = (name: string, params: RegisteredFilter['definition']['params']): RegisteredFilter => ({
  pluginId: 'test',
  pluginVersion: '1.0.0',
  definition: { name, label: name, group: 'effects', params, render: ({ image }) => image },
  host: {} as RegisteredFilter['host'],
});

const FILTERS = new Map<string, RegisteredFilter>([
  ['brightness', filter('brightness', [{ name: 'amount', label: 'Amount', type: 'number', min: -100, max: 100, step: 1, default: 0 }])],
  ['vignette', filter('vignette', [{ name: 'soft', label: 'Soft', type: 'boolean', default: true }])],
  ['rotate', filter('rotate', [{
    name: 'angle', label: 'Angle', type: 'choice', default: 90,
    options: [{ value: 90, label: '90' }, { value: 180, label: '180' }, { value: 270, label: '270' }],
  }])],
  ['crop64', filter('crop64', [{ name: 'rect', label: 'Frame', type: 'rect', default: { left: 0, top: 0, right: 1, bottom: 1 } }])],
  ['bw', filter('bw', [])],
]);
const lookup: FilterLookup = (name) => FILTERS.get(name);

describe('validateChain', () => {
  it('fills in defaults for parameters left out', () => {
    expect(validateChain([{ filter: 'brightness' }, { filter: 'vignette' }, { filter: 'rotate' }, { filter: 'crop64' }], lookup)).toEqual({
      ok: true,
      steps: [
        { filter: 'brightness', amount: 0 },
        { filter: 'vignette', soft: true },
        { filter: 'rotate', angle: 90 },
        { filter: 'crop64', rect: { left: 0, top: 0, right: 1, bottom: 1 } },
      ],
    });
  });

  it('keeps valid values of every parameter type and enabled: false', () => {
    const steps = [
      { filter: 'brightness', amount: -35.5 },
      { filter: 'vignette', soft: false, enabled: false },
      { filter: 'rotate', angle: 270 },
      { filter: 'crop64', rect: { left: 0.1, top: 0.25, right: 0.9, bottom: 0.75 } },
      { filter: 'bw' },
    ];
    expect(validateChain(steps, lookup)).toEqual({ ok: true, steps });
  });

  it.each([
    [{ filter: 'brightness', amount: 500 }, 'amount', 'must be from -100 to 100'],
    [{ filter: 'brightness', amount: '5' }, 'amount', 'must be a number'],
    [{ filter: 'vignette', soft: 'yes' }, 'soft', 'must be true or false'],
    [{ filter: 'rotate', angle: 45 }, 'angle', 'must be one of 90, 180, 270'],
    [{ filter: 'rotate', angle: '90' }, 'angle', 'must be one of 90, 180, 270'],
    [{ filter: 'crop64', rect: { left: 0.5, top: 0, right: 0.5, bottom: 1 } }, 'rect', expect.stringMatching(/left < right/)],
    [{ filter: 'crop64', rect: { left: -0.1, top: 0, right: 0.5, bottom: 1 } }, 'rect', expect.stringMatching(/from 0 to 1/)],
    [{ filter: 'bw', amount: 3 }, 'amount', 'is not a parameter of this filter'],
    [{ filter: 'bw', enabled: true }, 'enabled', '"enabled" may only be false'],
  ])('rejects %j', (step, param, reason) => {
    expect(validateChain([{ filter: 'bw' }, step], lookup)).toEqual({
      ok: false,
      problem: { index: 1, filter: step.filter, param, reason },
    });
  });

  it('rejects anything that is not a list of steps with a filter name', () => {
    expect(validateChain({ filter: 'bw' }, lookup)).toMatchObject({ ok: false, problem: { index: -1 } });
    expect(validateChain(['bw'], lookup)).toMatchObject({ ok: false, problem: { index: 0, reason: 'a step must be an object' } });
    expect(validateChain([{ amount: 3 }], lookup)).toMatchObject({ ok: false, problem: { index: 0, reason: 'a step needs a "filter" name' } });
  });

  it('keeps steps of unavailable filters exactly as sent', () => {
    const grain = { filter: 'grain', amount: 'whatever', nested: { a: [1, 2] }, enabled: false };
    const result = validateChain([grain, { filter: 'bw' }], lookup);
    expect(result).toEqual({ ok: true, steps: [grain, { filter: 'bw' }] });
    if (result.ok) expect(result.steps[0]).not.toBe(grain);
  });

  it('accepts an empty chain', () => {
    expect(validateChain([], lookup)).toEqual({ ok: true, steps: [] });
  });
});

describe('isEditChain', () => {
  it('accepts only lists of objects with a filter name', () => {
    expect(isEditChain([{ filter: 'bw' }, { filter: 'grain', x: 1 }])).toBe(true);
    expect(isEditChain([])).toBe(true);
    expect(isEditChain('sepia')).toBe(false);
    expect(isEditChain([{ filter: 'bw' }, { name: 'x' }])).toBe(false);
    expect(isEditChain([{ filter: '' }])).toBe(false);
  });
});

describe('describeProblem', () => {
  it('names the step, filter and parameter', () => {
    expect(describeProblem({ index: 1, filter: 'brightness', param: 'amount', reason: 'must be from -100 to 100' }))
      .toBe('step 2 (brightness): "amount" must be from -100 to 100');
  });
});
