import type { GeoBounds, GeoSearchResult } from '../../../shared/types.js';

/** The geocoder could not be reached or answered with an error; the lookup can be retried later. */
export class GeocoderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeocoderError';
  }
}

export interface GeocoderOptions {
  /** Base URL of a Nominatim-compatible service, without a trailing slash */
  baseUrl: string;
  /** Contact added to the User-Agent */
  contact: string | null;
  fetch?: typeof fetch;
  /** Minimum time between the starts of two requests */
  minIntervalMs?: number;
  timeoutMs?: number;
}

type Priority = 'user' | 'background';

interface Job {
  url: URL;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

// Parts of a Nominatim address, most specific first; the first one present names the locality
const LOCALITY_KEYS = ['city', 'town', 'village', 'municipality', 'hamlet', 'suburb'] as const;

/** `Locality, Region, Country` from a Nominatim `address`, skipping missing and repeated parts; null if none. */
export function placeName(address: Record<string, unknown> | undefined): string | null {
  if (!address) return null;
  const locality = LOCALITY_KEYS.map((key) => address[key]).find((value) => typeof value === 'string');
  const parts: string[] = [];
  for (const part of [locality, address.state, address.country]) {
    if (typeof part === 'string' && part.trim() !== '' && !parts.includes(part)) parts.push(part);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function toBounds(box: unknown, lat: number, lon: number): GeoBounds {
  // Nominatim: [south, north, west, east] as strings
  const [south, north, west, east] = Array.isArray(box) ? box.map(Number) : [];
  return [south, north, west, east].every(Number.isFinite)
    ? { south, west, north, east }
    : { south: lat, west: lon, north: lat, east: lon };
}

/**
 * A client for Nominatim that respects its usage policy: one request at a time, at least `minIntervalMs`
 * between request starts, an identifying User-Agent. User searches go before background lookups.
 */
export class GeocoderService {
  private readonly queues: Record<Priority, Job[]> = { user: [], background: [] };
  private running = false;
  private lastStart = -Infinity;
  private readonly fetch: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  readonly userAgent: string;

  constructor(private readonly options: GeocoderOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.userAgent = options.contact ? `Paloma/1.0 (${options.contact})` : 'Paloma/1.0';
  }

  /** Places matching free text, best first; up to 10. */
  public async search(query: string, lang: string): Promise<GeoSearchResult[]> {
    const url = this.url('/search', { q: query, format: 'jsonv2', limit: '10', 'accept-language': lang });
    const body = await this.enqueue(url, 'user');
    if (!Array.isArray(body)) throw new GeocoderError('Unexpected search response');
    return body.flatMap((item: Record<string, unknown>) => {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof item.display_name !== 'string') return [];
      return [{ name: item.display_name, lat, lon, bounds: toBounds(item.boundingbox, lat, lon) }];
    });
  }

  /** The place name at a point (city level), or null when the geocoder knows no place there. */
  public async reverse(lat: number, lon: number, lang: string): Promise<string | null> {
    const url = this.url('/reverse', {
      lat: String(lat), lon: String(lon), zoom: '10', addressdetails: '1', format: 'jsonv2', 'accept-language': lang,
    });
    const body = await this.enqueue(url, 'background') as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') throw new GeocoderError('Unexpected reverse response');
    if ('error' in body) return null; // "Unable to geocode": open sea and the like
    return placeName(body.address as Record<string, unknown> | undefined);
  }

  private url(pathname: string, params: Record<string, string>): URL {
    const url = new URL(`${this.options.baseUrl}${pathname}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  }

  private enqueue(url: URL, priority: Priority): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queues[priority].push({ url, resolve, reject });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const job = this.queues.user.shift() ?? this.queues.background.shift();
        if (!job) break;
        const wait = this.lastStart + this.minIntervalMs - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        this.lastStart = Date.now();
        try {
          job.resolve(await this.request(job.url));
        } catch (err) {
          job.reject(err);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async request(url: URL): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetch(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new GeocoderError(`Geocoder unreachable: ${(err as Error).message}`);
    }
    if (!response.ok) throw new GeocoderError(`Geocoder responded ${response.status}`);
    try {
      return await response.json();
    } catch {
      throw new GeocoderError('Geocoder sent invalid JSON');
    }
  }
}
