import type { SkinDefinition } from '../types.js';

/** Classic: Paloma's original layout with large, labelled controls. */
export const classic: SkinDefinition = {
  id: 'classic',
  sizes: {
    'font-size': '1.1rem',
    'font-size-small': '0.95rem',
    'font-size-large': '1.5rem',
    'icon-size': '22px',
    'control-padding-y': '0.6rem',
    'control-padding-x': '1.2rem',
    'hit-min': '44px',
    'radius': '8px',
    'radius-large': '12px',
    'gap': '0.5rem',
    'thumb-size': '220px',
    'tray-height': '80px',
    'viewer-bar-size': '64px',
    'sidebar-width': '280px',
  },
  fonts: {
    'font-family': 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    'font-weight-strong': '600',
    'line-height': '1.5',
  },
  defaultColors: {},
  grid: { columnWidth: 220, captionHeight: 46 },
  viewerBarSize: 64,
  load: () => import('./components.js').then((m) => m.components),
};
