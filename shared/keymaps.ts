import type {
  ActionId, KeyChord, KeymapFile, KeymapPresetId, KeymapProblem, KeySectionId, StoredKeymap,
} from './types.js';

/**
 * The keyboard action catalog, the preset keymaps and keymap validation; the same for the client and the server.
 * See docs/keybindings.md.
 */

export const KEYMAP_FORMAT = 'paloma-keymap';
export const KEYMAP_VERSION = 1;
/** Largest keymap request or file accepted, in bytes */
export const KEYMAP_MAX_BYTES = 256 * 1024;
export const KEYMAP_NAME_MAX = 64;
/** Most keys one action can have */
export const KEYS_PER_ACTION_MAX = 8;

export const KEYMAP_PRESETS: readonly KeymapPresetId[] = ['mac', 'windows', 'tvBox'];
export const isKeymapPreset = (value: unknown): value is KeymapPresetId => KEYMAP_PRESETS.includes(value as KeymapPresetId);

/** The sections in the order they are listed. */
export const KEY_SECTIONS: readonly KeySectionId[] = ['global', 'library', 'selection', 'viewer', 'edit', 'slideshow', 'people', 'map', 'collage'];

/** Sections that work at the same time besides Global, which works with every section. */
const SHARED_SCOPES: readonly (readonly KeySectionId[])[] = [['library', 'selection'], ['viewer', 'edit']];

/** Whether two sections can be active at once, so their actions cannot share a key. */
export function sectionsOverlap(a: KeySectionId, b: KeySectionId): boolean {
  return a === b || a === 'global' || b === 'global' || SHARED_SCOPES.some((scope) => scope.includes(a) && scope.includes(b));
}

/** A catalog action: its section, and the UI control (a client `ControlId`) whose level and permission it needs. */
export interface KeyAction {
  id: ActionId;
  section: KeySectionId;
  control: string;
}

const action = (id: ActionId, control: string): KeyAction => ({ id, section: id.split('.')[0] as KeySectionId, control });

/** The edit bar filters of the bundled plugins: `edit.<plugin>.<filter>`. Other plugins' filters are added by the client. */
export const BUNDLED_FILTER_ACTIONS: readonly ActionId[] = [
  'edit.basic-transforms.crop64', 'edit.basic-transforms.rotate', 'edit.basic-transforms.flip', 'edit.basic-transforms.straighten',
  'edit.basic-effects.brightness', 'edit.basic-effects.contrast', 'edit.basic-effects.bw', 'edit.basic-effects.sepia',
];

/** Every built-in action, in the order the Keybindings page lists them within their section. */
export const KEY_ACTIONS: readonly KeyAction[] = [
  action('global.library', 'view.library'),
  action('global.people', 'view.people'),
  action('global.map', 'view.map'),
  action('global.collage', 'view.collage'),
  action('global.tasks', 'view.tasks'),
  action('global.settings', 'view.settings'),
  action('global.search', 'search'),

  action('library.open', 'photo.open'),
  action('library.toggleSelect', 'photo.select'),
  action('library.focusPrevious', 'photo.open'),
  action('library.focusNext', 'photo.open'),
  action('library.focusUp', 'photo.open'),
  action('library.focusDown', 'photo.open'),
  action('library.selectAll', 'photo.select'),
  action('library.slideshow', 'slideshow'),

  action('selection.clear', 'tray.clear'),
  action('selection.star', 'photo.star'),
  action('selection.addToAlbum', 'tray.addToAlbum'),
  action('selection.addTags', 'tray.addTags'),
  action('selection.removeTag', 'tray.removeTag'),
  action('selection.removeFromAlbum', 'tray.removeFromAlbum'),
  action('selection.makeCover', 'tray.makeCover'),
  action('selection.removeLocation', 'tray.removeLocation'),
  action('selection.export', 'tray.export'),
  action('selection.print', 'tray.print'),
  action('selection.collage', 'tray.collage'),
  action('selection.movie', 'tray.movie'),

  action('viewer.close', 'viewer.navigate'),
  action('viewer.previous', 'viewer.navigate'),
  action('viewer.next', 'viewer.navigate'),
  action('viewer.info', 'viewer.info'),
  action('viewer.faces', 'viewer.faces'),
  action('viewer.objects', 'viewer.objects'),
  action('viewer.star', 'photo.star'),
  action('viewer.zoomIn', 'viewer.zoom'),
  action('viewer.zoomOut', 'viewer.zoom'),
  action('viewer.zoomReset', 'viewer.zoom'),
  action('viewer.zoomActual', 'viewer.zoom'),
  action('viewer.panLeft', 'viewer.zoom'),
  action('viewer.panRight', 'viewer.zoom'),
  action('viewer.panUp', 'viewer.zoom'),
  action('viewer.panDown', 'viewer.zoom'),

  action('edit.undo', 'viewer.editBar'),
  action('edit.showOriginal', 'viewer.editBar'),
  ...BUNDLED_FILTER_ACTIONS.map((id) => action(id, 'viewer.editBar')),

  action('slideshow.playPause', 'slideshow'),
  action('slideshow.previous', 'slideshow'),
  action('slideshow.next', 'slideshow'),
  action('slideshow.shuffle', 'slideshow'),
  action('slideshow.exit', 'slideshow'),

  action('people.back', 'view.people'),
  action('people.add', 'people.edit'),

  action('map.back', 'view.map'),
  action('map.placePhotos', 'map.placePhotos'),
  action('map.removeLocation', 'map.removeLocation'),
  action('map.zoomIn', 'view.map'),
  action('map.zoomOut', 'view.map'),

  action('collage.back', 'view.collage'),
  action('collage.pile', 'view.collage'),
  action('collage.grid', 'view.collage'),
  action('collage.download', 'view.collage'),
];

