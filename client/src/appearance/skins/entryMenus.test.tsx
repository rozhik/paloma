import { describe, it, expect, beforeAll, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Album } from '../../../../shared/types.js';
import { i18n, initI18n } from '../../i18n/index.js';
import { usePalomaStore } from '../../store/usePalomaStore.js';
import { ClassicSidebar } from './classic/ClassicSidebar.js';
import { CompactSidebar } from './compact/components.js';
import { GlassSidebar } from './glass/components.js';

const album: Album = {
  token: 'trip', name: 'Trip', date: null, description: null, location: null, photoCount: 5, coverPhotoId: null, coverThumbnailUrl: null,
};

// The sidebar's data as fetched after the first render, given at once
vi.mock('../../shell/useFolderTree.js', () => ({ useFolderTree: () => ({ folders: [], albums: [album] }) }));
vi.mock('../../people/usePeople.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../people/usePeople.js')>()),
  usePeople: () => ({ people: [], reload: () => {} }),
  useUnrecognizedCount: () => 4,
}));

const decode = (text: string) => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

beforeAll(async () => {
  await initI18n('en');
});

describe.each([
  ['classic', () => <ClassicSidebar />],
  ['compact', () => <CompactSidebar />],
  ['glass', () => <GlassSidebar onClose={() => {}} />],
] as const)('%s sidebar', (_id, render) => {
  it('gives the album entry a menu button named after it, closed', () => {
    const markup = decode(renderToStaticMarkup(render()));
    const menuLabel = i18n.t('entryMenu.open', { name: 'Trip' });
    expect(markup).toContain(`aria-label="${menuLabel}"`);
    expect(markup).toMatch(new RegExp(`aria-expanded="false"[^>]*aria-label="${menuLabel}"|aria-label="${menuLabel}"[^>]*aria-expanded="false"`));
    // The menu is drawn only while open
    expect(markup).not.toContain('entry-menu-items');
  });

  it('gives Unrecognized no menu button', () => {
    const markup = decode(renderToStaticMarkup(render()));
    expect(markup).toContain(i18n.t('people.unrecognized'));
    expect(markup).not.toContain(`aria-label="${i18n.t('entryMenu.open', { name: i18n.t('people.unrecognized') })}"`);
  });

  it('does not change the selection by rendering the menus', () => {
    usePalomaStore.getState().setSelectedFolderId(7);
    renderToStaticMarkup(render());
    expect(usePalomaStore.getState()).toMatchObject({ selectedFolderId: 7, selectedAlbumToken: null });
  });
});
