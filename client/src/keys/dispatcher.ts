import { useEffect, useRef } from 'react';
import type { ActionId, KeyChord, KeySectionId } from '../../../shared/types.js';
import { chordOf, knownAction, mirrorChord } from '../../../shared/keymaps.js';
import { i18n } from '../i18n/index.js';
import { allows, type ControlId } from '../levels/controls.js';
import { useUiSettings } from '../settings/uiSettings.js';
import { resolvedKeymap, useKeymapStore } from './keymapStore.js';

/**
 * One listener for every keymap key. Screens register what their actions do with `useKeyActions`; a key runs the
 * action bound to it in the user's keymap, among Global and the sections of the topmost screen. See docs/keybindings.md.
 */

/** What an action does now; `enabled` false lets the key keep its browser default. */
export type KeyHandler = (() => void) | { run: () => void; enabled?: () => boolean };

/** Stacked screens: the viewer is over the library, the slideshow over everything. Only the topmost one takes keys. */
export const LAYER = { screen: 0, viewer: 1, slideshow: 2 } as const;

export interface Registration {
  section: KeySectionId;
  layer: number;
  handlers: Partial<Record<ActionId, KeyHandler>>;
}

const registrations = new Set<Registration>();

/** Where the key was pressed, as far as choosing an action goes. */
export interface KeyTarget {
  /** In a text field, text area, list box, slider or editable text */
  typing: boolean;
  /** On a button, link, checkbox or menu item, which Enter and Space activate */
  activates: boolean;
  /** A dialog is open */
  dialog: boolean;
}

export interface PickInput extends KeyTarget {
  chord: KeyChord;
  /** The control already took the key (`preventDefault`), e.g. Esc in a field */
  handled: boolean;
  rtl: boolean;
  registrations: Iterable<Registration>;
  keymap: Map<ActionId, KeyChord[]>;
  /** Whether the level and permissions allow a control */
  allows: (control: string) => boolean;
}

const runOf = (handler: KeyHandler) => (typeof handler === 'function' ? handler : handler.run);
const enabledOf = (handler: KeyHandler) => (typeof handler === 'function' ? true : handler.enabled?.() ?? true);

/** The action a key press runs, or null when it runs none. */
export function pickAction(input: PickInput): { id: ActionId; run: () => void } | null {
  if (input.handled) return null;
  const isEscape = input.chord === 'Escape';
  // Keys typed into a field stay there; Esc runs its action only if the field did not use it
  if (input.typing && !isEscape) return null;
  if (input.activates && (input.chord === 'Enter' || input.chord === 'Space')) return null;
  const chord = input.rtl ? mirrorChord(input.chord) : input.chord;
  const all = [...input.registrations];
  const top = Math.max(-Infinity, ...all.filter((r) => r.section !== 'global').map((r) => r.layer));
  for (const registration of all) {
    const isGlobal = registration.section === 'global';
    if (!isGlobal && (input.dialog || registration.layer !== top)) continue;
    for (const [id, handler] of Object.entries(registration.handlers)) {
      if (!handler || !(input.keymap.get(id) ?? []).includes(chord)) continue;
      const action = knownAction(id);
      if (!action || action.section !== registration.section) continue;
      if (!input.allows(action.control) || !enabledOf(handler)) return null;
      return { id, run: runOf(handler) };
    }
  }
  return null;
}

const TYPING = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]), textarea, select, '
  + '[contenteditable=""], [contenteditable="true"], [role=slider], [role=textbox], [role=combobox], [role=listbox], [role=spinbutton]';
const ACTIVATES = 'button, a[href], summary, input, [role=button]:not(.photo-card), [role=checkbox], [role=radio], [role=menuitem], [role=tab], [role=switch], [role=option]';

/** Reads where a key was pressed from the page. */
export function keyTargetOf(target: EventTarget | null, doc: Document = document): KeyTarget {
  const element = target instanceof Element ? target : null;
  return {
    typing: !!element?.closest(TYPING) || (element instanceof HTMLElement && element.isContentEditable),
    activates: !!element?.closest(ACTIVATES),
    dialog: !!doc.querySelector('.modal.show, .dropdown-menu.show'),
  };
}

function onKeyDown(event: KeyboardEvent) {
  if (event.isComposing || useKeymapStore.getState().capturing) return;
  const chord = chordOf(event);
  if (chord === null) return;
  const level = useUiSettings.getState().level;
  const picked = pickAction({
    ...keyTargetOf(event.target),
    chord,
    handled: event.defaultPrevented,
    rtl: i18n.dir() === 'rtl',
    registrations,
    keymap: resolvedKeymap(useKeymapStore.getState()),
    allows: (control) => allows(level, control as ControlId),
  });
  if (!picked) return;
  event.preventDefault();
  picked.run();
}

/** Starts the one key listener; call once, in the app. */
export function useKeyDispatcher(): void {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/**
 * Registers what a screen's actions in `section` do while it is shown. Handlers may change on every render; the
 * latest ones run. `active` false registers nothing.
 */
export function useKeyActions(section: KeySectionId, layer: number, handlers: Partial<Record<ActionId, KeyHandler>>, active = true): void {
  const registration = useRef<Registration>({ section, layer, handlers });
  registration.current.handlers = handlers;
  registration.current.section = section;
  registration.current.layer = layer;
  useEffect(() => {
    if (!active) return;
    const current = registration.current;
    registrations.add(current);
    return () => {
      registrations.delete(current);
    };
  }, [active]);
}

/** For tests: the registrations in use. */
export const activeRegistrations = (): ReadonlySet<Registration> => registrations;