const BUILT_IN = new Map(KEY_ACTIONS.map((a) => [a.id, a]));

/** `edit.<plugin>.<filter>`: an edit bar filter of any plugin, installed or not. */
const FILTER_ACTION = /^edit\.[a-z0-9][a-z0-9-]*\.[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** The action id of a plugin's filter. */
export const filterActionId = (pluginId: string, filterName: string): ActionId => `edit.${pluginId}.${filterName}`;

/** The catalog entry of an action id, or null when it is unknown; a filter of any plugin is an Edit action. */
export function knownAction(id: string): KeyAction | null {
  return BUILT_IN.get(id) ?? (FILTER_ACTION.test(id) ? action(id, 'viewer.editBar') : null);
}

// --- Key chords ---

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
type Modifier = typeof MODIFIERS[number];
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'OS', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol', 'SymbolLock']);
/** Old names some browsers still report */
const KEY_ALIASES: Record<string, string> = {
  ' ': 'Space', Spacebar: 'Space', Esc: 'Escape', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown',
  Del: 'Delete', Plus: '+', Minus: '-',
};
const NAMED_KEY = /^[A-Z][A-Za-z0-9]{1,30}$/;

/** A key name as written in chords: aliases resolved, single letters upper-cased; null if it is not a usable key. */
function keyName(raw: string): string | null {
  const key = KEY_ALIASES[raw] ?? raw;
  if ([...key].length === 1) {
    if (/\s/.test(key)) return null;
    // `ß` upper-cases to two letters; such keys stay as they are
    const upper = key.toUpperCase();
    return [...upper].length === 1 ? upper : key;
  }
  if (MODIFIER_KEYS.has(key) || key === 'Dead' || key === 'Unidentified' || key === 'Process') return null;
  return NAMED_KEY.test(key) ? key : null;
}

const isLetter = (key: string) => [...key].length === 1 && key.toLowerCase() !== key.toUpperCase();
const isSymbol = (key: string) => [...key].length === 1 && !isLetter(key);

function compose(modifiers: Set<Modifier>, key: string): KeyChord {
  // Shift is part of a symbol (`+` is Shift+= on many layouts), so it is not written for symbols
  if (isSymbol(key)) modifiers.delete('Shift');
  return [...MODIFIERS.filter((m) => modifiers.has(m)), key].join('+');
}

/** A chord in its one written form (`ctrl+shift+a` → `Ctrl+Shift+A`), or null if it is not valid. */
export function normalizeChord(chord: unknown): KeyChord | null {
  if (typeof chord !== 'string' || chord === '' || chord.length > 48) return null;
  let rest = chord;
  let key: string;
  if (rest === '+' || rest.endsWith('++')) {
    key = '+';
    rest = rest.slice(0, -2);
  } else {
    const at = rest.lastIndexOf('+');
    key = rest.slice(at + 1);
    rest = at < 0 ? '' : rest.slice(0, at);
  }
  const modifiers = new Set<Modifier>();
  for (const part of rest === '' ? [] : rest.split('+')) {
    const modifier = MODIFIERS.find((m) => m.toLowerCase() === part.toLowerCase()) ?? (part.toLowerCase() === 'control' ? 'Ctrl' : undefined);
    if (!modifier || modifiers.has(modifier)) return null;
    modifiers.add(modifier);
  }
  const name = keyName(key.length === 1 ? key : key.charAt(0).toUpperCase() + key.slice(1));
  return name === null ? null : compose(modifiers, name);
}

/** What `chordOf` needs of a `KeyboardEvent`. */
export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/**
 * The chord a key press makes, or null for a modifier alone or a key that cannot be bound. With Alt or Meta held,
 * letters and digits come from the key's position, because ⌥ on macOS changes the character (⌥1 types `¡`).
 */
export function chordOf(event: KeyEventLike): KeyChord | null {
  let raw = event.key;
  if ((event.altKey || event.metaKey) && event.code) {
    const position = /^Key([A-Z])$/.exec(event.code) ?? /^Digit([0-9])$/.exec(event.code);
    if (position) raw = position[1];
  }
  const key = keyName(raw);
  if (key === null) return null;
  const modifiers = new Set<Modifier>();
  if (event.ctrlKey) modifiers.add('Ctrl');
  if (event.altKey) modifiers.add('Alt');
  if (event.shiftKey) modifiers.add('Shift');
  if (event.metaKey) modifiers.add('Meta');
  return compose(modifiers, key);
}

/** Mirrors the horizontal arrows of a chord, for right-to-left languages. */
export function mirrorChord(chord: KeyChord): KeyChord {
  if (chord.endsWith('ArrowLeft')) return `${chord.slice(0, -'ArrowLeft'.length)}ArrowRight`;
  if (chord.endsWith('ArrowRight')) return `${chord.slice(0, -'ArrowRight'.length)}ArrowLeft`;
  return chord;
}

// --- Presets ---

type Bindings = Record<ActionId, KeyChord[]>;

/** Keys that are the same on Mac and Windows; `Mod` is ⌘ on Mac and Ctrl on Windows. */
const DESKTOP: Bindings = {
  'global.library': ['Alt+1'],
  'global.people': ['Alt+2'],
  'global.map': ['Alt+3'],
  'global.collage': ['Alt+4'],
  'global.tasks': ['Alt+5'],
  'global.settings': ['Mod+,'],
  'global.search': ['Mod+F'],

  'library.open': ['Enter'],
  'library.toggleSelect': ['Space'],
  'library.focusPrevious': ['ArrowLeft'],
  'library.focusNext': ['ArrowRight'],
  'library.focusUp': ['ArrowUp'],
  'library.focusDown': ['ArrowDown'],
  'library.selectAll': ['Mod+A'],
  'library.slideshow': ['Mod+Enter'],

  'selection.clear': ['Escape'],
  'selection.star': ['S'],
  'selection.addToAlbum': ['A'],
  'selection.addTags': ['T'],
  'selection.removeTag': ['Shift+T'],
  'selection.removeFromAlbum': ['Shift+A'],
  'selection.makeCover': ['K'],
  'selection.removeLocation': ['Shift+L'],
  'selection.export': ['Mod+E'],
  'selection.print': ['Mod+P'],
  'selection.collage': ['Shift+C'],
  'selection.movie': ['Shift+M'],

  'viewer.close': ['Escape'],
  'viewer.previous': ['ArrowLeft'],
  'viewer.next': ['ArrowRight'],
  'viewer.info': ['I'],
  'viewer.faces': ['F'],
  'viewer.objects': ['O'],
  'viewer.star': ['S'],
  'viewer.zoomIn': ['+', '='],
  'viewer.zoomOut': ['-'],
  'viewer.zoomReset': ['0'],
  'viewer.zoomActual': ['1'],
  'viewer.panLeft': ['Shift+ArrowLeft'],
  'viewer.panRight': ['Shift+ArrowRight'],
  'viewer.panUp': ['Shift+ArrowUp'],
  'viewer.panDown': ['Shift+ArrowDown'],

  'edit.undo': ['Mod+Z'],
  'edit.showOriginal': ['\\'],
  'edit.basic-transforms.crop64': ['C'],
  'edit.basic-transforms.rotate': ['R'],
  'edit.basic-transforms.flip': ['Shift+F'],
  'edit.basic-transforms.straighten': ['Shift+R'],
  'edit.basic-effects.brightness': ['B'],
  'edit.basic-effects.contrast': ['Shift+B'],
  'edit.basic-effects.bw': ['G'],
  'edit.basic-effects.sepia': ['Shift+G'],

  'slideshow.playPause': ['Space'],
  'slideshow.previous': ['ArrowLeft'],
  'slideshow.next': ['ArrowRight'],
  'slideshow.shuffle': ['S'],
  'slideshow.exit': ['Escape'],

  'people.back': ['Escape'],
  'people.add': ['N'],

  'map.back': ['Escape'],
  'map.placePhotos': ['P'],
  'map.removeLocation': ['Shift+L'],
  'map.zoomIn': ['+', '='],
  'map.zoomOut': ['-'],

  'collage.back': ['Escape'],
  'collage.pile': ['P'],
  'collage.grid': ['G'],
  'collage.download': ['Mod+S'],
};

const withMod = (mod: 'Meta' | 'Ctrl'): Bindings => Object.fromEntries(
  Object.entries(DESKTOP).map(([id, keys]) => [id, keys.map((key) => key.replace(/^Mod\+/, `${mod}+`))]),
);

const BACK = ['Escape', 'GoBack', 'BrowserBack'];

/** A TV remote: arrows, OK (Enter), Back, media keys and the colour keys; no modifiers. Other actions have no key. */
const TV_BOX: Bindings = {
  'global.library': ['ColorF0Red'],
  'library.open': ['Enter'],
  'library.toggleSelect': ['ColorF3Blue'],
  'library.focusPrevious': ['ArrowLeft'],
  'library.focusNext': ['ArrowRight'],
  'library.focusUp': ['ArrowUp'],
  'library.focusDown': ['ArrowDown'],
  'library.slideshow': ['MediaPlayPause'],
  'selection.clear': ['GoBack', 'BrowserBack'],
  'selection.star': ['ColorF2Yellow'],
  'viewer.close': BACK,
  'viewer.previous': ['ArrowLeft'],
  'viewer.next': ['ArrowRight'],
  'viewer.info': ['ColorF1Green'],
  'viewer.star': ['ColorF2Yellow'],
  'viewer.zoomIn': ['ArrowUp'],
  'viewer.zoomOut': ['ArrowDown'],
  'slideshow.playPause': ['MediaPlayPause', 'Enter'],
  'slideshow.previous': ['ArrowLeft'],
  'slideshow.next': ['ArrowRight'],
  'slideshow.shuffle': ['ColorF3Blue'],
  'slideshow.exit': BACK,
  'people.back': BACK,
  'map.back': BACK,
  'collage.back': BACK,
};

/** Each preset's keys; an action a preset does not list has no key in it. */
export const PRESET_BINDINGS: Readonly<Record<KeymapPresetId, Readonly<Bindings>>> = {
  mac: withMod('Meta'),
  windows: withMod('Ctrl'),
  tvBox: TV_BOX,
};

/** The preset of a device: `mac` on Apple devices, `windows` on every other. */
export const devicePreset = (platform: string): KeymapPresetId => (/mac|iphone|ipad|ipod/i.test(platform) ? 'mac' : 'windows');

// --- Keymaps ---

/** Every action's keys: the keymap's own, else its preset's. `extraActions` are the installed plugins' filters. */
export function resolveKeymap(keymap: Pick<StoredKeymap, 'basedOn' | 'bindings'>, extraActions: readonly ActionId[] = []): Map<ActionId, KeyChord[]> {
  const preset = PRESET_BINDINGS[keymap.basedOn];
  const resolved = new Map<ActionId, KeyChord[]>();
  const ids = new Set([...KEY_ACTIONS.map((a) => a.id), ...extraActions, ...Object.keys(keymap.bindings)]);
  for (const id of ids) resolved.set(id, keymap.bindings[id] ?? preset[id] ?? []);
  return resolved;
}

/** Pairs of actions that share a key while both can be active, as conflict problems. */
export function findConflicts(resolved: Map<ActionId, KeyChord[]>): KeymapProblem[] {
  const byKey = new Map<KeyChord, ActionId[]>();
  for (const [id, keys] of resolved) for (const key of keys) byKey.set(key, [...(byKey.get(key) ?? []), id]);
  const problems: KeymapProblem[] = [];
  for (const [key, ids] of byKey) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = knownAction(ids[i]);
        const b = knownAction(ids[j]);
        if (a && b && sectionsOverlap(a.section, b.section)) problems.push({ code: 'conflict', key, actions: [ids[i], ids[j]] });
      }
    }
  }
  return problems;
}

