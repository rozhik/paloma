import { describe, it, expect } from 'vitest';
import { resolveKeymap, toKeymapFile } from '../../../shared/keymaps.js';
import type { StoredKeymap } from '../../../shared/types.js';
import {
  addKey, canAddKey, displayChord, downloadName, isReserved, keysOf, matchesFilter, readUpload, removeKey, rename, resetAction, resetAll,
} from './keymapEdit.js';

const windows: StoredKeymap = { name: 'Windows', basedOn: 'windows', bindings: {} };
const keymapOf = (result: ReturnType<typeof addKey>) => {
  if (!('keymap' in result)) throw new Error('conflict');
  return result.keymap;
};

describe('editing keys', () => {
  it('adds a key that then runs the action', () => {
    const keymap = keymapOf(addKey(windows, 'viewer.next', 'N'));
    expect(keysOf(keymap, 'viewer.next')).toEqual(['ArrowRight', 'N']);
    expect(keymap.bindings).toEqual({ 'viewer.next': ['ArrowRight', 'N'] });
  });

  it('records Esc like any key', () => {
    expect(keysOf(keymapOf(addKey(windows, 'people.add', 'Escape', { move: true })), 'people.add')).toEqual(['N', 'Escape']);
  });

  it('names the action of the same scope that has the key, and moves it on request', () => {
    expect(addKey(windows, 'viewer.close', 'I')).toEqual({ conflicts: [{ key: 'I', actions: ['viewer.info'] }] });
    const moved = keymapOf(addKey(windows, 'viewer.close', 'I', { move: true }));
    expect(keysOf(moved, 'viewer.close')).toEqual(['Escape', 'I']);
    expect(keysOf(moved, 'viewer.info')).toEqual([]);
  });

  it('removes a key', () => {
    expect(keysOf(removeKey(windows, 'viewer.zoomIn', '='), 'viewer.zoomIn')).toEqual(['+']);
  });

  it('resets an action to its preset keys, and keeps only changed actions in the keymap', () => {
    const changed = removeKey(windows, 'selection.star', 'S');
    expect(changed.bindings).toEqual({ 'selection.star': [] });
    const reset = keymapOf(resetAction(changed, 'selection.star'));
    expect(keysOf(reset, 'selection.star')).toEqual(['S']);
    expect(reset.bindings).toEqual({});
  });

  it('reports a reset whose keys another action took', () => {
    const moved = keymapOf(addKey(windows, 'viewer.close', 'I', { move: true }));
    expect(resetAction(moved, 'viewer.info')).toEqual({ conflicts: [{ key: 'I', actions: ['viewer.close'] }] });
    expect(keysOf(keymapOf(resetAction(moved, 'viewer.info', { move: true })), 'viewer.close')).toEqual(['Escape']);
  });

  it('resets every key', () => {
    expect(resetAll({ ...windows, bindings: { 'viewer.next': ['N'] } }).bindings).toEqual({});
  });

  it('allows at most eight keys per action', () => {
    const keymap = { ...windows, bindings: { 'people.add': ['1', '2', '3', '4', '5', '6', '7', 'N'] } };
    expect(canAddKey(windows, 'people.add')).toBe(true);
    expect(canAddKey(keymap, 'people.add')).toBe(false);
  });

  it('renames within 1 to 64 characters', () => {
    expect(rename(windows, '  Mine ')?.name).toBe('Mine');
    expect(rename(windows, ' ')).toBeNull();
    expect(rename(windows, 'x'.repeat(65))).toBeNull();
  });

  it('knows chords browsers keep', () => {
    expect(isReserved('Ctrl+W')).toBe(true);
    expect(isReserved('Ctrl+E')).toBe(false);
  });
});

describe('showing and filtering', () => {
  it('shows chords with Mac symbols on a Mac', () => {
    expect(displayChord('Meta+Shift+Z', true)).toBe('⌘⇧Z');
    expect(displayChord('Ctrl+Z', false)).toBe('Ctrl+Z');
    expect(displayChord('ArrowLeft', false)).toBe('←');
    expect(displayChord('Ctrl++', false)).toBe('Ctrl++');
  });

  it('filters by name or key', () => {
    expect(matchesFilter('space', 'Play or pause', ['Space'], false)).toBe(true);
    expect(matchesFilter('Space', 'Next photo', ['ArrowRight'], false)).toBe(false);
    expect(matchesFilter('next', 'Next photo', ['ArrowRight'], false)).toBe(true);
    expect(matchesFilter('', 'Anything', [], false)).toBe(true);
  });
});

describe('download and upload', () => {
  it('round-trips a download', () => {
    const keymap = keymapOf(addKey(windows, 'viewer.next', 'N'));
    const text = JSON.stringify(toKeymapFile(keymap, { resolved: resolveKeymap(keymap) }));
    const result = readUpload(text, text.length);
    expect(result.ok && resolveKeymap(result.keymap)).toEqual(resolveKeymap(keymap));
  });

  it('refuses a file that is not a keymap or is too large', () => {
    expect(readUpload('{"version":1,"photos":{}}', 30)).toEqual({ ok: false, problems: [{ code: 'not_keymap' }] });
    expect(readUpload('not json', 8)).toEqual({ ok: false, problems: [{ code: 'not_keymap' }] });
    expect(readUpload('{}', 300 * 1024)).toEqual({ ok: false, problems: [{ code: 'too_large' }] });
  });

  it('names the file after the keymap', () => {
    expect(downloadName('My keys')).toBe('My-keys.paloma-keys.json');
    expect(downloadName('///')).toBe('keymap.paloma-keys.json');
  });
});
