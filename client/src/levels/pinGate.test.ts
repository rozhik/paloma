import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_UI_SETTINGS, useUiSettings } from '../settings/uiSettings.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { createPin } from './pin.js';
import {
  MAX_PIN_FAILURES, PIN_WAIT_MS, cancelPinRequest, pinWaitLeft, requestSettings, settingsOpen, unlockSettings, usePinGate,
} from './pinGate.js';

const T0 = 1_000_000;

beforeEach(() => {
  useUiSettings.setState({ ...DEFAULT_UI_SETTINGS, level: 'child', pin: createPin('2580') });
  usePinGate.setState({ unlocked: false, failures: 0, lockedUntil: 0, asking: false });
  usePalomaStore.setState({ currentView: 'library' });
});

describe('Settings lock at Child', () => {
  it('opens Settings directly at other levels', () => {
    useUiSettings.setState({ level: 'normal', pin: null });
    requestSettings();
    expect(usePalomaStore.getState().currentView).toBe('settings');
    expect(usePinGate.getState().asking).toBe(false);
  });

  it('asks for the PIN at Child and opens Settings with the right one', () => {
    requestSettings();
    expect(usePalomaStore.getState().currentView).toBe('library');
    expect(usePinGate.getState().asking).toBe(true);
    expect(unlockSettings('2580', T0)).toBe('ok');
    expect(usePalomaStore.getState().currentView).toBe('settings');
    expect(settingsOpen()).toBe(true);
  });

  it('keeps Settings closed for a wrong PIN', () => {
    requestSettings();
    expect(unlockSettings('1111', T0)).toBe('wrong');
    expect(usePalomaStore.getState().currentView).toBe('library');
    expect(settingsOpen()).toBe(false);
  });

  it('keeps the current view when the request is cancelled', () => {
    usePalomaStore.setState({ currentView: 'library' });
    requestSettings();
    cancelPinRequest();
    expect(usePinGate.getState().asking).toBe(false);
    expect(usePalomaStore.getState().currentView).toBe('library');
  });

  it('locks again when Settings are left', () => {
    unlockSettings('2580', T0);
    usePalomaStore.getState().setCurrentView('library');
    expect(settingsOpen()).toBe(false);
    requestSettings();
    expect(usePinGate.getState().asking).toBe(true);
  });

  it('makes the user wait 30 seconds after five wrong PINs in a row', () => {
    for (let i = 1; i < MAX_PIN_FAILURES; i++) expect(unlockSettings('1111', T0)).toBe('wrong');
    expect(pinWaitLeft(T0)).toBe(0);
    expect(unlockSettings('1111', T0)).toBe('wrong');
    expect(pinWaitLeft(T0)).toBe(PIN_WAIT_MS);
    // Even the right PIN is refused while waiting
    expect(unlockSettings('2580', T0 + PIN_WAIT_MS - 1)).toBe('wait');
    expect(pinWaitLeft(T0 + 10_000)).toBe(PIN_WAIT_MS - 10_000);
    expect(unlockSettings('2580', T0 + PIN_WAIT_MS)).toBe('ok');
  });

  it('resets the count after a right PIN', () => {
    for (let i = 1; i < MAX_PIN_FAILURES; i++) unlockSettings('1111', T0);
    unlockSettings('2580', T0);
    usePalomaStore.getState().setCurrentView('library');
    expect(unlockSettings('1111', T0)).toBe('wrong');
    expect(pinWaitLeft(T0)).toBe(0);
  });
});
