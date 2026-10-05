import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { DEFAULT_GEOCODER_URL, DEFAULT_TILE_ATTRIBUTION, DEFAULT_TILE_URL, config, geoConfig, pluginsDirOf } from './config.js';

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

describe('pluginsDirOf', () => {
  it('defaults to plugins in the data directory', () => {
    expect(pluginsDirOf({}, '/data/paloma')).toBe(path.join('/data/paloma', 'plugins'));
    expect(pluginsDirOf({ PALOMA_PLUGINS_DIR: ' ' }, '/data/paloma')).toBe(path.join('/data/paloma', 'plugins'));
  });

  it('resolves a relative folder from the working directory', () => {
    expect(pluginsDirOf({ PALOMA_PLUGINS_DIR: 'my-plugins' }, '/data')).toBe(path.resolve(process.cwd(), 'my-plugins'));
  });

  it('keeps an absolute folder', () => {
    expect(pluginsDirOf({ PALOMA_PLUGINS_DIR: '/opt/paloma-plugins' }, '/data')).toBe('/opt/paloma-plugins');
  });
});

describe('bundledPluginsDir', () => {
  it('is the repo plugins folder, whatever the working directory', () => {
    expect(config.bundledPluginsDir).toBe(path.resolve(__dirname, '..', '..', 'plugins'));
  });
});
