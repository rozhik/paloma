import type { FilterInfo, PluginInfo } from '../../../shared/types.js';
import { atLeast, type Level } from './levels.js';

/**
 * The filters the edit bar offers at a level: those of active plugins whose plugin level and own level the
 * level reaches. Rendering does not use this; steps of the other filters are still applied.
 */
export function offeredFilters(plugins: PluginInfo[], level: Level): FilterInfo[] {
  return plugins
    .filter((plugin) => plugin.status === 'active' && atLeast(level, plugin.level))
    .flatMap((plugin) => plugin.filters)
    .filter((filter) => atLeast(level, filter.level));
}
