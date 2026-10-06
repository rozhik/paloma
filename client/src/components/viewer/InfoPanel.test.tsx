import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Photo, PhotoInfo } from '../../../../shared/types.js';
import { i18n, initI18n } from '../../i18n/index.js';
import { DEFAULT_UI_SETTINGS, useUiSettings, type UiSettings } from '../../settings/uiSettings.js';
import { InfoContent } from './InfoPanel.js';
import { NavBar } from './NavBar.js';
import { barLayout } from './barLayout.js';
import { coordinatesText, fileSizeText } from './infoFormat.js';

/** Sets UI settings for a server render: zustand renders its initial state there, so that is changed too. */
function setSettings(patch: Partial<UiSettings>) {
  useUiSettings.setState(patch);
  Object.assign(useUiSettings.getInitialState(), patch);
}

beforeAll(async () => {
  await initI18n('en');
});

afterEach(() => setSettings({ level: DEFAULT_UI_SETTINGS.level }));

const photo = {
  id: 7, filename: 'IMG_0042.JPG', filePath: '/photos/trip/IMG_0042.JPG', fileHash: 'h', folderId: 1, width: 4000, height: 3000,
  fileSize: 3524812, isStarred: true, isHidden: false, latitude: 48.160833, longitude: 24.500278, locationSource: 'exif',
  dateTaken: null, createdAt: '', caption: 'Old bridge', keywords: ['old', 'river'], albums: ['c9ea'],
  edits: [{ filter: 'crop64' }, { filter: 'sepia' }],
} as unknown as Photo;

const info: PhotoInfo = {
  photo,
  file: { path: '/photos/trip/IMG_0042.JPG', size: 3524812, modifiedAt: null },
  albums: [{ token: 'c9ea', name: 'Birds' }, { token: '7f01', name: 'Trip' }],
  people: [
    { id: 'b8e4117cf1d6615b', name: 'Roy Avery', avatarVersion: 'v1', rects: [] }, { id: '0123456789abcdef', name: null, avatarVersion: null, rects: [] },
  ],
  faces: [{ id: 5, photoId: 7, rect: { left: 0.1, top: 0.2, right: 0.3, bottom: 0.5 } }],
  place: 'Yaremche',
  exif: { Image: { Model: 'Canon EOS 80D', MakerNote: { binary: 4000 } }, Photo: { FNumber: '5.6' } },
  entry: { source: 'paloma', json: { star: true, rotate: 90, modified: '2026-10-01T10:00:00.000Z' } },
};

const render = (level: UiSettings['level'], data: PhotoInfo = info) => {
  setSettings({ level });
  return renderToStaticMarkup(
    <InfoContent
      info={data} knownTags={[]} saving={false} onCaption={() => {}} onKeywords={() => {}}
      onAddPerson={() => {}} onRemovePerson={() => {}} onAssignFace={() => {}}
    />,
  ).replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
};

