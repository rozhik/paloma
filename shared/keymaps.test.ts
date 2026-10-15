import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BUNDLED_FILTER_ACTIONS, KEY_ACTIONS, KEYMAP_FORMAT, PRESET_BINDINGS, bindingsOf, chordOf, conflictsWith, devicePreset, findConflicts,
  knownAction, mirrorChord, normalizeChord, resolveKeymap, toKeymapFile, validateKeymap,
} from './keymaps.js';
import type { KeymapFile, KeymapPresetId } from './types.js';

const press = (key: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}, code?: string) => chordOf({
  key, code, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift, metaKey: !!mods.meta,
});

const file = (sections: KeymapFile['sections'], extra: Partial<KeymapFile> = {}): KeymapFile => ({
  format: KEYMAP_FORMAT, version: 1, name: 'My keys', basedOn: 'windows', sections, ...extra,
});

describe('chords', () => {
  it('writes modifiers in a fixed order and upper-cases letters', () => {
    expect(normalizeChord('shift+ctrl+a')).toBe('Ctrl+Shift+A');
    expect(normalizeChord('Meta+z')).toBe('Meta+Z');
    expect(normalizeChord('control+,')).toBe('Ctrl+,');
  });

  it('accepts `+` as a key and drops Shift from symbols', () => {
    expect(normalizeChord('+')).toBe('+');
    expect(normalizeChord('Ctrl++')).toBe('Ctrl++');
    expect(normalizeChord('Shift+=')).toBe('=');
    expect(press('+', { shift: true }, 'Equal')).toBe('+');
  });

  it('refuses what is not a key', () => {
    for (const bad of ['', 'Ctrl+', 'Hyper+A', 'Ctrl+Ctrl+A', 'Shift', 'Ctrl+Shift', 'a b', 42, null]) expect(normalizeChord(bad)).toBeNull();
  });

  it('names keys from events', () => {
    expect(press(' ')).toBe('Space');
    expect(press('i')).toBe('I');
    expect(press('I', { shift: true })).toBe('Shift+I');
    expect(press('ArrowLeft', { shift: true })).toBe('Shift+ArrowLeft');
    expect(press('Esc')).toBe('Escape');
    expect(press('z', { ctrl: true })).toBe('Ctrl+Z');
    expect(press('Shift', { shift: true })).toBeNull();
    expect(press('Dead')).toBeNull();
  });

  it('takes letters and digits from their position with Alt or Meta (⌥1 on macOS types ¡)', () => {
    expect(press('¡', { alt: true }, 'Digit1')).toBe('Alt+1');
    expect(press('å', { alt: true }, 'KeyA')).toBe('Alt+A');
    expect(press('z', { meta: true }, 'KeyZ')).toBe('Meta+Z');
  });

  it('mirrors horizontal arrows', () => {
    expect(mirrorChord('ArrowLeft')).toBe('ArrowRight');
    expect(mirrorChord('Shift+ArrowRight')).toBe('Shift+ArrowLeft');
    expect(mirrorChord('ArrowUp')).toBe('ArrowUp');
  });
});

