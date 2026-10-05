import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Photo } from '../../../../shared/types.js';
import { i18n, initI18n } from '../../i18n/index.js';
import { usePalomaStore, type AppView } from '../../store/usePalomaStore.js';
import { NAV_ITEMS } from '../../shell/navigation.js';
import { SIZE_TOKENS, FONT_TOKENS } from '../tokens.js';
import { SKINS, SKIN_IDS } from './index.js';

const photo = (id: number): Photo => ({
  id, folderId: 1, filename: `p${id}.jpg`, filePath: '', fileHash: '', width: 10, height: 10, fileSize: 1, isStarred: false,
  latitude: 50, longitude: 30, locationSource: 'exif', dateTaken: null, createdAt: '', caption: null, keywords: [],
  isHidden: false, albums: [], thumbnailUrl: `/t/${id}`,
});

/** Accessible names in markup: aria-labels, titles and text between tags. */
function names(html: string): Set<string> {
  const found = new Set<string>();
  for (const m of html.matchAll(/(?:aria-label|title)="([^"]*)"/g)) found.add(m[1]);
  for (const m of html.matchAll(/>([^<]+)</g)) found.add(m[1].trim());
  return found;
}

/** Sets store state for a server render: zustand renders its initial state there, so that is changed too. */
function setStore(patch: Partial<ReturnType<typeof usePalomaStore.getState>>) {
  usePalomaStore.setState(patch);
  Object.assign(usePalomaStore.getInitialState(), patch);
}

const decode = (text: string) => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

beforeAll(async () => {
  await initI18n('en');
});

describe.each(SKIN_IDS)('%s skin', (id) => {
  const skin = SKINS[id];

  it('sets every size and font token', () => {
    expect(Object.keys(skin.sizes).sort()).toEqual([...SIZE_TOKENS].sort());
    expect(Object.keys(skin.fonts).sort()).toEqual([...FONT_TOKENS].sort());
  });

  it('declares sizes that agree with its tokens', () => {
    expect(skin.sizes['viewer-bar-size']).toBe(`${skin.viewerBarSize}px`);
    expect(skin.sizes['thumb-size']).toBe(`${skin.grid.columnWidth}px`);
  });

  it.each<AppView>(['library', 'map', 'plugins', 'settings'])('offers every view, tray action and sidebar list in %s', async (view) => {
    const { AppShell } = await skin.load();
    // One geotagged photo selected in an album: every tray action applies
    setStore({ currentView: view, selectedPhotos: [photo(1)], selectedAlbumToken: 'abc' });
    const markup = decode(renderToStaticMarkup(
      <AppShell view={view} tray={{ onOpenExport: () => {}, onOpenPrint: () => {}, onOpenMovie: () => {} }}>
        <p>content</p>
      </AppShell>,
    ));
    const found = names(markup);

    expect(markup).toContain('content');
    // Views without the navigation bar have their own way back; the map in Classic is one
    if (view !== 'map' || id !== 'classic') {
      for (const item of NAV_ITEMS) expect(found, item.view).toContain(i18n.t(item.labelKey));
    }
    for (const key of ['addToAlbum', 'removeFromAlbum', 'makeCover', 'clear', 'export', 'print', 'collage', 'movie'] as const) {
      expect(found, key).toContain(i18n.t(`tray.${key}`));
    }
    expect(found).toContain(i18n.t('geo.removeLocation'));
    if (view === 'library' && id === 'glass') {
      // The lists are in a floating panel, opened from the toolbar
      expect(markup).toMatch(new RegExp(`aria-label="${i18n.t('sidebar.open')}"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-label="${i18n.t('sidebar.open')}"`));
    } else if (view === 'library') {
      for (const title of ['sidebar.collections', 'sidebar.albums', 'sidebar.folders'] as const) {
        expect(markup).toMatch(new RegExp(`aria-expanded="(true|false)"[^>]*>(?:(?!</button>).)*${i18n.t(title)}`, 's'));
      }
    }
  });
});
