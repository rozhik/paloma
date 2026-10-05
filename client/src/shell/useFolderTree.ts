import { useEffect, useState } from 'react';
import type { Album, Folder } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

/** How often folders and albums are re-read, so photos found by the scanner show up */
const REFRESH_MS = 5000;

/** The library's folders and albums, kept fresh; the same for every skin. */
export function useFolderTree(): { folders: Folder[]; albums: Album[] } {
  const libraryVersion = usePalomaStore((state) => state.libraryVersion);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);

  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        const [foldersRes, albumsRes] = await Promise.all([fetch('/api/folders'), fetch('/api/albums')]);
        if (foldersRes.ok) setFolders(await foldersRes.json());
        if (albumsRes.ok) setAlbums(await albumsRes.json());
      } catch (err) {
        console.error('Failed to fetch folders and albums:', err);
      }
    };
    fetchLibrary();
    const interval = setInterval(fetchLibrary, REFRESH_MS);
    return () => clearInterval(interval);
  }, [libraryVersion]);

  return { folders, albums };
}