describe('presets', () => {
  const everyAction = KEY_ACTIONS.map((a) => a.id);

  it.each(['mac', 'windows'] as KeymapPresetId[])('%s gives every built-in action a valid key', (preset) => {
    for (const id of everyAction) {
      const keys = PRESET_BINDINGS[preset][id];
      expect(keys?.length, id).toBeGreaterThan(0);
      for (const key of keys) expect(normalizeChord(key), `${id}: ${key}`).toBe(key);
    }
  });

  it('tvBox uses only remote keys, without modifiers', () => {
    const remote = /^(Arrow(Up|Down|Left|Right)|Enter|Escape|GoBack|BrowserBack|Media[A-Za-z]+|Color[A-Za-z0-9]+|[0-9])$/;
    for (const [id, keys] of Object.entries(PRESET_BINDINGS.tvBox)) {
      expect(knownAction(id), id).not.toBeNull();
      for (const key of keys) expect(key, id).toMatch(remote);
    }
    expect(PRESET_BINDINGS.tvBox['viewer.close']).toContain('GoBack');
  });

  it.each(['mac', 'windows', 'tvBox'] as KeymapPresetId[])('%s has no keys that clash', (preset) => {
    expect(findConflicts(resolveKeymap({ basedOn: preset, bindings: {} }))).toEqual([]);
  });

  it('windows keeps the keys Paloma had before keymaps', () => {
    const w = PRESET_BINDINGS.windows;
    expect(w['viewer.close']).toEqual(['Escape']);
    expect(w['viewer.previous']).toEqual(['ArrowLeft']);
    expect(w['viewer.next']).toEqual(['ArrowRight']);
    expect(w['viewer.info']).toEqual(['I']);
    expect(w['viewer.faces']).toEqual(['F']);
    expect(w['viewer.zoomIn']).toEqual(['+', '=']);
    expect(w['viewer.zoomOut']).toEqual(['-']);
    expect(w['viewer.zoomReset']).toEqual(['0']);
    expect(w['edit.undo']).toEqual(['Ctrl+Z']);
    expect(w['slideshow.playPause']).toEqual(['Space']);
    expect(w['slideshow.exit']).toEqual(['Escape']);
    expect(w['library.open']).toEqual(['Enter']);
    expect(w['library.toggleSelect']).toEqual(['Space']);
    expect(PRESET_BINDINGS.mac['edit.undo']).toEqual(['Meta+Z']);
  });

  it('zooms to 100% with 1 and turns slideshow shuffle on or off with S', () => {
    for (const preset of ['mac', 'windows'] as const) {
      expect(PRESET_BINDINGS[preset]['viewer.zoomActual']).toEqual(['1']);
      expect(PRESET_BINDINGS[preset]['slideshow.shuffle']).toEqual(['S']);
    }
    expect(PRESET_BINDINGS.tvBox['slideshow.shuffle']).toEqual(['ColorF3Blue']);
    expect(PRESET_BINDINGS.tvBox['viewer.zoomActual']).toBeUndefined();
  });

  it('picks the preset of the device', () => {
    expect(devicePreset('MacIntel')).toBe('mac');
    expect(devicePreset('iPhone')).toBe('mac');
    expect(devicePreset('Win32')).toBe('windows');
    expect(devicePreset('Linux x86_64')).toBe('windows');
  });
});

describe('resolveKeymap', () => {
  it('takes the preset keys for actions the keymap does not list', () => {
    const resolved = resolveKeymap({ basedOn: 'windows', bindings: { 'viewer.next': ['ArrowRight', 'PageDown'] } });
    expect(resolved.get('viewer.next')).toEqual(['ArrowRight', 'PageDown']);
    expect(resolved.get('viewer.previous')).toEqual(['ArrowLeft']);
  });

  it('keeps an action listed with no keys unbound', () => {
    expect(resolveKeymap({ basedOn: 'windows', bindings: { 'selection.star': [] } }).get('selection.star')).toEqual([]);
  });

  it('lists the installed plugin filters', () => {
    expect(resolveKeymap({ basedOn: 'mac', bindings: {} }, ['edit.vignette.vignette']).get('edit.vignette.vignette')).toEqual([]);
  });
});