describe('Info panel content', () => {
  it('shows the file, description, tags, albums, people, location and other facts', () => {
    const markup = render('normal');
    for (const text of [
      'IMG_0042.JPG', '/photos/trip/IMG_0042.JPG', '3.4\u00a0MB', '4,000 × 3,000', 'value="Old bridge"', 'old', 'river', 'Birds', 'Trip',
      'Roy Avery', i18n.t('info.unknownPerson'), '48.160833, 24.500278', i18n.t('info.fromCamera'), 'Yaremche',
      i18n.t('info.starred'), i18n.t('info.notHidden'), '2 edits',
    ]) expect(markup, text).toContain(text);
  });

  it('shows EXIF from Professional and JSON only at Developer', () => {
    const exif = i18n.t('info.exif');
    const json = i18n.t('info.json');
    expect(render('normal')).not.toContain(`>${exif}<`);
    expect(render('normal')).not.toContain(`>${json}<`);
    const pro = render('pro');
    expect(pro).toContain(`>${exif}<`);
    expect(pro).toContain('Canon EOS 80D');
    expect(pro).toContain(i18n.t('info.binary', { size: '3.9\u00a0KB' }));
    expect(pro).not.toContain(`>${json}<`);
    const developer = render('developer');
    expect(developer).toContain(`>${json}<`);
    expect(developer).toContain('"rotate": 90');
  });

  it('explains Picasa, missing and unreadable entries', () => {
    expect(render('developer', { ...info, entry: { source: 'ini', json: { star: true } } })).toContain(i18n.t('info.jsonIni'));
    expect(render('developer', { ...info, entry: { source: 'none' } })).toContain(i18n.t('info.jsonNone'));
    expect(render('developer', { ...info, entry: { source: 'unreadable' } })).toContain(i18n.t('info.jsonUnreadable').replace(/'/g, '&#x27;'));
  });

  it('says when there are no albums, people, location or EXIF', () => {
    const markup = render('pro', {
      ...info, albums: [], people: [], exif: null, photo: { ...photo, latitude: null, longitude: null, locationSource: null },
    });
    for (const key of ['info.noAlbums', 'info.noPeople', 'info.noLocation', 'info.noExif'] as const) expect(markup).toContain(i18n.t(key));
  });
});

describe('Info panel people', () => {
  const remove = () => i18n.t('info.removePerson', { name: 'Roy Avery' });
  const who = () => i18n.t('info.whoIsThis', { index: 1 });

  it('lists people with avatars but offers no changes at Easy', () => {
    const markup = render('easy');
    expect(markup).toContain('Roy Avery');
    expect(markup).toContain('/api/people/b8e4117cf1d6615b/avatar?v=v1');
    expect(markup).not.toContain(remove());
    expect(markup).not.toContain(i18n.t('info.addPerson'));
    expect(markup).not.toContain(who());
  });

  it('offers adding and removing people and assigning unassigned faces at Normal', () => {
    const markup = render('normal');
    expect(markup).toContain(remove());
    expect(markup).toContain(i18n.t('info.addPerson'));
    expect(markup).toContain(who());
    expect(markup).toContain('/api/photos/7/face?rect=0.100000,0.200000,0.300000,0.500000&amp;size=96');
  });
});

describe('Info button', () => {
  const nav = (onInfo?: () => void, infoOpen = false) => renderToStaticMarkup(
    <NavBar
      placement={barLayout(DEFAULT_UI_SETTINGS).navBar} style={{}} filename="a.jpg" index={0} total={1} scale={1}
      canPrev={false} canNext={false} zoomLocked={false} saving={false}
      onClose={() => {}} onPrev={() => {}} onNext={() => {}} onZoomIn={() => {}} onZoomOut={() => {}} onFit={() => {}}
      onInfo={onInfo} infoOpen={infoOpen}
    />,
  );

  it('is shown pressed while the panel is open', () => {
    expect(nav(() => {}, true)).toMatch(new RegExp(`aria-label="${i18n.t('viewer.info')}"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="${i18n.t('viewer.info')}"`));
  });

  it('is not shown when the level does not offer it', () => {
    expect(nav(undefined)).not.toContain(`aria-label="${i18n.t('viewer.info')}"`);
  });
});

describe('info formatting', () => {
  it('formats sizes in base 1024 and coordinates with 6 decimals', () => {
    expect(fileSizeText(3524812, 'en')).toBe('3.4\u00a0MB');
    expect(fileSizeText(512, 'en')).toBe('512\u00a0B');
    expect(fileSizeText(3524812, 'uk')).toBe('3,4\u00a0MB');
    expect(coordinatesText(48.160833, 24.500278, 'en')).toBe('48.160833, 24.500278');
    expect(coordinatesText(48.160833, 24.500278, 'uk')).toBe('48,160833; 24,500278');
  });
});

describe('Info keys', () => {
  it('closes the frame, then a panel, then the Info panel, and only then the viewer with Esc', async () => {
    const { escapeTarget } = await import('./usePhotoViewer.js');
    expect(escapeTarget({ frame: true, panel: true, info: true })).toBe('frame');
    expect(escapeTarget({ frame: false, panel: true, info: true })).toBe('panel');
    expect(escapeTarget({ frame: false, panel: false, info: true })).toBe('info');
    expect(escapeTarget({ frame: false, panel: false, info: false })).toBe('viewer');
  });

  it('toggles with i, but not while typing, with modifiers or when the level hides Info', async () => {
    const { isInfoKey } = await import('./usePhotoViewer.js');
    const key = { key: 'i', ctrlKey: false, metaKey: false, altKey: false };
    expect(isInfoKey(key, false, true)).toBe(true);
    expect(isInfoKey({ ...key, key: 'I' }, false, true)).toBe(true);
    expect(isInfoKey(key, true, true)).toBe(false);
    expect(isInfoKey({ ...key, metaKey: true }, false, true)).toBe(false);
    expect(isInfoKey(key, false, false)).toBe(false);
  });
});
