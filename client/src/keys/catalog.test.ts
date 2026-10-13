import { describe, it, expect } from 'vitest';
import { KEY_ACTIONS, KEY_SECTIONS, KEYMAP_PRESETS } from '../../../shared/keymaps.js';
import { CONTROL_LEVELS } from '../levels/controls.js';
import en from '../i18n/locales/en.json';

/** A text of the English catalog by dotted key; action ids contain dots, which nest. */
const text = (key: string): unknown => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);

describe('action catalog', () => {
  it('ties every action to a control that has a level', () => {
    for (const action of KEY_ACTIONS) expect(Object.keys(CONTROL_LEVELS), action.id).toContain(action.control);
  });

  it('has an English name for every action, section and preset', () => {
    for (const action of KEY_ACTIONS) expect(typeof text(`keys.actions.${action.id}`), action.id).toBe('string');
    for (const section of KEY_SECTIONS) expect(typeof text(`keys.sections.${section}`), section).toBe('string');
    for (const preset of KEYMAP_PRESETS) expect(typeof text(`keys.presets.${preset}.name`), preset).toBe('string');
  });
});
