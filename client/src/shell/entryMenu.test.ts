import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Photo } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useAiRun } from '../ai/useAiRun.js';
import { entryMenuItemIds, mapEntry, playEntry, runEntryTask } from './entryMenu.js';

const album = { kind: 'album', token: 'trip' } as const;
const photo = (id: number) => ({ id, filename: `${id}.jpg` }) as Photo;

beforeEach(() => {
  // No full screen outside a browser
  vi.stubGlobal('document', {});
  usePalomaStore.setState({ currentView: 'library', slideshow: null, selectedPhotos: [] });
  usePalomaStore.getState().setSelectedFolderId(7);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('entryMenuItemIds', () => {
  it('offers Child only the slideshow, Easy also Information, and Normal everything', () => {
    expect(entryMenuItemIds(album, 'child')).toEqual(['slideshow']);
    expect(entryMenuItemIds(album, 'easy')).toEqual(['slideshow', 'info']);
    expect(entryMenuItemIds(album, 'normal')).toEqual(['slideshow', 'findFaces', 'ai', 'map', 'info', 'properties', 'delete']);
  });

  it('offers album management only for albums', () => {
    expect(entryMenuItemIds({ kind: 'folder', id: 1 }, 'developer')).toEqual(['slideshow', 'findFaces', 'ai', 'map', 'info']);
  });
});

describe('playEntry', () => {
  it("plays the entry's photos and keeps what the library shows", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([photo(1), photo(2)]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await playEntry(album);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toMatch(/^\/api\/photos\?album=trip&lang=/);
    expect(usePalomaStore.getState().slideshow?.photos.map((p) => p.id)).toEqual([1, 2]);
    expect(usePalomaStore.getState()).toMatchObject({ selectedFolderId: 7, selectedAlbumToken: null, currentView: 'library' });
  });

  it('plays nothing for an entry without photos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    await playEntry(album);
    expect(usePalomaStore.getState().slideshow).toBeNull();
  });
});

describe('runEntryTask', () => {
  it("runs the task on the entry's photos and keeps what the library shows", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'POST'
      ? new Response(JSON.stringify({ id: 'r', kind: 'ai', aiTaskId: 'tags', state: 'waiting', total: 2, done: 0 }), { status: 202 })
      : url === '/api/tasks' ? new Response(JSON.stringify({ tasks: [] }), { status: 200 })
      : new Response(JSON.stringify([photo(1), photo(2)]), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    useAiRun.setState({ error: null });
    await runEntryTask(album, 'tags', true);
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toMatch(/^\/api\/ai\/runs\?lang=/);
    expect(JSON.parse(init.body as string)).toEqual({ taskId: 'tags', photoIds: [1, 2], again: true });
    // The queue is shown at once with the new run
    expect((fetchMock.mock.calls[2] as unknown as [string])[0]).toBe('/api/tasks');
    expect(useAiRun.getState().error).toBeNull();
    expect(usePalomaStore.getState()).toMatchObject({ selectedFolderId: 7, selectedAlbumToken: null, currentView: 'library' });
  });

  it('keeps the refusal of the server to show it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'POST'
      ? new Response(JSON.stringify({ error: 'not ready', code: 'ai_task_not_ready' }), { status: 400 })
      : new Response(JSON.stringify([photo(1)]), { status: 200 }))));
    await runEntryTask(album, 'tags', false);
    expect(useAiRun.getState().error).toMatchObject({ status: 400 });
  });
});

describe('mapEntry', () => {
  it('opens the entry and the map', () => {
    mapEntry(album);
    expect(usePalomaStore.getState()).toMatchObject({ currentView: 'map', selectedAlbumToken: 'trip', selectedFolderId: null });
  });
});
