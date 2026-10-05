import { useTranslation } from 'react-i18next';
import { Image, LayoutGrid, MapPin, Puzzle, Settings, Users, type LucideIcon } from 'lucide-react';
import { usePalomaStore, type AppView } from '../store/usePalomaStore.js';

/** The views the navigation offers, in order. Every skin shows all of them. */
export const NAV_ITEMS: readonly { view: AppView; icon: LucideIcon; labelKey: `nav.${AppView}` }[] = [
  { view: 'library', icon: Image, labelKey: 'nav.library' },
  { view: 'people', icon: Users, labelKey: 'nav.people' },
  { view: 'map', icon: MapPin, labelKey: 'nav.map' },
  { view: 'collage', icon: LayoutGrid, labelKey: 'nav.collage' },
  { view: 'plugins', icon: Puzzle, labelKey: 'nav.plugins' },
  { view: 'settings', icon: Settings, labelKey: 'nav.settings' },
];

export interface NavigationItem {
  view: AppView;
  icon: LucideIcon;
  label: string;
  active: boolean;
  select: () => void;
}

/** The navigation's items with labels in the active language. */
export function useNavigationItems(): NavigationItem[] {
  const { t } = useTranslation();
  const currentView = usePalomaStore((state) => state.currentView);
  const setCurrentView = usePalomaStore((state) => state.setCurrentView);
  return NAV_ITEMS.map(({ view, icon, labelKey }) => ({
    view, icon, label: t(labelKey), active: currentView === view, select: () => setCurrentView(view),
  }));
}
