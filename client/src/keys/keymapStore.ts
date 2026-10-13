import { create } from 'zustand';
import type { ActionId, KeyChord, KeymapPresetId, StoredKeymap } from '../../../shared/types.js';
import { bindingsOf, devicePreset, filterActionId, resolveKeymap, toKeymapFile } from '../../../shared/keymaps.js';
import { fetchKeymap, saveKeymap } from '../api/keymap.js';
import { fetchPlugins } from '../api/plugins.js';

/** An edit bar filter of an installed plugin, as a keyboard action. */
export interface FilterAction {
  id: ActionId;
  /** The filter's name in the active language */
  label: string;
}

interface KeymapStore {
  /** What the server has for the user; null while nothing is stored or before it answered */
  stored: StoredKeymap | null;
  /** The user the keymap was loaded for (`~single` with users off); null before the first load */
  owner: string | null;
  /** The request for the keymap failed, so the device default is in use */
  loadFailed: boolean;
  /** Filters of the active plugins */
  filters: FilterAction[];
  /** The key capture of the Keybindings page is waiting for a key; no action runs meanwhile */
  capturing: boolean;
  /** Loads the user's keymap; on failure the device default stays in use */
  load: (owner: string) => Promise<void>;
  /** Loads the filters of the active plugins, with labels in `lang` */
  loadFilters: (lang: string) => Promise<void>;
  /** Saves a keymap; shown at once, and back to the last saved one if the server refuses it */
  save: (keymap: StoredKeymap) => Promise<{ dropped: string[] }>;
  setCapturing: (capturing: boolean) => void;
}

const platform = () => (typeof navigator === 'undefined' ? '' : (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
  ?? navigator.platform ?? '');

/** The keymap of a user with nothing stored: a copy of `mac` on Apple devices, else of `windows`. */
export function defaultKeymap(name: (preset: KeymapPresetId) => string, device = platform()): StoredKeymap {
  const basedOn = devicePreset(device);
  return { name: name(basedOn), basedOn, bindings: {} };
}

/** English preset names, for a keymap made before the UI language is known; the UI shows them translated. */
export const PRESET_NAMES: Record<KeymapPresetId, string> = { mac: 'Mac', windows: 'Windows', tvBox: 'TV box' };

export const useKeymapStore = create<KeymapStore>((set, get) => ({
  stored: null,
  owner: null,
  loadFailed: false,
  filters: [],
  capturing: false,

  load: async (owner) => {
    if (get().owner !== owner) set({ stored: null, owner, loadFailed: false });
    try {
      const { keymap } = await fetchKeymap();
      if (get().owner !== owner) return;
      set({ stored: keymap && { name: keymap.name, basedOn: keymap.basedOn, bindings: bindingsOf(keymap) }, loadFailed: false });
    } catch {
      if (get().owner === owner) set({ loadFailed: true });
    }
  },

  loadFilters: async (lang) => {
    try {
      const plugins = await fetchPlugins(lang);
      set({
        filters: plugins.filter((plugin) => plugin.status === 'active')
          .flatMap((plugin) => plugin.filters.map((filter) => ({ id: filterActionId(plugin.id, filter.name), label: filter.label }))),
      });
    } catch {
      // Without the list, only the bundled filters have actions
    }
  },

  save: async (keymap) => {
    const before = get().stored;
    set({ stored: keymap });
    try {
      const saved = await saveKeymap(toKeymapFile(keymap));
      set({ stored: { name: saved.keymap.name, basedOn: saved.keymap.basedOn, bindings: bindingsOf(saved.keymap) } });
      return { dropped: saved.dropped };
    } catch (err) {
      set({ stored: before });
      throw err;
    }
  },

  setCapturing: (capturing) => set({ capturing }),
}));

/** The user's keymap: the stored one, else the device default. */
export const effectiveKeymap = (state: Pick<KeymapStore, 'stored'>): StoredKeymap => state.stored ?? defaultKeymap((preset) => PRESET_NAMES[preset]);

/** Every action's keys in the user's keymap, including the installed filters. */
export const resolvedKeymap = (state: Pick<KeymapStore, 'stored' | 'filters'>): Map<ActionId, KeyChord[]> =>
  resolveKeymap(effectiveKeymap(state), state.filters.map((filter) => filter.id));
