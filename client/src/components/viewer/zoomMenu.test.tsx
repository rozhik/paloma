import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { i18n, initI18n } from '../../i18n/index.js';
import { DEFAULT_UI_SETTINGS } from '../../settings/uiSettings.js';
import { barLayout } from './barLayout.js';
import { NavBar, zoomMenuItems } from './NavBar.js';
import { canZoomTo } from './zoomMath.js';

const stage = { width: 1600, height: 900 };

describe('zoom menu', () => {
  beforeAll(async () => {
    await initI18n('en');
  });

  it('offers Fit, Fill, 50%, 100%, 200% and 400%', () => {
    expect(zoomMenuItems('fit', () => true).map((item) => item.value)).toEqual(['fit', 'fill', 0.5, 1, 2, 4]);
  });

  it('disables 50% for a photo fitted at 100%, and offers it for a large photo', () => {
    const disabled = (photo: { width: number; height: number }) =>
      zoomMenuItems('fit', (scale) => canZoomTo(scale, photo, stage)).filter((item) => item.disabled).map((item) => item.value);
    expect(disabled({ width: 1000, height: 750 })).toEqual([0.5]);
    expect(disabled({ width: 4000, height: 3000 })).toEqual([]);
  });

  it('marks the current level', () => {
    expect(zoomMenuItems('fill', () => true).filter((item) => item.checked).map((item) => item.value)).toEqual(['fill']);
    expect(zoomMenuItems(1, () => true).filter((item) => item.checked).map((item) => item.value)).toEqual([1]);
    expect(zoomMenuItems(0.73, () => true).some((item) => item.checked)).toBe(false);
  });

  it('shows the percentage in the navigation bar as the menu button', () => {
    const html = renderToStaticMarkup(
      <NavBar
        placement={barLayout(DEFAULT_UI_SETTINGS).navBar} style={{}} filename="a.jpg" index={0} total={1} scale={0.3}
        canPrev={false} canNext={false} zoomLocked={false} saving={false}
        onClose={() => {}} onPrev={() => {}} onNext={() => {}} onZoomIn={() => {}} onZoomOut={() => {}} onFit={() => {}}
        zoomLevel="fit" canZoomTo={() => true} onZoomTo={() => {}}
      />,
    );
    expect(html).toContain(`aria-label="${i18n.t('viewer.zoomLevel')}: 30%"`);
  });
});
