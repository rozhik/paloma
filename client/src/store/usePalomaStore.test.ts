import { describe, it, expect, beforeEach } from 'vitest';
import type { Photo } from '../../../shared/types.js';
import { usePalomaStore } from './usePalomaStore.js';

const photo = (id: number, filename = `p${id}.jpg`) => ({ id, filename, previewUrl: `/p/${id}` }) as Photo;
const photos = [photo(1), photo(2), photo(3)];
const state = () => usePalomaStore.getState();

beforeEach(() => {
  usePalomaStore.setState({ viewer: null, libraryVersion: 0, currentView: 'library' });
});

describe('photo viewer state', () => {
  it('opens on a photo of the grid list and keeps the current view underneath', () => {
    state().openViewer(photos, 1);
    expect(state().viewer).toEqual({ photos, index: 1, saved: false });
    expect(state().currentView).toBe('library');
  });

  it('ignores an empty list and clamps the index', () => {
    state().openViewer([], 0);
    expect(state().viewer).toBeNull();
    state().openViewer(photos, 9);
    expect(state().viewer?.index).toBe(2);
  });

  it('moves to the previous and next photo without wrapping', () => {
    state().openViewer(photos, 1);
    state().moveViewer(1);
    expect(state().viewer?.index).toBe(2);
    state().moveViewer(1);
    expect(state().viewer?.index).toBe(2);
    state().moveViewer(-1);
    state().moveViewer(-1);
    state().moveViewer(-1);
    expect(state().viewer?.index).toBe(0);
  });

  it('replaces a saved photo in the list', () => {
    state().openViewer(photos, 0);
    const fresh = { ...photo(2), previewUrl: '/p/2?r=abc' };
    state().replaceViewerPhoto(fresh);
    expect(state().viewer?.photos[1]).toBe(fresh);
    expect(state().viewer?.saved).toBe(true);
  });

  it('refreshes the grid on close only after a save', () => {
    state().openViewer(photos, 0);
    state().closeViewer();
    expect(state().viewer).toBeNull();
    expect(state().libraryVersion).toBe(0);

    state().openViewer(photos, 0);
    state().replaceViewerPhoto(photo(1));
    state().closeViewer();
    expect(state().viewer).toBeNull();
    expect(state().libraryVersion).toBe(1);
  });
});

describe('tag selection', () => {
  beforeEach(() => {
    usePalomaStore.setState({ selectedFolderId: null, selectedAlbumToken: null, selectedTag: null, selectedFilter: 'all' });
  });

  it('replaces a chosen album, folder or collection', () => {
    state().setSelectedAlbum('c9ea');
    state().setSelectedTag('dawn');
    expect(state()).toMatchObject({ selectedTag: 'dawn', selectedAlbumToken: null, selectedFolderId: null, selectedFilter: 'all' });
  });

  it('is cleared by choosing a folder, an album, a collection or the Child level', () => {
    for (const choose of [
      () => state().setSelectedFolderId(3),
      () => state().setSelectedAlbum('c9ea'),
      () => state().setSelectedFilter('starred'),
      () => state().enterChildMode(),
    ]) {
      state().setSelectedTag('dawn');
      choose();
      expect(state().selectedTag).toBeNull();
    }
  });
});

describe('person selection', () => {
  beforeEach(() => {
    usePalomaStore.setState({ selectedFolderId: null, selectedAlbumToken: null, selectedTag: null, selectedPerson: null, selectedFilter: 'all', personMode: 'photos' });
  });

  it('replaces a chosen tag, album, folder or collection and starts on the photos', () => {
    state().setSelectedTag('dawn');
    state().setPersonMode('similar');
    state().setSelectedPerson('b8e4117cf1d6615b');
    expect(state()).toMatchObject({
      selectedPerson: 'b8e4117cf1d6615b', personMode: 'photos', selectedTag: null, selectedAlbumToken: null, selectedFolderId: null, selectedFilter: 'all',
    });
  });

  it('is cleared by choosing another source or the Child level', () => {
    for (const choose of [
      () => state().setSelectedFolderId(3),
      () => state().setSelectedAlbum('c9ea'),
      () => state().setSelectedTag('dawn'),
      () => state().setSelectedFilter('starred'),
      () => state().enterChildMode(),
    ]) {
      state().setSelectedPerson('b8e4117cf1d6615b');
      state().setPersonMode('similar');
      choose();
      expect(state()).toMatchObject({ selectedPerson: null, personMode: 'photos' });
    }
  });
});

describe('unrecognized faces', () => {
  beforeEach(() => {
    usePalomaStore.setState({ selectedFolderId: null, selectedAlbumToken: null, selectedTag: null, selectedPerson: null, selectedUnrecognized: false });
  });

  it('replace a chosen person, tag, album or folder', () => {
    state().setSelectedPerson('b8e4117cf1d6615b');
    state().showUnrecognized();
    expect(state()).toMatchObject({ selectedUnrecognized: true, selectedPerson: null, selectedTag: null, selectedFolderId: null });
  });

  it('are left by choosing another source or the Child level', () => {
    for (const choose of [
      () => state().setSelectedFolderId(3),
      () => state().setSelectedPerson('b8e4117cf1d6615b'),
      () => state().setSelectedTag('dawn'),
      () => state().enterChildMode(),
    ]) {
      state().showUnrecognized();
      choose();
      expect(state().selectedUnrecognized).toBe(false);
    }
  });
});
