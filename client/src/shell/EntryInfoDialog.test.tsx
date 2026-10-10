import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PhotoStats } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { formatters } from '../i18n/format.js';
import { EntryStats } from './EntryInfoDialog.js';

const MB = 1024 * 1024;
const stats = (patch: Partial<PhotoStats> = {}): PhotoStats => ({
  photoCount: 3, totalSize: 6 * MB, takenFrom: '2024-05-01T10:00:00.000Z', takenTo: '2024-05-09T10:00:00.000Z', undatedCount: 0,
  starredCount: 1, geotaggedCount: 0, modifiedCount: 2, folders: [], albums: [], people: [], ...patch,
});

const decode = (text: string) => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

beforeAll(async () => {
  await initI18n('en');
});

describe('EntryStats', () => {
  it('shows the totals in the active language', () => {
    const markup = decode(renderToStaticMarkup(<EntryStats entry={{ kind: 'album', token: 'trip' }} stats={stats()} />));
    expect(markup).toContain('6 MB');
    expect(markup).toContain(formatters('en').formatDayRange('2024-05-01', '2024-05-09'));
    for (const key of ['photos', 'size', 'taken', 'starred', 'geotagged', 'modified'] as const) expect(markup, key).toContain(i18n.t(`entryInfo.${key}`));
    // Without undated photos the line is left out
    expect(markup).not.toContain(i18n.t('entryInfo.undated'));
  });

  it('lists related folders, albums and people as links, most photos first as given', () => {
    const markup = renderToStaticMarkup(<EntryStats
      entry={{ kind: 'tag', name: 'river' }}
      stats={stats({
        folders: [{ id: 1, name: '2023', path: '/p/2023', photoCount: 4 }, { id: 2, name: '2024', path: '/p/2024', photoCount: 1 }],
        albums: [{ token: 't', name: null, photoCount: 2 }],
        people: [{ id: 'aaaaaaaaaaaaaaaa', name: 'Ann', photoCount: 1 }],
      })}
    />);
    expect(markup.indexOf('>2023<')).toBeLessThan(markup.indexOf('>2024<'));
    expect(markup.match(/<button/g)?.length).toBe(4);
    expect(markup).toContain(i18n.t('common.untitled'));
    for (const key of ['folders', 'albums', 'people'] as const) expect(markup, key).toContain(i18n.t(`entryInfo.${key}`));
  });

  it("leaves out empty lists and the entry's own kind when it holds only the entry", () => {
    const markup = renderToStaticMarkup(<EntryStats
      entry={{ kind: 'folder', id: 2 }}
      stats={stats({ folders: [{ id: 2, name: '2024', path: '/p/2024', photoCount: 3 }] })}
    />);
    for (const key of ['folders', 'albums', 'people'] as const) expect(markup, key).not.toContain(i18n.t(`entryInfo.${key}`));
  });
});
