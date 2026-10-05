import { create } from 'zustand';

/** A screen edge. Physical sides: they do not mirror in right-to-left languages. */
export type Edge = 'top' | 'bottom' | 'left' | 'right';
export const EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

/** UI preferences kept in this browser only. */
export interface UiSettings {
  /** Where the photo viewer's navigation bar sits */
  navBar: Edge;
  /** Where the photo viewer's edit bar sits */
  editBar: Edge;
}

export const DEFAULT_UI_SETTINGS: UiSettings = { navBar: 'top', editBar: 'left' };

/** Key under which the settings are kept in `localStorage`, as JSON. */
export const UI_SETTINGS_STORAGE_KEY = 'paloma.ui.settings';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const isEdge = (value: unknown): value is Edge => EDGES.includes(value as Edge);

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
    return { ...DEFAULT_UI_SETTINGS };
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

/** The current UI settings; changes are remembered at once, so open views follow without a reload. */
export const useUiSettings = create<UiSettingsStore>((set, get) => ({
  ...loadUiSettings(),
  update: (patch) => {
    const { navBar, editBar } = { ...get(), ...patch };
    set({ navBar, editBar });
    saveUiSettings({ navBar, editBar });
  },
}));
