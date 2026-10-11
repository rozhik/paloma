import { create } from 'zustand';
import type { AuthStatus, MeResponse, Permission } from '../../../shared/types.js';
import { fetchAuthStatus, fetchMe, login as loginRequest, logout as logoutRequest, setupAdmin } from '../api/auth.js';
import { ApiRequestError, watchSessionEnd } from '../api/http.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

/**
 * What the app shows: `loading` before the server answered; `setup` to create the first administrator;
 * `login` without a session; `changePassword` when the user must choose a new password; `ready` for the app;
 * `error` when the server cannot be reached.
 */
export type AuthPhase = 'loading' | 'setup' | 'login' | 'changePassword' | 'ready' | 'error';

interface AuthStore {
  phase: AuthPhase;
  status: AuthStatus | null;
  me: MeResponse | null;
  /** The user of the last session, so logging in as someone else starts afresh */
  lastUserId: string | null;
  /** Asks the server whether users are on and who is logged in */
  load: (lang: string) => Promise<void>;
  /** After a login, setup or password change: the app for this user */
  enter: (me: MeResponse) => void;
  login: (provider: string, fields: Record<string, string>, lang: string) => Promise<void>;
  setup: (body: { setupCode: string; username: string; displayName: string; password: string }, lang: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Reloads the current user, e.g. after their profile changed */
  refreshMe: (lang: string) => Promise<void>;
  /** A request got 401: the session is over, so show the login page and keep the open view */
  sessionEnded: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  phase: 'loading',
  status: null,
  me: null,
  lastUserId: null,

  load: async (lang) => {
    try {
      const status = await fetchAuthStatus(lang);
      set({ status });
      if (status.mode === 'off') {
        get().enter(await fetchMe(lang));
      } else if (status.setupPending) {
        set({ phase: 'setup', me: null });
      } else {
        try {
          get().enter(await fetchMe(lang));
        } catch (err) {
          if (err instanceof ApiRequestError && err.status === 401) set({ phase: 'login', me: null });
          else throw err;
        }
      }
    } catch {
      set({ phase: 'error' });
    }
  },

  enter: (me) => {
    const userId = me.user?.id ?? null;
    const { lastUserId } = get();
    // The same user comes back to where they were; another one starts at the library
    if (lastUserId !== null && userId !== lastUserId) usePalomaStore.getState().resetForNewUser();
    const phase = me.user?.mustChangePassword ? 'changePassword' : 'ready';
    // An unchanged user keeps the same object, so the controls do not all show again
    if (phase === get().phase && JSON.stringify(me) === JSON.stringify(get().me)) return;
    set({ me, lastUserId: userId, phase });
  },

  login: async (provider, fields, lang) => {
    get().enter(await loginRequest(provider, fields, lang));
  },

  setup: async (body, lang) => {
    get().enter(await setupAdmin(body, lang));
    set((state) => ({ status: state.status && { ...state.status, setupPending: false } }));
  },

  logout: async () => {
    try {
      await logoutRequest();
    } finally {
      set({ phase: 'login', me: null });
    }
  },

  refreshMe: async (lang) => {
    try {
      get().enter(await fetchMe(lang));
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 401)) throw err;
    }
  },

  sessionEnded: () => {
    if (get().status?.mode === 'on' && get().phase !== 'login') set({ phase: 'login', me: null });
  },
}));

const REFRESH_MS = 60_000;

/**
 * Starts noticing ended sessions and changed permissions: the current user is read again after a refused
 * request, when the window gets the focus, and every minute. Call once at startup.
 */
export function watchSession(lang: () => string): () => void {
  const refresh = () => {
    const { phase, refreshMe } = useAuthStore.getState();
    if (phase === 'ready') void refreshMe(lang()).catch(() => {});
  };
  const stop = watchSessionEnd(() => useAuthStore.getState().sessionEnded(), globalThis, refresh);
  const timer = setInterval(refresh, REFRESH_MS);
  window.addEventListener('focus', refresh);
  return () => {
    stop();
    clearInterval(timer);
    window.removeEventListener('focus', refresh);
  };
}

/** The current user's permissions; null means every permission (auth off, or not loaded yet in tests). */
export function grantedPermissions(): ReadonlySet<Permission> | null {
  const { me } = useAuthStore.getState();
  return me && me.mode === 'on' ? new Set(me.permissions) : null;
}

/** Whether the current user has a permission; true when auth is off. */
export function hasPermission(permission: Permission): boolean {
  return grantedPermissions()?.has(permission) ?? true;
}
