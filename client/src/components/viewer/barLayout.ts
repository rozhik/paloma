import type { CSSProperties } from 'react';
import type { Edge, UiSettings } from '../../settings/uiSettings.js';

/** Where one overlay bar sits. Distances are in bar thicknesses (`--viewer-bar-size`). */
export interface BarPlacement {
  edge: Edge;
  /** Buttons in a row along the top or bottom, in a column along the left or right */
  orientation: 'row' | 'column';
  /** Distance from its edge: 1 when the navigation bar takes the edge first */
  offset: number;
  /** Inset at the top end (column) or left end (row), so the bar clears a row bar in that corner */
  start: number;
  /** Inset at the bottom end (column) or right end (row) */
  end: number;
}

export interface ViewerBarLayout {
  navBar: BarPlacement;
  editBar: BarPlacement;
}

const isRow = (edge: Edge) => edge === 'top' || edge === 'bottom';

/**
 * Places both bars along their edges without overlap. On a shared edge the navigation bar is nearest the
 * edge and the edit bar next to it. On adjacent edges the row bar spans the whole edge and the column bar
 * starts after it. Edges are physical screen sides, the same in right-to-left languages.
 */
export function barLayout({ navBar, editBar }: Pick<UiSettings, 'navBar' | 'editBar'>): ViewerBarLayout {
  const place = (edge: Edge, other: Edge, offset: number): BarPlacement => {
    const placement: BarPlacement = { edge, orientation: isRow(edge) ? 'row' : 'column', offset, start: 0, end: 0 };
    if (!isRow(edge) && isRow(other)) {
      if (other === 'top') placement.start = 1;
      else placement.end = 1;
    }
    return placement;
  };
  return {
    navBar: place(navBar, editBar, 0),
    editBar: place(editBar, navBar, navBar === editBar ? 1 : 0),
  };
}

/**
 * Absolute-position style of a bar inside the viewer, using the `--viewer-bar-size` CSS variable: the active
 * skin's bar thickness.
 */
export function barStyle(placement: BarPlacement): CSSProperties {
  const size = (n: number) => (n === 0 ? '0px' : `calc(var(--viewer-bar-size) * ${n})`);
  const { edge, offset, start, end } = placement;
  if (isRow(edge)) {
    return { position: 'absolute', [edge]: size(offset), left: size(start), right: size(end), height: 'var(--viewer-bar-size)' };
  }
  return { position: 'absolute', [edge]: size(offset), top: size(start), bottom: size(end), width: 'var(--viewer-bar-size)' };
}

/**
 * How far the bars reach in from each screen edge, in CSS pixels, for bars `size` pixels thick (the skin's).
 * Used to keep the crop frame's handles out from under the bars.
 */
export function barInsets(layout: ViewerBarLayout, size: number): Record<Edge, number> {
  const insets: Record<Edge, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const bar of [layout.navBar, layout.editBar]) {
    insets[bar.edge] = Math.max(insets[bar.edge], (bar.offset + 1) * size);
  }
  return insets;
}

/** The side of a bar that faces the photo: where its floating panels open. */
export function inwardSide(edge: Edge): Edge {
  return ({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const)[edge];
}

/**
 * Where the Info panel sits: along the right screen edge, inside any bar on that edge and clear of row bars at
 * the top and bottom. Distances are in bar thicknesses, from the top, right and bottom edges.
 */
export function infoPanelInsets(layout: ViewerBarLayout): { top: number; right: number; bottom: number } {
  const insets = { top: 0, right: 0, bottom: 0 };
  for (const bar of [layout.navBar, layout.editBar]) {
    if (bar.edge === 'right') insets.right = Math.max(insets.right, bar.offset + 1);
    if (bar.edge === 'top') insets.top = Math.max(insets.top, bar.offset + 1);
    if (bar.edge === 'bottom') insets.bottom = Math.max(insets.bottom, bar.offset + 1);
  }
  return insets;
}

/** Absolute-position style of the Info panel inside the viewer. */
export function infoPanelStyle(layout: ViewerBarLayout): CSSProperties {
  const size = (n: number) => (n === 0 ? '0px' : `calc(var(--viewer-bar-size) * ${n})`);
  const { top, right, bottom } = infoPanelInsets(layout);
  return { position: 'absolute', top: size(top), right: size(right), bottom: size(bottom) };
}
