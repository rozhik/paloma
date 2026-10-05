import { describe, it, expect } from 'vitest';
import type { FilterInfo, PluginInfo } from '../../../shared/types.js';
import { offeredFilters } from './filters.js';
import type { Level } from './levels.js';

const filter = (name: string, level: Level): FilterInfo => ({ name, label: name, group: 'effects', params: [], level });
const plugin = (id: string, level: Level, filters: FilterInfo[], status: PluginInfo['status'] = 'active'): PluginInfo => ({
  id, name: id, description: '', version: '1', source: 'bundled', level, enabled: status !== 'off', status, error: null,
  warnings: [], filters,
});

const plugins = [
  plugin('basic-effects', 'easy', [filter('brightness', 'easy'), filter('sepia', 'easy')]),
  plugin('basic-transforms', 'normal', [filter('crop', 'normal'), filter('rotate', 'normal')]),
  // A plugin may tag one filter higher than itself; a lower filter level does not lower the plugin's
  plugin('film-grain', 'normal', [filter('grain', 'normal'), filter('dust', 'pro'), filter('fade', 'easy')]),
  plugin('broken', 'easy', [filter('broken', 'easy')], 'off'),
];
const names = (level: Level) => offeredFilters(plugins, level).map((f) => f.name);

describe('filters offered by level', () => {
  it('offers Easy only the simple effects', () => {
    expect(names('easy')).toEqual(['brightness', 'sepia']);
  });

  it('offers Normal the transforms and normal plugins, but not a pro filter', () => {
    expect(names('normal')).toEqual(['brightness', 'sepia', 'crop', 'rotate', 'grain', 'fade']);
  });

  it('offers Professional and Developer every filter of active plugins', () => {
    expect(names('pro')).toEqual(['brightness', 'sepia', 'crop', 'rotate', 'grain', 'dust', 'fade']);
    expect(names('developer')).toEqual(names('pro'));
  });

  it('offers Child nothing it has not tagged child', () => {
    expect(names('child')).toEqual([]);
  });
});
