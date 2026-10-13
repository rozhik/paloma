import { describe, it, expect, vi } from 'vitest';
import { resolveKeymap } from '../../../shared/keymaps.js';
import { atLeast } from '../levels/levels.js';
import { CONTROL_LEVELS, type ControlId } from '../levels/controls.js';
import { LAYER, pickAction, type PickInput, type Registration } from './dispatcher.js';

const keymap = resolveKeymap({ basedOn: 'windows', bindings: {} });
const at = (level: 'child' | 'easy' | 'normal') => (control: string) => atLeast(level, CONTROL_LEVELS[control as ControlId]);

const viewer = (run = vi.fn()): Registration => ({ section: 'viewer', layer: LAYER.viewer, handlers: { 'viewer.info': run, 'viewer.next': run, 'viewer.close': run } });
const library = (run = vi.fn()): Registration => ({ section: 'library', layer: LAYER.screen, handlers: { 'library.focusNext': run } });

const pick = (input: Partial<PickInput>) => pickAction({
  chord: 'I', typing: false, activates: false, dialog: false, handled: false, rtl: false, registrations: [], keymap, allows: at('normal'), ...input,
});

describe('pickAction', () => {
  it('runs the action bound to the key', () => {
    const run = vi.fn();
    pick({ registrations: [viewer(run)] })?.run();
    expect(run).toHaveBeenCalled();
  });

  it('follows the user\'s keymap', () => {
    const rebound = resolveKeymap({ basedOn: 'windows', bindings: { 'viewer.next': ['N'] } });
    expect(pick({ chord: 'N', keymap: rebound, registrations: [viewer()] })?.id).toBe('viewer.next');
    expect(pick({ chord: 'ArrowRight', keymap: rebound, registrations: [viewer()] })).toBeNull();
  });

  it('leaves letters typed into a field there', () => {
    expect(pick({ typing: true, registrations: [viewer()] })).toBeNull();
  });

  it('offers Esc to the field first', () => {
    expect(pick({ chord: 'Escape', typing: true, handled: true, registrations: [viewer()] })).toBeNull();
    expect(pick({ chord: 'Escape', typing: true, registrations: [viewer()] })?.id).toBe('viewer.close');
  });

  it('lets Enter and Space activate a focused button', () => {
    const slideshow: Registration = { section: 'slideshow', layer: LAYER.slideshow, handlers: { 'slideshow.playPause': vi.fn() } };
    expect(pick({ chord: 'Space', activates: true, registrations: [slideshow] })).toBeNull();
    expect(pick({ chord: 'Space', registrations: [slideshow] })?.id).toBe('slideshow.playPause');
  });

  it('runs nothing hidden below the level', () => {
    expect(pick({ allows: at('child'), registrations: [viewer()] })).toBeNull();
    expect(pick({ allows: at('easy'), registrations: [viewer()] })?.id).toBe('viewer.info');
  });

  it('runs nothing the permissions forbid', () => {
    const star: Registration = { section: 'selection', layer: LAYER.screen, handlers: { 'selection.star': vi.fn() } };
    expect(pick({ chord: 'S', allows: (control) => control !== 'photo.star', registrations: [star] })).toBeNull();
  });

  it('runs a selection action only while it can be done', () => {
    const addToAlbum: Registration = { section: 'selection', layer: LAYER.screen, handlers: { 'selection.addToAlbum': { run: vi.fn(), enabled: () => false } } };
    expect(pick({ chord: 'A', registrations: [addToAlbum] })).toBeNull();
  });

  it('mirrors the arrows in a right-to-left language', () => {
    expect(pick({ chord: 'ArrowLeft', rtl: true, registrations: [viewer()] })?.id).toBe('viewer.next');
  });

  it('takes keys only on the topmost screen', () => {
    const libraryRun = vi.fn();
    expect(pick({ chord: 'ArrowRight', registrations: [library(libraryRun), viewer()] })?.id).toBe('viewer.next');
    expect(pick({ chord: 'ArrowRight', registrations: [library()] })?.id).toBe('library.focusNext');
  });

  it('runs no Viewer key outside the viewer', () => {
    expect(pick({ registrations: [library()] })).toBeNull();
  });

  it('runs only Global actions while a dialog is open', () => {
    const global: Registration = { section: 'global', layer: LAYER.screen, handlers: { 'global.settings': vi.fn() } };
    expect(pick({ dialog: true, registrations: [viewer(), global] })).toBeNull();
    expect(pick({ chord: 'Ctrl+,', dialog: true, registrations: [viewer(), global] })?.id).toBe('global.settings');
  });

  it('runs Global actions over the viewer', () => {
    const global: Registration = { section: 'global', layer: LAYER.screen, handlers: { 'global.settings': vi.fn() } };
    expect(pick({ chord: 'Ctrl+,', registrations: [viewer(), global] })?.id).toBe('global.settings');
  });

  it('stars the selection with S and opens Add to album with A while photos are selected', () => {
    const selection: Registration = { section: 'selection', layer: LAYER.screen, handlers: { 'selection.star': vi.fn(), 'selection.addToAlbum': vi.fn() } };
    expect(pick({ chord: 'S', registrations: [selection, library()] })?.id).toBe('selection.star');
    expect(pick({ chord: 'A', registrations: [selection, library()] })?.id).toBe('selection.addToAlbum');
  });

  it('does not open the map with Alt+3 at Easy', () => {
    const global: Registration = { section: 'global', layer: LAYER.screen, handlers: { 'global.map': vi.fn(), 'global.library': vi.fn() } };
    expect(pick({ chord: 'Alt+3', allows: at('easy'), registrations: [global] })).toBeNull();
    expect(pick({ chord: 'Alt+3', allows: at('normal'), registrations: [global] })?.id).toBe('global.map');
  });
});
