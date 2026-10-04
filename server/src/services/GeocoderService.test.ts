import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { GeocoderError, GeocoderService, placeName } from './GeocoderService.js';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const YAREMCHE = {
  display_name: 'Яремче, Надвірнянський район, Івано-Франківська область, Україна',
  address: { town: 'Yaremche', municipality: 'Yaremche Hromada', state: 'Ivano-Frankivsk Oblast', country: 'Ukraine' },
};

let fetchMock: Mock<Parameters<typeof fetch>, Promise<Response>>;
let geocoder: GeocoderService;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn<Parameters<typeof fetch>, Promise<Response>>(async () => json(YAREMCHE));
  geocoder = new GeocoderService({ baseUrl: 'https://geo.example', contact: 'me@example.com', fetch: fetchMock as typeof fetch });
});

afterEach(() => {
  vi.useRealTimers();
});

const requestedUrls = (): URL[] => fetchMock.mock.calls.map(([url]) => new URL(String(url)));

describe('placeName', () => {
  it('joins locality, region and country', () => {
    expect(placeName(YAREMCHE.address)).toBe('Yaremche, Ivano-Frankivsk Oblast, Ukraine');
  });

  it('prefers city over town and village, and skips missing or repeated parts', () => {
    expect(placeName({ city: 'Kyiv', town: 'X', state: 'Kyiv', country: 'Ukraine' })).toBe('Kyiv, Ukraine');
    expect(placeName({ village: 'Kryvorivnia', country: 'Ukraine' })).toBe('Kryvorivnia, Ukraine');
    expect(placeName({ country: 'Ukraine' })).toBe('Ukraine');
    expect(placeName({})).toBeNull();
    expect(placeName(undefined)).toBeNull();
  });
});

describe('GeocoderService', () => {
  it('reverse-geocodes at city level in the requested language with an identifying User-Agent', async () => {
    await expect(geocoder.reverse(48.45, 24.55, 'uk')).resolves.toBe('Yaremche, Ivano-Frankivsk Oblast, Ukraine');

    const [url] = requestedUrls();
    expect(url.origin + url.pathname).toBe('https://geo.example/reverse');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lat: '48.45', lon: '24.55', zoom: '10', addressdetails: '1', format: 'jsonv2', 'accept-language': 'uk',
    });
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)['User-Agent']).toBe('Paloma/1.0 (me@example.com)');
  });

  it('gives null where the geocoder knows no place', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Unable to geocode' }));
    await expect(geocoder.reverse(0.5, -30, 'en')).resolves.toBeNull();
  });

  it('searches and maps results with their bounds', async () => {
    fetchMock.mockResolvedValueOnce(json([
      { display_name: 'Yaremche, Ukraine', lat: '48.4580', lon: '24.5560', boundingbox: ['48.42', '48.49', '24.50', '24.61'] },
      { display_name: 'Broken', lat: 'x', lon: '1' },
    ]));

    await expect(geocoder.search('Yaremche', 'en')).resolves.toEqual([
      { name: 'Yaremche, Ukraine', lat: 48.458, lon: 24.556, bounds: { south: 48.42, west: 24.5, north: 48.49, east: 24.61 } },
    ]);
    expect(Object.fromEntries(requestedUrls()[0].searchParams)).toEqual({ q: 'Yaremche', format: 'jsonv2', limit: '10', 'accept-language': 'en' });
  });

  it('sends at most one request per second', async () => {
    const results = Promise.all([1, 2, 3].map((i) => geocoder.reverse(i, i, 'en')));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await results;
  });

  it('runs a user search before queued background lookups', async () => {
    const lookups = [1, 2, 3].map((i) => geocoder.reverse(i, i, 'en'));
    fetchMock.mockImplementation(async (url) => (String(url).includes('/search') ? json([]) : json(YAREMCHE)));
    const search = geocoder.search('Lviv', 'en');

    await vi.advanceTimersByTimeAsync(1000);
    expect(requestedUrls().map((url) => url.pathname)).toEqual(['/reverse', '/search']);
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.all([...lookups, search]);
  });

  it.each([
    ['an HTTP error', async () => json({}, 503)],
    ['a network error', async () => { throw new TypeError('fetch failed'); }],
    ['invalid JSON', async () => new Response('<html>', { status: 200 })],
  ])('rejects with GeocoderError on %s and keeps serving later requests', async (_name, failure) => {
    fetchMock.mockImplementationOnce(failure);
    const failed = geocoder.reverse(1, 1, 'en');
    await expect(failed).rejects.toBeInstanceOf(GeocoderError);

    const next = geocoder.reverse(2, 2, 'en');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(next).resolves.toBe('Yaremche, Ivano-Frankivsk Oblast, Ukraine');
  });

  it('omits the contact from the User-Agent when none is set', () => {
    expect(new GeocoderService({ baseUrl: 'https://geo.example', contact: null }).userAgent).toBe('Paloma/1.0');
  });
});
