import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../auth/authStore.js';
import { currentLanguage } from '../i18n/index.js';
import { requestSettings } from '../levels/pinGate.js';
import { usePalomaStore, type AppView } from '../store/usePalomaStore.js';
import { useUiSettings } from '../settings/uiSettings.js';
import { LAYER, useKeyActions, useKeyDispatcher } from './dispatcher.js';
import { useKeymapStore } from './keymapStore.js';
import { leaveFullscreen } from '../components/slideshow/Slideshow.js';

/**
 * Leaves the viewer or slideshow before a Global action opens another view: the viewer waits for its saves and
 * stays open when one failed. Set by the open viewer.
 */
let leaveOverlay: (() => Promise<boolean>) | null = null;
export const setLeaveOverlay = (leave: (() => Promise<boolean>) | null): void => {
  leaveOverlay = leave;
};

async function openView(view: AppView | 'settings'): Promise<void> {
  if (leaveOverlay && !(await leaveOverlay())) return;
  if (usePalomaStore.getState().slideshow) {
    leaveFullscreen();
    usePalomaStore.getState().stopSlideshow();
  }
  if (view === 'settings') requestSettings();
  else usePalomaStore.getState().setCurrentView(view);
}

/** The search field of the skin's navigation bar, if it is shown. */
const searchField = () => document.querySelector<HTMLInputElement>('input[type="search"]');

/** The user's keymap, the plugin filters, the one key listener and the Global actions; used once, by the app. */
export function useAppKeys(): void {
  const { i18n } = useTranslation();
  const owner = useAuthStore((state) => state.me?.user?.id ?? '~single');
  const level = useUiSettings((state) => state.level);
  const covered = usePalomaStore((state) => state.viewer !== null || state.slideshow !== null);

  useEffect(() => {
    useKeymapStore.getState().load(owner);
  }, [owner]);

  // Plugins can be switched on and off in Server settings; their filters are read again with the language and level
  useEffect(() => {
    useKeymapStore.getState().loadFilters(currentLanguage());
  }, [i18n.language, level]);

  useKeyDispatcher();

  useKeyActions('global', LAYER.screen, {
    'global.library': () => openView('library'),
    'global.people': () => openView('people'),
    'global.map': () => openView('map'),
    'global.collage': () => openView('collage'),
    'global.tasks': () => openView('tasks'),
    'global.settings': () => openView('settings'),
    'global.search': {
      run: () => {
        const field = searchField()!;
        field.focus();
        field.select();
      },
      enabled: () => !covered && searchField() !== null,
    },
  });
}