describe('validateKeymap', () => {
  it('accepts a keymap and normalizes its keys', () => {
    const result = validateKeymap(file([{ id: 'viewer', actions: [{ id: 'viewer.next', keys: ['n', 'ArrowRight'] }] }]));
    expect(result).toEqual({ ok: true, keymap: { name: 'My keys', basedOn: 'windows', bindings: { 'viewer.next': ['N', 'ArrowRight'] } }, dropped: [] });
  });

  it('refuses what is not a keymap', () => {
    expect(validateKeymap({ version: 1, photos: {} })).toEqual({ ok: false, problems: [{ code: 'not_keymap' }] });
    expect(validateKeymap('text')).toEqual({ ok: false, problems: [{ code: 'not_keymap' }] });
  });

  it('refuses a newer version', () => {
    expect(validateKeymap(file([], { version: 2 as 1 }))).toEqual({ ok: false, problems: [{ code: 'version' }] });
  });

  it('refuses a bad name, preset or key', () => {
    const result = validateKeymap(file([{ id: 'viewer', actions: [{ id: 'viewer.next', keys: ['Ctrl+'] }] }], {
      name: ' ', basedOn: 'linux' as KeymapPresetId,
    }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.map((p) => p.code)).toEqual(['name', 'preset', 'key']);
    expect(validateKeymap(file([], { name: 'x'.repeat(65) })).ok).toBe(false);
  });

  it('refuses a key shared within a section and names both actions', () => {
    const result = validateKeymap(file([{ id: 'viewer', actions: [{ id: 'viewer.close', keys: ['I'] }] }]));
    expect(result).toEqual({ ok: false, problems: [{ code: 'conflict', key: 'I', actions: ['viewer.close', 'viewer.info'] }] });
  });

  it('refuses a key shared between Viewer and Edit, and between Global and any section', () => {
    expect(validateKeymap(file([{ id: 'edit', actions: [{ id: 'edit.basic-transforms.rotate', keys: ['I'] }] }])).ok).toBe(false);
    expect(validateKeymap(file([{ id: 'global', actions: [{ id: 'global.search', keys: ['N'] }] }])).ok).toBe(false);
  });

  it('accepts the same key on two screens', () => {
    expect(validateKeymap(file([{ id: 'viewer', actions: [{ id: 'viewer.next', keys: ['N'] }] }, { id: 'slideshow', actions: [{ id: 'slideshow.next', keys: ['N'] }] }])).ok).toBe(true);
  });

  it('checks clashes with the preset keys too', () => {
    // Viewer → Info panel keeps `I` from the preset
    expect(validateKeymap(file([{ id: 'viewer', actions: [{ id: 'viewer.faces', keys: ['I'] }] }])).ok).toBe(false);
  });

  it('drops unknown sections and actions, and keeps filters of plugins that are not installed', () => {
    const result = validateKeymap(file([
      { id: 'viewer', actions: [{ id: 'viewer.teleport', keys: ['T'] }, { id: 'viewer.next', keys: ['N'] }] },
      { id: 'kitchen', actions: [{ id: 'kitchen.coffee', keys: ['C'] }] },
      { id: 'edit', actions: [{ id: 'edit.vignette.vignette', keys: ['V'] }] },
    ]));
    expect(result.ok && result.dropped).toEqual(['viewer.teleport', 'kitchen']);
    expect(result.ok && result.keymap.bindings).toEqual({ 'viewer.next': ['N'], 'edit.vignette.vignette': ['V'] });
  });
});

describe('files', () => {
  it('round-trips a download through validation with the same keys', () => {
    const keymap = { name: 'Mine', basedOn: 'mac' as const, bindings: { 'viewer.next': ['N'], 'selection.star': [] } };
    const resolved = resolveKeymap(keymap);
    const download = toKeymapFile(keymap, { resolved, actionName: (id) => id.toUpperCase(), sectionName: (id) => id });
    expect(download.sections[0].id).toBe('global');
    expect(download.sections.find((s) => s.id === 'viewer')!.actions.find((a) => a.id === 'viewer.next')).toEqual({ id: 'viewer.next', name: 'VIEWER.NEXT', keys: ['N'] });
    const result = validateKeymap(JSON.parse(JSON.stringify(download)));
    expect(result.ok).toBe(true);
    expect(result.ok && resolveKeymap(result.keymap)).toEqual(resolved);
  });

  it('lists only the own bindings without `resolved`', () => {
    const keymap = { name: 'Mine', basedOn: 'mac' as const, bindings: { 'viewer.next': ['N'] } };
    expect(bindingsOf(toKeymapFile(keymap))).toEqual({ 'viewer.next': ['N'] });
  });
});

describe('conflictsWith', () => {
  it('names the actions of the same scope that have the key', () => {
    const resolved = resolveKeymap({ basedOn: 'windows', bindings: {} });
    expect(conflictsWith(resolved, 'viewer.close', 'I')).toEqual(['viewer.info']);
    expect(conflictsWith(resolved, 'slideshow.next', 'I')).toEqual([]);
  });

  it('knows the bundled filters', () => {
    for (const id of BUNDLED_FILTER_ACTIONS) expect(knownAction(id)?.section).toBe('edit');
  });
});

describe('docs/keybindings.md', () => {
  it('has an example that is a valid keymap', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'keybindings.md'), 'utf-8');
    const example = /```json\n([\s\S]*?)```/.exec(doc)![1];
    const result = validateKeymap(JSON.parse(example));
    expect(result).toMatchObject({ ok: true, dropped: [] });
  });
});
