/** The built-in skins, in the order Settings offers them. */
export const SKIN_IDS = ['classic', 'compact', 'glass'] as const;
export type SkinId = typeof SKIN_IDS[number];
