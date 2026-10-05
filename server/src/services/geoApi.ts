import { and, count, desc, eq, inArray, isNotNull, max, min, notInArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { edits, geoPlaces, photos } from '../db/schema.js';
import { config } from '../config.js';
import { photoFilters, type PhotoFilterQuery } from './photoFilters.js';
import { apiError } from './apiError.js';
import { libraryImageUrls } from './libraryImages.js';
import { GeocoderError } from './GeocoderService.js';
import { getGeocoder, placeResolver } from './geocoding.js';
import { getCachedSearch, normalizeLang, saveSearch } from './placeCache.js';
import type { ApiError, GeoPlaces, GeoPoint, GeoSearchResult, GeoSettings } from '../../../shared/types.js';

export type GeoResult<T> = { status: 200; body: T } | { status: 400 | 502 | 503; body: ApiError };

const disabled = (): GeoResult<never> =>
  ({ status: 503, body: apiError('geocoder_disabled', 'Geocoding is turned off (PALOMA_GEOCODER_URL is empty)') });

/** `GET /api/geo/settings`: what the map needs from `.env`. */
export function getGeoSettings(): GeoSettings {
  return {
    geocoding: config.geo.geocoderUrl !== null,
    tileUrl: config.geo.tileUrl,
    tileAttribution: config.geo.tileAttribution,
  };
}

/** `GET /api/geo/points`: every geotagged photo of a library selection, without paging, for the map. */
export function listGeoPoints(query: PhotoFilterQuery): GeoPoint[] {
  return db.select({
    id: photos.id, lat: photos.latitude, lon: photos.longitude, fileHash: photos.fileHash, editsJson: edits.editInstructionsJson,
  })
    .from(photos)
    .leftJoin(edits, eq(photos.id, edits.photoId))
    .where(and(photoFilters(query), isNotNull(photos.latitude), isNotNull(photos.longitude)))
    .orderBy(desc(photos.dateTaken), photos.id)
    .all()
    .map(({ id, lat, lon, fileHash, editsJson }) => ({
      id, lat: lat!, lon: lon!, thumbnailUrl: libraryImageUrls({ id, fileHash }, editsJson).thumbnailUrl,
    }));
}

/** `GET /api/geo/search`: addresses and places matching `q`, from the cache or the geocoder. */
export async function searchPlaces(q: unknown, lang: unknown): Promise<GeoResult<GeoSearchResult[]>> {
  const geocoder = getGeocoder();
  if (!geocoder) return disabled();
  if (typeof q !== 'string' || q.trim() === '') {
    return { status: 400, body: apiError('query_required', 'q must be a non-empty search text') };
  }
  const language = normalizeLang(lang);
  const cached = getCachedSearch(language, q);
  if (cached) return { status: 200, body: cached };

  try {
    const results = await geocoder.search(q.trim(), language);
    saveSearch(language, q, results);
    return { status: 200, body: results };
  } catch (err) {
    if (!(err instanceof GeocoderError)) throw err;
    console.error(`Place search for "${q}" failed: ${err.message}`);
    return { status: 502, body: apiError('geocoder_failed', `The geocoder failed: ${err.message}`) };
  }
}

/**
 * `GET /api/geo/places`: the places of the geotagged photos of a library selection, with photo counts and
 * bounds, most photos first, and how many of those photos have no place name yet.
 */
export function listPlaces(query: PhotoFilterQuery & { lang?: unknown }): GeoResult<GeoPlaces> {
  if (!getGeocoder()) return disabled();
  const lang = normalizeLang(query.lang);
  placeResolver.noteLanguage(lang);
  const selection = and(photoFilters(query), isNotNull(photos.latitude), isNotNull(photos.longitude));

  const places = db.select({
    name: geoPlaces.name,
    count: count(),
    south: min(photos.latitude),
    north: max(photos.latitude),
    west: min(photos.longitude),
    east: max(photos.longitude),
  })
    .from(photos)
    .innerJoin(geoPlaces, and(eq(geoPlaces.cell, photos.geoCell), eq(geoPlaces.lang, lang), eq(geoPlaces.status, 'ok')))
    .where(selection)
    .groupBy(geoPlaces.name)
    .orderBy(desc(count()), geoPlaces.name)
    .all()
    .map(({ name, count: photoCount, south, west, north, east }) => ({
      name: name!, count: photoCount, bounds: { south: south!, west: west!, north: north!, east: east! },
    }));

  // Cells the geocoder already answered (with a name or with "no place") are not pending
  const answered = db.select({ cell: geoPlaces.cell })
    .from(geoPlaces)
    .where(and(eq(geoPlaces.lang, lang), inArray(geoPlaces.status, ['ok', 'none'])));
  const [{ pending }] = db.select({ pending: count() })
    .from(photos)
    .where(and(selection, notInArray(photos.geoCell, answered)))
    .all();
  return { status: 200, body: { places, pending } };
}
