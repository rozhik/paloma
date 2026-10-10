import { describe, it, expect, vi, afterEach } from 'vitest';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { deleteAlbum } from './AlbumDialogs.js';

afterEach(() => { vi.unstubAllGlobals(); });

describe('deleteAlbum', () => {
  it('deletes the album and reloads the library', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const before = usePalomaStore.getState().libraryVersion;
    await deleteAlbum('c9ea');
    expect(fetchMock).toHaveBeenCalledWith('/api/albums/c9ea', expect.objectContaining({ method: 'DELETE' }));
    expect(usePalomaStore.getState().libraryVersion).toBe(before + 1);
  });

  it('fails without reloading when the server refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":"album_not_found"}', { status: 404 })));
    const before = usePalomaStore.getState().libraryVersion;
    await expect(deleteAlbum('gone')).rejects.toThrow();
    expect(usePalomaStore.getState().libraryVersion).toBe(before);
  });
});
