import { config } from '../config.js';
import { GeocoderService } from './GeocoderService.js';
import { PlaceResolver } from './PlaceResolver.js';

let geocoder: GeocoderService | null | undefined;

/** The configured geocoder, or null when geocoding is turned off in `.env`. */
export function getGeocoder(): GeocoderService | null {
  if (geocoder === undefined) {
    const { geocoderUrl, geocoderContact } = config.geo;
    geocoder = geocoderUrl ? new GeocoderService({ baseUrl: geocoderUrl, contact: geocoderContact }) : null;
  }
  return geocoder;
}

/** Replaces the geocoder; for tests. */
export function setGeocoder(next: GeocoderService | null): void {
  geocoder = next;
}

/** Resolves place names of geotagged photos in the background; started with the server. */
export const placeResolver = new PlaceResolver(getGeocoder);
