import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Photo } from '../../../../shared/types.js';
import { i18n, initI18n } from '../../i18n/index.js';
import { DEFAULT_UI_SETTINGS, useUiSettings, type UiSettings } from '../../settings/uiSettings.js';
import { createPin } from '../../levels/pin.js';
import { LibraryHeader } from '../LibraryHeader.js';

const photos = [{ id: 1 }, { id: 2 }] as Photo[];

/** Sets UI settings for a server render: zustand renders its initial state there, so that is changed too. */
function setSettings(patch: Partial<UiSettings>) {
  useUiSettings.setState(patch);
  Object.assign(useUiSettings.getInitialState(), patch);
}

beforeAll(async () => {
  await initI18n('en');
});

afterEach(() => setSettings({ level: DEFAULT_UI_SETTINGS.level, pin: null }));

describe('Slideshow button', () => {
  it.each(['child', 'easy', 'normal', 'developer'] as const)('is offered at %s with its name', (level) => {
    setSettings({ level, pin: level === 'child' ? createPin('2580') : null });
    expect(renderToStaticMarkup(<LibraryHeader photos={photos} />)).toContain(i18n.t('slideshow.start'));
  });

  it('is not offered for an empty grid', () => {
    expect(renderToStaticMarkup(<LibraryHeader photos={[]} />)).not.toContain(i18n.t('slideshow.start'));
  });
});
