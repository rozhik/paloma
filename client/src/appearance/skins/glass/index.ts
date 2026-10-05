import type { SkinDefinition } from '../types.js';

/**
 * How opaque the glass is, in percent: enough that text on it stays readable over any photo, even pure black or
 * white. Bars carry only normal text and icons; panels (sidebar, menus) also carry muted and accent text.
 */
export const GLASS_BAR_OPACITY = 78;
export const GLASS_PANEL_OPACITY = 90;

/**
 * Fluid Glass: touch-first, with content running edge to edge under floating, translucent toolbars.
 * Its glass colors are mixed from the theme's colors, so it works with every theme.
 */
export const glass: SkinDefinition = {
  id: 'glass',
  sizes: {
    'font-size': '1.0625rem',
    'font-size-small': '0.9rem',
    'font-size-large': '1.4rem',
    'icon-size': '22px',
    'control-padding-y': '0.65rem',
    'control-padding-x': '1.1rem',
    'hit-min': '44px',
    'radius': '14px',
    'radius-large': '26px',
    'gap': '0.6rem',
    'thumb-size': '200px',
    'tray-height': '76px',
    'viewer-bar-size': '64px',
    'sidebar-width': '320px',
  },
  fonts: {
    'font-family': '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif',
    'font-weight-strong': '600',
    'line-height': '1.45',
  },
  defaultColors: {
    // Glass over content: the theme's surface or chrome, partly see-through
    'glass-tint': `color-mix(in srgb, var(--pal-surface) ${GLASS_BAR_OPACITY}%, transparent)`,
    'glass-panel-tint': `color-mix(in srgb, var(--pal-surface) ${GLASS_PANEL_OPACITY}%, transparent)`,
    // A thin bright edge, as light catches the glass
    'glass-highlight': 'color-mix(in srgb, var(--pal-text) 14%, transparent)',
    'glass-shadow': 'color-mix(in srgb, var(--pal-overlay) 45%, transparent)',
  },
  grid: { columnWidth: 200, captionHeight: 0 },
  viewerBarSize: 64,
  load: () => import('./components.js').then((m) => m.components),
};
