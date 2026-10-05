import type { SkinDefinition } from '../types.js';

/** Compact: dense layout for small screens and large libraries. */
export const compact: SkinDefinition = {
  id: 'compact',
  sizes: {
    'font-size': '0.875rem',
    'font-size-small': '0.78rem',
    'font-size-large': '1.15rem',
    'icon-size': '18px',
    'control-padding-y': '0.3rem',
    'control-padding-x': '0.6rem',
    'hit-min': '28px',
    'radius': '4px',
    'radius-large': '6px',
    'gap': '0.25rem',
    'thumb-size': '140px',
    'tray-height': '52px',
    'viewer-bar-size': '44px',
    'sidebar-width': '220px',
  },
  fonts: {
    'font-family': 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    'font-weight-strong': '600',
    'line-height': '1.35',
  },
  defaultColors: {},
  grid: { columnWidth: 140, captionHeight: 0 },
  viewerBarSize: 44,
  load: () => import('./components.js').then((m) => m.components),
};
