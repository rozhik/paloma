import type { GeoPlaces, GeoPoint, GeoSearchResult, GeoSettings, Geotag, Photo } from '../../../shared/types.js';
import { apiRequest } from './http.js';

export const fetchGeoSettings = (): Promise<GeoSettings> => apiRequest<GeoSettings>('GET', '/api/geo/settings');

export const fetchGeoPoints = (params: URLSearchParams): Promise<GeoPoint[]> =>
  apiRequest<GeoPoint[]>('GET', `/api/geo/points?${params}`);

export const fetchPlaces = (params: URLSearchParams): Promise<GeoPlaces> =>
  apiRequest<GeoPlaces>('GET', `/api/geo/places?${params}`);

export const searchAddress = (q: string, lang: string): Promise<GeoSearchResult[]> =>
  apiRequest<GeoSearchResult[]>('GET', `/api/geo/search?${new URLSearchParams({ q, lang })}`);

/** Sets the location of photos, or clears it with `null`. */
export const setPhotosLocation = (photoIds: number[], location: Geotag | null): Promise<Photo[]> =>
  apiRequest<Photo[]>('POST', '/api/photos/location', { photoIds, location });
