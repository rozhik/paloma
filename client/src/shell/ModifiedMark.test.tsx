import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Photo } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { ClassicPhotoCard } from '../appearance/skins/classic/ClassicPhotoCard.js';
import { SquarePhotoCard } from './SquarePhotoCard.js';

const photo = (edits: Photo['edits']): Photo => ({
  id: 1, folderId: 1, filename: 'a.jpg', filePath: '', fileHash: '', width: 10, height: 10, fileSize: 1, isStarred: false,
  latitude: null, longitude: null, locationSource: null, dateTaken: null, createdAt: '', caption: null, keywords: [],
  isHidden: false, albums: [], thumbnailUrl: '/t/1', edits,
});

const cards = {
  classic: (p: Photo) => <ClassicPhotoCard photo={p} onStarToggle={() => {}} onOpen={() => {}} />,
  compact: (p: Photo) => <SquarePhotoCard className="compact-card" iconSize={15} photo={p} onStarToggle={() => {}} onOpen={() => {}} />,
  glass: (p: Photo) => <SquarePhotoCard className="glass-card" iconSize={20} photo={p} onStarToggle={() => {}} onOpen={() => {}} />,
};

beforeAll(async () => {
  await initI18n('en');
});

describe.each(Object.entries(cards))('%s card', (_skin, card) => {
  it('marks a photo with saved edits over its thumbnail, with a name and a tooltip', () => {
    const markup = renderToStaticMarkup(card(photo([{ filter: 'crop64' } as never])));
    const label = i18n.t('photo.edited');
    expect(markup).toMatch(new RegExp(`class="photo-card-thumb"><img[^>]*/><span class="photo-modified-mark" role="img" aria-label="${label}" title="${label}">`));
  });

  it('has no mark without edits', () => {
    expect(renderToStaticMarkup(card(photo(null)))).not.toContain('photo-modified-mark');
    expect(renderToStaticMarkup(card(photo([])))).not.toContain('photo-modified-mark');
  });
});
