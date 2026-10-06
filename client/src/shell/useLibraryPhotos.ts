import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Photo } from '../../../shared/types.js';
import { libraryQueryParams } from '../api/library.js';
import { currentLanguage } from '../i18n/index.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useLevel } from '../levels/controls.js';

/** At Child the library shows only albums: until one is chosen, it shows no photos and asks for one. */
export function useNeedsAlbum(): boolean {
  const level = useLevel();
  const selectedAlbumToken = usePalomaStore((state) => state.selectedAlbumToken);
  return level === 'child' && selectedAlbumToken === null;
}

/** The photos of the current folder, album, filter and search (at Child, of the album), and starring; the same for every skin. */
export function useLibraryPhotos(): { photos: Photo[]; toggleStar: (photoId: number, currentStarred: boolean) => void } {
  const { selectedFolderId, selectedFilter, selectedAlbumToken, selectedTag, selectedPerson, searchQuery, libraryVersion } = usePalomaStore();
  const { i18n } = useTranslation();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const needsAlbum = useNeedsAlbum();

  const fetchPhotos = useCallback(async () => {
    if (needsAlbum) {
      setPhotos([]);
      return;
    }
    try {
      const params = libraryQueryParams(
        { selectedFolderId, selectedAlbumToken, selectedTag, selectedPerson, selectedFilter, searchQuery }, currentLanguage(),
      );
      const res = await fetch(`/api/photos?${params.toString()}`);
      if (res.ok) setPhotos(await res.json());
    } catch (err) {
      console.error('Failed to fetch photos:', err);
    }
  }, [selectedFolderId, selectedFilter, selectedAlbumToken, selectedTag, selectedPerson, searchQuery, needsAlbum]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos, libraryVersion, i18n.language]);

  const toggleStar = useCallback(async (photoId: number, currentStarred: boolean) => {
    try {
      const res = await fetch(`/api/photos/${photoId}/star`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: !currentStarred }),
      });
      if (res.ok) fetchPhotos();
    } catch (err) {
      console.error('Failed to toggle star:', err);
    }
  }, [fetchPhotos]);

  return { photos, toggleStar };
}
