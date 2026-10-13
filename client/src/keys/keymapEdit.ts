import type { ActionId, KeyChord, KeymapProblem, StoredKeymap } from '../../../shared/types.js';
import {
  KEYMAP_MAX_BYTES, KEYMAP_NAME_MAX, KEYS_PER_ACTION_MAX, PRESET_BINDINGS, conflictsWith, resolveKeymap, validateKeymap,
} from '../../../shared/keymaps.js';

/** What the Keybindings page does to a keymap; each change gives a new keymap to save, or the actions in the way. */

export type EditResult = { keymap: StoredKeymap } | { conflicts: { key: KeyChord; actions: ActionId[] }[] };

const sameKeys = (a: readonly KeyChord[], b: readonly KeyChord[]) => a.length === b.length && a.every((key, i) => key === b[i]);

/**
 * Gives an action exactly these keys. Keys another action of the same scope has are conflicts, unless `move` takes
 * them from it. Only keys that differ from the preset are kept in the keymap.
 */
export function setKeys(keymap: StoredKeymap, id: ActionId, keys: KeyChord[], options: { move?: boolean; extra?: readonly ActionId[] } = {}): EditResult {
  const resolved = resolveKeymap(keymap, options.extra);
  const changes = new Map<ActionId, KeyChord[]>([[id, keys]]);
  const conflicts: { key: KeyChord; actions: ActionId[] }[] = [];
  for (const key of keys) {
    const others = conflictsWith(resolved, id, key);
    if (others.length === 0) continue;
    if (!options.move) conflicts.push({ key, actions: others });
    else for (const other of others) changes.set(other, (changes.get(other) ?? resolved.get(other) ?? []).filter((k) => k !== key));
  }
  if (conflicts.length > 0) return { conflicts };
  const preset = PRESET_BINDINGS[keymap.basedOn];
  const bindings = { ...keymap.bindings };
  for (const [action, actionKeys] of changes) {
    if (sameKeys(actionKeys, preset[action] ?? [])) delete bindings[action];
    else bindings[action] = actionKeys;
  }
  return { keymap: { ...keymap, bindings } };
}

/** The keys an action has now. */
export const keysOf = (keymap: StoredKeymap, id: ActionId, extra?: readonly ActionId[]): KeyChord[] => resolveKeymap(keymap, extra).get(id) ?? [];

/** Adds a key to an action; adding a key it already has changes nothing. */
export function addKey(keymap: StoredKeymap, id: ActionId, key: KeyChord, options: { move?: boolean; extra?: readonly ActionId[] } = {}): EditResult {
  const keys = keysOf(keymap, id, options.extra);
  if (keys.includes(key)) return { keymap };
  return setKeys(keymap, id, [...keys, key], options);
}

export const canAddKey = (keymap: StoredKeymap, id: ActionId, extra?: readonly ActionId[]) => keysOf(keymap, id, extra).length < KEYS_PER_ACTION_MAX;

export function removeKey(keymap: StoredKeymap, id: ActionId, key: KeyChord, extra?: readonly ActionId[]): StoredKeymap {
  const result = setKeys(keymap, id, keysOf(keymap, id, extra).filter((k) => k !== key), { extra });
  return 'keymap' in result ? result.keymap : keymap;
}

/** Gives an action the keys of its preset again; another action using one of them is a conflict, unless `move`. */
export const resetAction = (keymap: StoredKeymap, id: ActionId, options: { move?: boolean; extra?: readonly ActionId[] } = {}): EditResult =>
  setKeys(keymap, id, [...(PRESET_BINDINGS[keymap.basedOn][id] ?? [])], options);

export const resetAll = (keymap: StoredKeymap): StoredKeymap => ({ ...keymap, bindings: {} });

/** Whether an action's keys differ from its preset. */
export const isChanged = (keymap: StoredKeymap, id: ActionId) => id in keymap.bindings;

/** A keymap renamed, or null when the name is empty or too long. */
export function rename(keymap: StoredKeymap, name: string): StoredKeymap | null {
  const trimmed = name.trim();
  return trimmed === '' || [...trimmed].length > KEYMAP_NAME_MAX ? null : { ...keymap, name: trimmed };
}

/** Chords browsers keep for themselves, so a page never sees them. */
const RESERVED = new Set([
  'Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+Shift+N', 'Ctrl+Shift+T', 'Ctrl+Shift+W', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Alt+F4',
  'Meta+Q', 'Meta+W', 'Meta+T', 'Meta+N', 'Meta+Shift+N', 'Meta+Shift+T', 'Meta+H', 'Meta+M', 'Meta+Tab',
]);
export const isReserved = (key: KeyChord) => RESERVED.has(key);

/** A chord as shown: macOS symbols for the modifiers on a Mac, arrows as arrows. */
export function displayChord(chord: KeyChord, mac: boolean): string {
  const parts = chord === '+' ? ['+'] : chord.endsWith('++') ? [...chord.slice(0, -2).split('+'), '+'] : chord.split('+');
  const key = parts.pop()!;
  const arrows: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
  const symbols: Record<string, string> = mac ? { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' } : { Meta: 'Win' };
  const shownKey = arrows[key] ?? (key === 'Escape' ? 'Esc' : key);
  return mac ? [...parts.map((p) => symbols[p] ?? p), shownKey].join('') : [...parts.map((p) => symbols[p] ?? p), shownKey].join('+');
}

/** Whether an action is listed for a filter text: its name, or one of its keys as written or shown, contains it. */
export function matchesFilter(filter: string, name: string, keys: readonly KeyChord[], mac: boolean): boolean {
  const text = filter.trim().toLocaleLowerCase();
  if (text === '') return true;
  return name.toLocaleLowerCase().includes(text)
    || keys.some((key) => key.toLowerCase().includes(text) || displayChord(key, mac).toLocaleLowerCase().includes(text));
}

export type UploadResult = { ok: true; keymap: StoredKeymap; dropped: string[] } | { ok: false; problems: KeymapProblem[] };

/** Reads an uploaded file as a keymap, checking it as the server will. */
export function readUpload(text: string, bytes: number): UploadResult {
  if (bytes > KEYMAP_MAX_BYTES) return { ok: false, problems: [{ code: 'too_large' }] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problems: [{ code: 'not_keymap' }] };
  }
  return validateKeymap(parsed);
}

/** A file name for a downloaded keymap. */
export function downloadName(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N} _.-]+/gu, '').trim().replace(/\s+/g, '-');
  return `${safe || 'keymap'}.paloma-keys.json`;
}
