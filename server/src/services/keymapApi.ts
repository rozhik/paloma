import { eq } from 'drizzle-orm';
import type { KeymapFile, KeymapPresetInfo, KeymapSaved, StoredKeymap } from '../../../shared/types.js';
import { KEYMAP_MAX_BYTES, KEYMAP_PRESETS, isKeymapPreset, resolveKeymap, toKeymapFile, validateKeymap } from '../../../shared/keymaps.js';
import { db } from '../db/index.js';
import { get, run } from '../db/query.js';
import { keymaps } from '../db/schema.js';
import type { Principal } from '../auth/principal.js';
import { HttpError, apiError } from './apiError.js';

/** Whose keymap a request reads and writes: the user's, or the one user's while users are off. */
export const keymapOwner = (principal: Principal): string => principal.user?.id ?? '~single';

/** Presets keep their English names in the API; the client shows them in the active language. */
const PRESET_NAMES = { mac: 'Mac', windows: 'Windows', tvBox: 'TV box' } as const;

async function readKeymap(owner: string): Promise<StoredKeymap | null> {
  const row = await get(db.select().from(keymaps).where(eq(keymaps.owner, owner)));
  if (!row || !isKeymapPreset(row.basedOn)) return null;
  try {
    return { name: row.name, basedOn: row.basedOn, bindings: JSON.parse(row.bindings) };
  } catch {
    return null;
  }
}

/** The user's keymap with only its own bindings, or null while nothing is stored for them. */
export async function getKeymap(principal: Principal): Promise<KeymapFile | null> {
  const keymap = await readKeymap(keymapOwner(principal));
  return keymap && toKeymapFile(keymap);
}

/**
 * Replaces the user's keymap with a keymap file; 400 `invalid_keymap` with the problems, keeping the stored one,
 * when it is not valid. Unknown sections and actions are left out and returned in `dropped`.
 */
export async function saveKeymap(principal: Principal, body: unknown, bytes = 0): Promise<KeymapSaved> {
  const result = bytes > KEYMAP_MAX_BYTES ? { ok: false as const, problems: [{ code: 'too_large' as const }] } : validateKeymap(body);
  if (!result.ok) {
    throw new HttpError(400, { ...apiError('invalid_keymap', 'This is not a valid keymap'), problems: result.problems });
  }
  const { keymap, dropped } = result;
  const values = { name: keymap.name, basedOn: keymap.basedOn, bindings: JSON.stringify(keymap.bindings), updatedAt: new Date().toISOString() };
  await run(db.insert(keymaps).values({ owner: keymapOwner(principal), ...values }).onConflictDoUpdate({ target: keymaps.owner, set: values }));
  return { keymap: toKeymapFile(keymap), dropped };
}

/** Every preset with every action and its keys. */
export function listPresets(): KeymapPresetInfo[] {
  return KEYMAP_PRESETS.map((id) => {
    const keymap: StoredKeymap = { name: PRESET_NAMES[id], basedOn: id, bindings: {} };
    return { id, keymap: toKeymapFile(keymap, { resolved: resolveKeymap(keymap) }) };
  });
}

/** Removes a deleted user's keymap. */
export async function deleteKeymap(owner: string): Promise<void> {
  await run(db.delete(keymaps).where(eq(keymaps.owner, owner)));
}