/** The actions whose keys clash with giving `key` to `id`. */
export function conflictsWith(resolved: Map<ActionId, KeyChord[]>, id: ActionId, key: KeyChord): ActionId[] {
  const target = knownAction(id);
  if (!target) return [];
  return [...resolved].filter(([other, keys]) => {
    const otherAction = knownAction(other);
    return other !== id && keys.includes(key) && otherAction !== null && sectionsOverlap(target.section, otherAction.section);
  }).map(([other]) => other);
}

export type KeymapValidation =
  | { ok: true; keymap: StoredKeymap; dropped: string[] }
  | { ok: false; problems: KeymapProblem[] };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks a keymap file: its format and version, name, preset, keys and that no two actions active at once share a
 * key. Unknown sections and actions are left out and listed in `dropped`; filters of any plugin are kept.
 */
export function validateKeymap(input: unknown): KeymapValidation {
  if (!isObject(input) || input.format !== KEYMAP_FORMAT || !Array.isArray(input.sections)) {
    return { ok: false, problems: [{ code: 'not_keymap' }] };
  }
  if (typeof input.version !== 'number' || !Number.isInteger(input.version) || input.version < 1 || input.version > KEYMAP_VERSION) {
    return { ok: false, problems: [{ code: 'version' }] };
  }
  const problems: KeymapProblem[] = [];
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name === '' || [...name].length > KEYMAP_NAME_MAX) problems.push({ code: 'name' });
  if (!isKeymapPreset(input.basedOn)) problems.push({ code: 'preset' });

  const dropped: string[] = [];
  const bindings: Bindings = {};
  for (const section of input.sections) {
    if (!isObject(section) || !Array.isArray(section.actions)) return { ok: false, problems: [{ code: 'not_keymap' }] };
    if (!KEY_SECTIONS.includes(section.id as KeySectionId)) {
      dropped.push(String(section.id));
      continue;
    }
    for (const entry of section.actions) {
      if (!isObject(entry) || typeof entry.id !== 'string' || !Array.isArray(entry.keys)) return { ok: false, problems: [{ code: 'not_keymap' }] };
      if (!knownAction(entry.id)) {
        dropped.push(entry.id);
        continue;
      }
      const keys: KeyChord[] = [];
      for (const raw of entry.keys) {
        const key = normalizeChord(raw);
        if (key === null) problems.push({ code: 'key', key: String(raw), actions: [entry.id] });
        else if (!keys.includes(key)) keys.push(key);
      }
      if (keys.length > KEYS_PER_ACTION_MAX) problems.push({ code: 'key', actions: [entry.id] });
      bindings[entry.id] = keys;
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  const keymap: StoredKeymap = { name, basedOn: input.basedOn as KeymapPresetId, bindings };
  const conflicts = findConflicts(resolveKeymap(keymap));
  if (conflicts.length > 0) return { ok: false, problems: conflicts };
  return { ok: true, keymap, dropped };
}

/** The section of an action id; filters of plugins are Edit. */
const sectionOf = (id: ActionId): KeySectionId => knownAction(id)?.section ?? 'edit';

/**
 * A keymap as a file. With `resolved`, every action is listed with its keys (a download); otherwise only the
 * keymap's own bindings (an API response). `names` adds English names for people reading the file.
 */
export function toKeymapFile(
  keymap: StoredKeymap,
  options: { resolved?: Map<ActionId, KeyChord[]>; actionName?: (id: ActionId) => string; sectionName?: (id: KeySectionId) => string } = {},
): KeymapFile {
  const listed = options.resolved ?? new Map(Object.entries(keymap.bindings));
  const order = new Map(KEY_ACTIONS.map((a, index) => [a.id, index]));
  const ids = [...listed.keys()].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b));
  const sections = KEY_SECTIONS.map((section) => ({
    id: section,
    ...(options.sectionName ? { name: options.sectionName(section) } : {}),
    actions: ids.filter((id) => sectionOf(id) === section).map((id) => ({
      id,
      ...(options.actionName ? { name: options.actionName(id) } : {}),
      keys: listed.get(id)!,
    })),
  })).filter((section) => section.actions.length > 0);
  return { format: KEYMAP_FORMAT, version: KEYMAP_VERSION, name: keymap.name, basedOn: keymap.basedOn, sections };
}

/** The bindings a keymap file lists, without checking them; for files already validated. */
export function bindingsOf(file: KeymapFile): Bindings {
  return Object.fromEntries(file.sections.flatMap((section) => section.actions.map((entry) => [entry.id, entry.keys])));
}
