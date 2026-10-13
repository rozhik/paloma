import { useTranslation } from 'react-i18next';
import { Images, ListChecks, LogOut, Server, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';

import type { MeResponse } from '../../../shared/types.js';
import { useAuthStore } from '../auth/authStore.js';
import { allows, useLevel } from '../levels/controls.js';
import type { Level } from '../levels/levels.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

export type UserMenuItemId = 'photos' | 'account' | 'tasks' | 'admin' | 'server' | 'logout';

/** The user menu's items at a level, for the current user's permissions, in order. */
export function userMenuItemsFor(level: Level): UserMenuItemId[] {
  const ids: UserMenuItemId[] = [];
  // The photos of the person the user is, when linked with one they may see
  if (useAuthStore.getState().me?.user?.personVisible && allows(level, 'people.choose')) ids.push('photos');
  if (allows(level, 'view.account')) ids.push('account');
  if (allows(level, 'view.tasks')) ids.push('tasks');
  if (allows(level, 'view.admin')) ids.push('admin');
  if (allows(level, 'view.server')) ids.push('server');
  if (allows(level, 'user.logout')) ids.push('logout');
  return ids;
}

/** Up to two initials of a name, e.g. `AK` for `Anna Kovalenko`. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : words).map((word) => [...word][0] ?? '');
  return letters.join('').toLocaleUpperCase() || '?';
}

export interface UserMenuItem {
  id: UserMenuItemId;
  icon: LucideIcon;
  label: string;
  select: () => void;
}

export interface UserMenu {
  /** The logged-in user; null when users are off */
  user: MeResponse['user'];
  /** The button's accessible name: the user's name, or a generic one with users off */
  label: string;
  initials: string | null;
  /** The uploaded avatar or the linked person's face; null for initials or the icon */
  imageUrl: string | null;
  items: UserMenuItem[];
}

const ICONS: Record<UserMenuItemId, LucideIcon> = { photos: Images, account: UserRound, tasks: ListChecks, admin: ShieldCheck, server: Server, logout: LogOut };
const LABELS = { photos: 'userMenu.myPhotos', account: 'userMenu.account', tasks: 'userMenu.tasks', admin: 'userMenu.admin', server: 'userMenu.server', logout: 'auth.logout' } as const;

/** The user menu at the active level, with labels in the active language; the same in every skin. */
export function useUserMenu(): UserMenu {
  const { t } = useTranslation();
  const level = useLevel();
  const me = useAuthStore((state) => state.me);
  const logout = useAuthStore((state) => state.logout);
  const setCurrentView = usePalomaStore((state) => state.setCurrentView);
  const setSelectedPerson = usePalomaStore((state) => state.setSelectedPerson);
  const user = me?.user ?? null;
  return {
    user,
    label: user ? user.displayName : t('userMenu.localUser'),
    initials: user ? initialsOf(user.displayName) : null,
    imageUrl: user?.avatarUrl ?? null,
    items: userMenuItemsFor(level).map((id) => ({
      id,
      icon: ICONS[id],
      label: t(LABELS[id]),
      select: id === 'logout' ? () => void logout()
        : id === 'photos' ? () => { setSelectedPerson(user!.personId); setCurrentView('library'); }
        : () => setCurrentView(id),
    })),
  };
}
