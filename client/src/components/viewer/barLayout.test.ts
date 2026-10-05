import { describe, it, expect } from 'vitest';
import { EDGES, DEFAULT_UI_SETTINGS } from '../../settings/uiSettings.js';
import { barInsets, barLayout, barStyle, type BarPlacement } from './barLayout.js';

/** The rectangle a bar covers in a 1000×800 viewer with 64px bars. */
function rect(p: BarPlacement) {
  const W = 1000, H = 800, S = 64;
  const thick = S, at = p.offset * S;
  if (p.orientation === 'row') {
    const top = p.edge === 'top' ? at : H - at - thick;
    return { left: p.start * S, right: W - p.end * S, top, bottom: top + thick };
  }
  const left = p.edge === 'left' ? at : W - at - thick;
  return { left, right: left + thick, top: p.start * S, bottom: H - p.end * S };
}

const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('barLayout', () => {
  it('puts the navigation bar in a row on top and the edit bar in a column below it on the left by default', () => {
    expect(barLayout(DEFAULT_UI_SETTINGS)).toEqual({
      navBar: { edge: 'top', orientation: 'row', offset: 0, start: 0, end: 0 },
      editBar: { edge: 'left', orientation: 'column', offset: 0, start: 1, end: 0 },
    });
  });

  it('stacks both bars on the right, the navigation bar nearest the edge', () => {
    const layout = barLayout({ navBar: 'right', editBar: 'right' });
    expect(layout.navBar).toMatchObject({ orientation: 'column', offset: 0 });
    expect(layout.editBar).toMatchObject({ orientation: 'column', offset: 1 });
  });

  it('insets a column bar at a corner shared with a row bar', () => {
    expect(barLayout({ navBar: 'left', editBar: 'bottom' }).navBar).toMatchObject({ start: 0, end: 1 });
    expect(barLayout({ navBar: 'bottom', editBar: 'right' }).editBar).toMatchObject({ start: 0, end: 1 });
  });

  it('never overlaps the bars for any pair of edges', () => {
    for (const navBar of EDGES) {
      for (const editBar of EDGES) {
        const layout = barLayout({ navBar, editBar });
        expect(overlaps(rect(layout.navBar), rect(layout.editBar)), `${navBar}/${editBar}`).toBe(false);
      }
    }
  });

  it('uses physical edges, the same whatever the text direction', () => {
    // barLayout has no direction input: a right-to-left UI gets the same physical placement
    const style = barStyle(barLayout({ navBar: 'left', editBar: 'top' }).navBar);
    expect(style).toMatchObject({ left: '0px', top: 'calc(var(--viewer-bar-size) * 1)', bottom: '0px' });
    expect(style).not.toHaveProperty('insetInlineStart');
  });

  it('tells how far the bars reach in from each edge', () => {
    expect(barInsets(barLayout(DEFAULT_UI_SETTINGS), 64)).toEqual({ top: 64, right: 0, bottom: 0, left: 64 });
    expect(barInsets(barLayout({ navBar: 'bottom', editBar: 'bottom' }), 64)).toEqual({ top: 0, right: 0, bottom: 128, left: 0 });
  });
});
