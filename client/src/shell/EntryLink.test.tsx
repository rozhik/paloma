import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Photo } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { DEFAULT_UI_SETTINGS, useUiSettings, type UiSettings } from '../settings/uiSettings.js';
import { createPin } from '../levels/pin.js';
import { EntryLink, followEntryLink } from './EntryLink.js';

/** Sets UI settings for a server render: zustand renders its initial state there, so that is changed too. */
function setSettings(patch: Partial<UiSettings>) {
  useUiSettings.setState(patch);
  Object.assign(useUiSettings.getInitialState(), patch);
}

const photo = { id: 1, filename: 'a.jpg' } as Photo;

afterEach(() => setSettings({ level: DEFAULT_UI_SETTINGS.level, pin: null }));

describe('EntryLink', () => {
  it('is a button with the entry icon and name', () => {
    const markup = renderToStaticMarkup(<EntryLink entry={{ kind: 'album', token: 'c9ea' }} label="Trip" />);
    expect(markup).toMatch(/^<button type="button"/);
    expect(markup).toContain('lucide-book-image');
    expect(markup).toContain('>Trip</span>');
  });

  it('is plain text when the level does not offer the list', () => {
    setSettings({ level: 'child', pin: createPin('2580') });
    const markup = renderToStaticMarkup(<EntryLink entry={{ kind: 'folder', id: 3 }} label="2024" />);
    expect(markup).toMatch(/^<span/);
    expect(markup).not.toContain('<button');
    expect(markup).toContain('lucide-folder');
    expect(markup).toContain('2024');
  });

  it('shows a placeholder name in italics', () => {
    expect(renderToStaticMarkup(<EntryLink entry={{ kind: 'album', token: 'x' }} label="Untitled" placeholder />)).toContain('fst-italic');
  });
});

describe('followEntryLink', () => {
  it('closes the viewer and opens the entry in the library', () => {
    usePalomaStore.setState({ currentView: 'map', viewer: { photos: [photo], index: 0, saved: false } });
    followEntryLink({ kind: 'album', token: 'c9ea' });
    expect(usePalomaStore.getState()).toMatchObject({ viewer: null, currentView: 'library', selectedAlbumToken: 'c9ea' });
  });
});
