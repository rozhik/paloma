import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Photo } from '../../../shared/types.js';
import { libraryQueryParams } from '../api/library.js';
import { currentLanguage } from '../i18n/index.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

/** The photos of the current folder, album, filter and search, and starring; the same for every skin. */
export function useLibraryPhotos(): { photos: Photo[]; toggleStar: (photoId: number, currentStarred: boolean) => void } {
  const { selectedFolderId, selectedFilter, selectedAlbumToken, searchQuery, libraryVersion } = usePalomaStore();
  const { i18n } = useTranslation();
  const [photos, setPhotos] = useState<Photo[]>([]);

  const fetchPhotos = useCallback(async () => {
    try {
      const params = libraryQueryParams(
        { selectedFolderId, selectedAlbumToken, selectedFilter, searchQuery }, currentLanguage(),
      );
      const res = await fetch(`/api/photos?${params.toString()}`);
      if (res.ok) setPhotos(await res.json());
    } catch (err) {
      console.error('Failed to fetch photos:', err);
    }
  }, [selectedFolderId, selectedFilter, selectedAlbumToken, searchQuery]);

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
