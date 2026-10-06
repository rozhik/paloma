import { create } from 'zustand';
import { SKIN_IDS, type SkinId } from '../appearance/skins/ids.js';
import { THEME_IDS, type ThemeId } from '../appearance/themes/types.js';
import { DEFAULT_LEVEL, isLevel, type Level } from '../levels/levels.js';
import { isPinRecord, type PinRecord } from '../levels/pin.js';

/** A screen edge. Physical sides: they do not mirror in right-to-left languages. */
export type Edge = 'top' | 'bottom' | 'left' | 'right';
export const EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

/** A theme, or `system` to follow the operating system. */
export type ThemeChoice = 'system' | ThemeId;
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', ...THEME_IDS];

/** The lists in the sidebar that can be collapsed. */
export const SIDEBAR_LISTS = ['shortcuts', 'memories', 'albums', 'tags', 'people', 'folders'] as const;
export type SidebarListId = typeof SIDEBAR_LISTS[number];

/** Seconds a slideshow shows each photo. */
export const SLIDESHOW_INTERVALS = [3, 5, 10] as const;
export type SlideshowInterval = typeof SLIDESHOW_INTERVALS[number];

/** UI preferences kept in this browser only. */
export interface UiSettings {
  /** Where the photo viewer's navigation bar sits */
  navBar: Edge;
  /** Where the photo viewer's edit bar sits */
  editBar: Edge;
  skin: SkinId;
  theme: ThemeChoice;
  /** The whole sidebar shrunk to a narrow strip (Compact skin) */
  sidebarCollapsed: boolean;
  /** Sidebar lists the user collapsed; the same in every skin */
  collapsedSidebarLists: SidebarListId[];
  /** How much of the UI is shown; `child` only together with a `pin` */
  level: Level;
  /** The PIN that unlocks Settings at the Child level; null at every other level */
  pin: PinRecord | null;
  slideshowInterval: SlideshowInterval;
  /** Face frames drawn over the photo in the viewer */
  showFaces: boolean;
}

export const DEFAULT_UI_SETTINGS: UiSettings = {
  navBar: 'top', editBar: 'left', skin: 'classic', theme: 'system', sidebarCollapsed: false, collapsedSidebarLists: [],
  level: DEFAULT_LEVEL, pin: null, slideshowInterval: 5, showFaces: false,
};

/** Key under which the settings are kept in `localStorage`, as JSON. */
export const UI_SETTINGS_STORAGE_KEY = 'paloma.ui.settings';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const isEdge = (value: unknown): value is Edge => EDGES.includes(value as Edge);
const isSkin = (value: unknown): value is SkinId => SKIN_IDS.includes(value as SkinId);
const isThemeChoice = (value: unknown): value is ThemeChoice => THEME_CHOICES.includes(value as ThemeChoice);
const isSidebarList = (value: unknown): value is SidebarListId => SIDEBAR_LISTS.includes(value as SidebarListId);
const isSlideshowInterval = (value: unknown): value is SlideshowInterval =>
  SLIDESHOW_INTERVALS.includes(value as SlideshowInterval);

/**
 * The level and PIN that may be kept together: Child needs a PIN, and only Child has one.
 * Child without a usable PIN is read as the default level, so nobody is locked out of Settings.
 */
export function normalizeLevel(level: unknown, pin: unknown): { level: Level; pin: PinRecord | null } {
  if (!isLevel(level)) return { level: DEFAULT_LEVEL, pin: null };
  if (level !== 'child') return { level, pin: null };
  return isPinRecord(pin) ? { level, pin } : { level: DEFAULT_LEVEL, pin: null };
}

/** Settings from stored JSON; each field that is missing or invalid falls back to its default on its own. */
export function parseUiSettings(raw: string | null): UiSettings {
  let value: unknown = null;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    // Malformed: defaults
  }
  const stored = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return {
    navBar: isEdge(stored.navBar) ? stored.navBar : DEFAULT_UI_SETTINGS.navBar,
    editBar: isEdge(stored.editBar) ? stored.editBar : DEFAULT_UI_SETTINGS.editBar,
    skin: isSkin(stored.skin) ? stored.skin : DEFAULT_UI_SETTINGS.skin,
    theme: isThemeChoice(stored.theme) ? stored.theme : DEFAULT_UI_SETTINGS.theme,
    sidebarCollapsed: typeof stored.sidebarCollapsed === 'boolean' ? stored.sidebarCollapsed : DEFAULT_UI_SETTINGS.sidebarCollapsed,
    // Unknown lists are dropped, each list at most once
    collapsedSidebarLists: Array.isArray(stored.collapsedSidebarLists)
      ? [...new Set(stored.collapsedSidebarLists.filter(isSidebarList))]
      : [],
    ...normalizeLevel(stored.level, stored.pin),
    slideshowInterval: isSlideshowInterval(stored.slideshowInterval)
      ? stored.slideshowInterval
      : DEFAULT_UI_SETTINGS.slideshowInterval,
    showFaces: typeof stored.showFaces === 'boolean' ? stored.showFaces : DEFAULT_UI_SETTINGS.showFaces,
  };
}

function browserStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The settings remembered in this browser, or the defaults when storage is unavailable. */
export function loadUiSettings(storage: KeyValueStorage | null = browserStorage()): UiSettings {
  try {
    return parseUiSettings(storage?.getItem(UI_SETTINGS_STORAGE_KEY) ?? null);
  } catch {
    return parseUiSettings(null);
  }
}

/** Remembers the settings; false when the browser cannot store them (they still apply until reload). */
export function saveUiSettings(settings: UiSettings, storage: KeyValueStorage | null = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

interface UiSettingsStore extends UiSettings {
  update: (patch: Partial<UiSettings>) => void;
}

/** Only the settings, without the store's actions. */
const settingsOf = (state: UiSettings): UiSettings => ({
  navBar: state.navBar,
  editBar: state.editBar,
  skin: state.skin,
  theme: state.theme,
  sidebarCollapsed: state.sidebarCollapsed,
  collapsedSidebarLists: state.collapsedSidebarLists,
  ...normalizeLevel(state.level, state.pin),
  slideshowInterval: state.slideshowInterval,
  showFaces: state.showFaces,
});

/** The current UI settings; changes are remembered at once, so open views follow without a reload. */
export const useUiSettings = create<UiSettingsStore>((set, get) => ({
  ...loadUiSettings(),
  update: (patch) => {
    const next = settingsOf({ ...get(), ...patch });
    set(next);
    saveUiSettings(next);
  },
}));
