import type { Geotag, LocationSource } from '../../../shared/types.js';

export interface EffectiveLocation {
  latitude: number | null;
  longitude: number | null;
  locationSource: LocationSource | null;
  geoCell: string | null;
}

const NONE: EffectiveLocation = { latitude: null, longitude: null, locationSource: null, geoCell: null };

/** Whether a value is a valid geotag object: finite `lat` in [-90, 90] and `lon` in [-180, 180]. */
export function isGeotag(value: unknown): value is Geotag {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { lat, lon } = value as Record<string, unknown>;
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lon === 'number' && Number.isFinite(lon) && Math.abs(lon) <= 180;
}

/** Coordinates rounded to 6 decimal places (about 10 cm), as written to `.paloma.json`. */
export function roundGeotag({ lat, lon }: Geotag): Geotag {
  const round = (value: number): number => Math.round(value * 1e6) / 1e6 + 0; // + 0 turns -0 into 0
  return { lat: round(lat), lon: round(lon) };
}

/** The 0.01° cell a location falls in; photos in one cell share one place name lookup. */
export function geoCell(latitude: number, longitude: number): string {
  return `${Math.round(latitude * 100) + 0}:${Math.round(longitude * 100) + 0}`;
}

/** Centre of a cell from `geoCell`, in decimal degrees. */
export function cellCentre(cell: string): Geotag {
  const [lat, lon] = cell.split(':').map(Number);
  return { lat: lat / 100, lon: lon / 100 };
}

/**
 * A photo's location in the library: the folder files' geotag (from `.paloma.json` or the Picasa .ini),
 * where `null` removes the location; without a geotag, the camera's EXIF GPS.
 */
export function effectiveLocation(
  geotag: Geotag | null | undefined,
  exif: { latitude: number | null; longitude: number | null },
): EffectiveLocation {
  if (geotag === null) return NONE;
  if (geotag) return { latitude: geotag.lat, longitude: geotag.lon, locationSource: 'user', geoCell: geoCell(geotag.lat, geotag.lon) };
  if (exif.latitude === null || exif.longitude === null) return NONE;
  return { latitude: exif.latitude, longitude: exif.longitude, locationSource: 'exif', geoCell: geoCell(exif.latitude, exif.longitude) };
}
