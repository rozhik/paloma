import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchPhotoEdits, fetchPlugins, savePhotoEdits, setPluginEnabled } from './plugins.js';
import { ApiRequestError } from './http.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const mock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('plugins API', () => {
  it('lists plugins in the requested language', async () => {
    const mock = stubFetch(200, [{ id: 'basic-effects' }]);
    expect(await fetchPlugins('pt-BR')).toEqual([{ id: 'basic-effects' }]);
    expect(mock.mock.calls[0][0]).toBe('/api/plugins?lang=pt-BR');
    expect(mock.mock.calls[0][1]?.method).toBe('GET');
  });

  it('switches a plugin with PATCH and an enabled flag', async () => {
    const mock = stubFetch(200, { id: 'film grain', enabled: true });
    await setPluginEnabled('film grain', true, 'uk');
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/plugins/film%20grain?lang=uk');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ enabled: true });
  });

  it('throws the server error of a failed switch', async () => {
    stubFetch(409, { error: 'cannot be used', code: 'plugin_unavailable', params: { id: 'future' } });
    await expect(setPluginEnabled('future', true, 'en')).rejects.toMatchObject({
      status: 409, body: { code: 'plugin_unavailable' },
    });
    await expect(setPluginEnabled('future', true, 'en')).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('saves edits with PUT', async () => {
    const mock = stubFetch(200, { id: 7 });
    await savePhotoEdits(7, [{ filter: 'bw' }]);
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('/api/photos/7/edits');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ edits: [{ filter: 'bw' }] });
  });

  it('saves the history with the edits and reads both back', async () => {
    const put = stubFetch(200, { id: 7 });
    await savePhotoEdits(7, [{ filter: 'sepia' }], { undo: [[]], redo: [] });
    expect(JSON.parse(String(put.mock.calls[0][1]?.body))).toEqual({ edits: [{ filter: 'sepia' }], history: { undo: [[]], redo: [] } });

    const get = stubFetch(200, { edits: [], history: { undo: [], redo: [] } });
    expect(await fetchPhotoEdits(7)).toEqual({ edits: [], history: { undo: [], redo: [] } });
    expect(get.mock.calls[0][0]).toBe('/api/photos/7/edits');
  });
});
