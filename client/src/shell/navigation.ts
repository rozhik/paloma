import { useTranslation } from 'react-i18next';
import { Image, LayoutGrid, MapPin, Settings, Users, type LucideIcon } from 'lucide-react';
import { usePalomaStore, type AppView } from '../store/usePalomaStore.js';
import { allows, useLevel } from '../levels/controls.js';
import type { Level } from '../levels/levels.js';
import { requestSettings } from '../levels/pinGate.js';

/** The views the navigation offers, in order. Every skin shows all of them. */
export const NAV_ITEMS: readonly { view: AppView; icon: LucideIcon; labelKey: `nav.${AppView}` }[] = [
  { view: 'library', icon: Image, labelKey: 'nav.library' },
  { view: 'people', icon: Users, labelKey: 'nav.people' },
  { view: 'map', icon: MapPin, labelKey: 'nav.map' },
  { view: 'collage', icon: LayoutGrid, labelKey: 'nav.collage' },
  { view: 'settings', icon: Settings, labelKey: 'nav.settings' },
];

export interface NavigationItem {
  view: AppView;
  icon: LucideIcon;
  label: string;
  active: boolean;
  select: () => void;
}

/** The navigation's items shown at a level. */
export const navItemsFor = (level: Level) => NAV_ITEMS.filter(({ view }) => allows(level, `view.${view}`));

/** The navigation's items shown at the active level, with labels in the active language. */
export function useNavigationItems(): NavigationItem[] {
  const { t } = useTranslation();
  const level = useLevel();
  const currentView = usePalomaStore((state) => state.currentView);
  const setCurrentView = usePalomaStore((state) => state.setCurrentView);
  return navItemsFor(level).map(({ view, icon, labelKey }) => ({
    view, icon, label: t(labelKey), active: currentView === view,
    // At Child, Settings ask for the PIN first
    select: view === 'settings' ? requestSettings : () => setCurrentView(view),
  }));
}
