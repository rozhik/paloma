import { useEffect } from 'react';
import { create } from 'zustand';
import { useUiSettings } from '../settings/uiSettings.js';
import { buildAppearanceCss, isDarkTheme } from './css.js';
import { SYSTEM_QUERIES, readSystemAppearance, resolveTheme } from './resolveTheme.js';
import { SKINS, type SkinComponents, type SkinDefinition, type SkinId } from './skins/index.js';
import { THEMES, type ThemeId } from './themes/index.js';

const STYLE_ID = 'paloma-appearance';

/** Writes a skin's and theme's tokens to the page and marks `<html>` with both. */
export function applyAppearance(skin: SkinDefinition, themeId: ThemeId, doc: Document = document): void {
  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  const theme = THEMES[themeId];
  style.textContent = buildAppearanceCss(skin, theme);
  const html = doc.documentElement;
  html.dataset.skin = skin.id;
  html.dataset.theme = themeId;
  // Bootstrap's own dark styling for its components, and the browser's for scrollbars and form controls
  html.setAttribute('data-bs-theme', isDarkTheme(theme) ? 'dark' : 'light');
}

interface ActiveSkin {
  skin: SkinDefinition;
  components: SkinComponents | null;
  theme: ThemeId;
}

/** The skin whose components are loaded and shown, and the theme in use. */
export const useActiveSkin = create<ActiveSkin>(() => ({ skin: SKINS.classic, components: null, theme: 'light' }));

/** The theme the settings and the operating system ask for now. */
const wantedTheme = (): ThemeId => resolveTheme(useUiSettings.getState().theme, readSystemAppearance());

let switching: SkinId | null = null;

/** Loads a skin, then shows it and the wanted theme in one step, so no frame mixes two skins. */
async function showSkin(id: SkinId): Promise<void> {
  switching = id;
  const skin = SKINS[id];
  const components = await skin.load();
  // A later choice wins over one still loading
  if (switching !== id) return;
  const theme = wantedTheme();
  applyAppearance(skin, theme);
  useActiveSkin.setState({ skin, components, theme });
}

/** Shows the remembered skin and theme before the first render; falls back to Classic if the skin will not load. */
export async function initAppearance(): Promise<void> {
  const id = useUiSettings.getState().skin;
  try {
    await showSkin(id);
  } catch (err) {
    console.error(`Failed to load the ${id} skin:`, err);
    await showSkin('classic');
  }
}

/** Keeps the page in step with the skin and theme settings and, for the System theme, with the OS. */
export function useAppearanceSync(): void {
  const skinId = useUiSettings((state) => state.skin);
  const choice = useUiSettings((state) => state.theme);

  useEffect(() => {
    if (useActiveSkin.getState().skin.id === skinId) return;
    showSkin(skinId).catch((err) => console.error(`Failed to load the ${skinId} skin:`, err));
  }, [skinId]);

  useEffect(() => {
    const update = () => {
      const theme = wantedTheme();
      const { skin } = useActiveSkin.getState();
      applyAppearance(skin, theme);
      useActiveSkin.setState({ theme });
    };
    update();
    if (choice !== 'system' || typeof window.matchMedia !== 'function') return;
    const queries = Object.values(SYSTEM_QUERIES).map((query) => window.matchMedia(query));
    for (const query of queries) query.addEventListener('change', update);
    return () => {
      for (const query of queries) query.removeEventListener('change', update);
    };
  }, [choice]);
}

/** The active skin's definition and components. */
export function useSkin(): { skin: SkinDefinition; components: SkinComponents } {
  const { skin, components } = useActiveSkin();
  if (!components) throw new Error('useSkin() before initAppearance()');
  return { skin, components };
}
