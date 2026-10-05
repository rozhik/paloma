import { classic } from './classic/index.js';
import { compact } from './compact/index.js';
import { glass } from './glass/index.js';
import type { SkinDefinition } from './types.js';
import type { SkinId } from './ids.js';

export { SKIN_IDS, type SkinId } from './ids.js';
export type { SkinDefinition, SkinComponents, AppShellProps, PhotoGridProps, TrayHandlers } from './types.js';

/** The built-in skins, in the order Settings offers them. */
export const SKINS: Record<SkinId, SkinDefinition> = { classic, compact, glass };
