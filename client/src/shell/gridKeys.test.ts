import { describe, it, expect } from 'vitest';
import { resolveKeymap } from '../../../shared/keymaps.js';
import { LAYER, pickAction, type Registration } from '../keys/dispatcher.js';
import { nextCardIndex } from './VirtualGrid.js';

const library: Registration = {
  section: 'library', layer: LAYER.screen,
  handlers: Object.fromEntries(['open', 'toggleSelect', 'focusPrevious', 'focusNext', 'focusUp', 'focusDown'].map((a) => [`library.${a}`, () => {}])),
};
const press = (chord: string, basedOn: 'windows' | 'tvBox' = 'windows') => pickAction({
  chord, typing: false, activates: false, dialog: false, handled: false, rtl: false, allows: () => true,
  registrations: [library], keymap: resolveKeymap({ basedOn, bindings: {} }),
})?.id;

describe('grid keys', () => {
  it('opens the focused card with Enter and selects it with Space', () => {
    expect(press('Enter')).toBe('library.open');
    expect(press('Space')).toBe('library.toggleSelect');
  });

  it('moves between cards with the remote\'s arrows', () => {
    expect(press('ArrowRight', 'tvBox')).toBe('library.focusNext');
    expect(press('ArrowDown', 'tvBox')).toBe('library.focusDown');
  });

  it('moves the focus to the neighbouring card and stays at the ends', () => {
    expect(nextCardIndex(-1, 1, 10)).toBe(0);
    expect(nextCardIndex(3, 1, 10)).toBe(4);
    expect(nextCardIndex(3, 4, 10)).toBe(7);
    expect(nextCardIndex(7, 4, 10)).toBeNull();
    expect(nextCardIndex(0, -1, 10)).toBeNull();
    expect(nextCardIndex(-1, 1, 0)).toBeNull();
  });
});
