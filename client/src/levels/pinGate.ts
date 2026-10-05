import { create } from 'zustand';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useUiSettings } from '../settings/uiSettings.js';
import { checkPin } from './pin.js';

/** Wrong PINs in a row after which entry is refused for a while */
export const MAX_PIN_FAILURES = 5;
/** How long entry is refused after too many wrong PINs */
export const PIN_WAIT_MS = 30_000;

export type UnlockResult = 'ok' | 'wrong' | 'wait';

interface PinGateState {
  /** Settings were opened with the PIN and have not been left since */
  unlocked: boolean;
  /** Wrong PINs in a row */
  failures: number;
  /** Until when (ms since epoch) entry is refused; 0 when it is not */
  lockedUntil: number;
  /** The PIN dialog is asking for the PIN to open Settings */
  asking: boolean;
}

/**
 * The Child level's lock on Settings. Kept in memory only: a reload locks Settings again and resets the
 * count of wrong PINs, which is fine for a lock meant to keep children out, not to resist an attacker.
 */
export const usePinGate = create<PinGateState>(() => ({ unlocked: false, failures: 0, lockedUntil: 0, asking: false }));

/** Whether Settings may be shown now: always, except at Child before the PIN was entered. */
export const settingsOpen = (): boolean => useUiSettings.getState().level !== 'child' || usePinGate.getState().unlocked;

/** Milliseconds until PIN entry is accepted again; 0 when it is. */
export const pinWaitLeft = (now = Date.now()): number => Math.max(0, usePinGate.getState().lockedUntil - now);

/** Opens Settings, or at Child asks for the PIN first. */
export function requestSettings(): void {
  if (settingsOpen()) usePalomaStore.getState().setCurrentView('settings');
  else usePinGate.setState({ asking: true });
}

/** Checks the PIN; a right one resets the count, the fifth wrong one in a row makes the user wait. */
export function submitPin(pin: string, now = Date.now()): UnlockResult {
  const { pin: record } = useUiSettings.getState();
  if (pinWaitLeft(now) > 0) return 'wait';
  if (!record || checkPin(pin, record)) {
    usePinGate.setState({ failures: 0, lockedUntil: 0 });
    return 'ok';
  }
  const failures = usePinGate.getState().failures + 1;
  if (failures >= MAX_PIN_FAILURES) usePinGate.setState({ failures: 0, lockedUntil: now + PIN_WAIT_MS });
  else usePinGate.setState({ failures });
  return 'wrong';
}

/** Enters the PIN asked for by `requestSettings`; on success opens Settings. */
export function unlockSettings(pin: string, now = Date.now()): UnlockResult {
  const result = submitPin(pin, now);
  if (result === 'ok') {
    usePinGate.setState({ unlocked: true, asking: false });
    usePalomaStore.getState().setCurrentView('settings');
  }
  return result;
}

export const cancelPinRequest = (): void => usePinGate.setState({ asking: false });

/** Keeps Settings open for the user who just chose Child there. */
export const keepSettingsUnlocked = (): void => usePinGate.setState({ unlocked: true });

// Leaving Settings locks them again
usePalomaStore.subscribe((state, previous) => {
  if (previous.currentView === 'settings' && state.currentView !== 'settings') usePinGate.setState({ unlocked: false });
});
