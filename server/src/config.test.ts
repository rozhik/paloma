import { describe, it, expect } from 'vitest';
import { DEFAULT_GEOCODER_URL, DEFAULT_TILE_ATTRIBUTION, DEFAULT_TILE_URL, geoConfig } from './config.js';

describe('geoConfig', () => {
  it('uses the public Nominatim and OpenStreetMap tiles when nothing is set', () => {
    expect(geoConfig({})).toEqual({
      geocoderUrl: DEFAULT_GEOCODER_URL,
      geocoderContact: null,
      tileUrl: DEFAULT_TILE_URL,
      tileAttribution: DEFAULT_TILE_ATTRIBUTION,
    });
  });

  it('turns geocoding off for an empty geocoder URL', () => {
    expect(geoConfig({ PALOMA_GEOCODER_URL: '' }).geocoderUrl).toBeNull();
    expect(geoConfig({ PALOMA_GEOCODER_URL: '  ' }).geocoderUrl).toBeNull();
  });

  it('takes custom values and drops a trailing slash from the geocoder URL', () => {
    expect(geoConfig({
      PALOMA_GEOCODER_URL: 'http://localhost:8080/',
      PALOMA_GEOCODER_CONTACT: 'me@example.com',
      PALOMA_MAP_TILE_URL: 'http://tiles.local/{z}/{x}/{y}.png',
      PALOMA_MAP_TILE_ATTRIBUTION: 'Local tiles',
    })).toEqual({
      geocoderUrl: 'http://localhost:8080',
      geocoderContact: 'me@example.com',
      tileUrl: 'http://tiles.local/{z}/{x}/{y}.png',
      tileAttribution: 'Local tiles',
    });
  });
});
