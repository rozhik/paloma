import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import i18next, { type TFunction } from 'i18next';
import en from '../i18n/locales/en.json';
import { ApiRequestError, apiRequest, describeError } from './http.js';

let t: TFunction;

beforeAll(async () => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: 'es',
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      es: { translation: { errors: { album_name_required: 'ES: album name required' } } },
    },
    interpolation: { escapeValue: false },
  });
  t = instance.t;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const respond = (status: number, body: string) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));

describe('describeError', () => {
  it('translates a known code into the active language', () => {
    const err = new ApiRequestError(400, { error: 'name must be a non-empty string', code: 'album_name_required' });
    expect(describeError(err, t)).toBe('ES: album name required');
  });

  it('fills in params and falls back to English for an untranslated code', () => {
    const err = new ApiRequestError(409, {
      error: 'Unreadable /p/b/.paloma.json', code: 'sidecar_unreadable', params: { files: '/p/b/.paloma.json' },
      failedFolders: ['/p/b'],
    });
    expect(describeError(err, t)).toBe('Cannot read /p/b/.paloma.json. Fix or remove the file to make changes there.');
  });

  it('shows the server text for an unknown code', () => {
    const err = new ApiRequestError(500, { error: 'Disk is full', code: 'something_new' as never });
    expect(describeError(err, t)).toBe('Disk is full');
  });

  it('adds the folders that were not changed to the server text', () => {
    const err = new ApiRequestError(500, { error: 'Oops', failedFolders: ['/a', '/b'] });
    expect(describeError(err, t)).toBe('Oops Not changed: /a, /b');
  });

  it('shows a generic failure with the status when there is no body', () => {
    expect(describeError(new ApiRequestError(502, null), t)).toBe('The request failed (502).');
  });

  it('reports a network failure', () => {
    expect(describeError(new TypeError('Failed to fetch'), t)).toBe(en.errors.network);
  });
});

describe('apiRequest', () => {
  it('returns the JSON of a successful response', async () => {
    respond(200, '[1,2]');
    await expect(apiRequest('GET', '/api/x')).resolves.toEqual([1, 2]);
  });

  it('throws the error body of a failed response', async () => {
    respond(404, JSON.stringify({ error: 'Album not found', code: 'album_not_found' }));
    await expect(apiRequest('GET', '/api/x')).rejects.toMatchObject({
      status: 404, body: { error: 'Album not found', code: 'album_not_found' },
    });
  });

  it('throws without a body when the response is not JSON', async () => {
    respond(502, '<html>Bad gateway</html>');
    await expect(apiRequest('GET', '/api/x')).rejects.toMatchObject({ status: 502, body: null });
  });
});
