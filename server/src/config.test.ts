import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  DEFAULT_GEOCODER_URL, DEFAULT_RATE_LIMIT, DEFAULT_SESSION_DAYS, DEFAULT_TILE_ATTRIBUTION, DEFAULT_TILE_URL, authConfig, config, geoConfig, mcpConfig,
  pluginsDirOf,
} from './config.js';

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

describe('authConfig', () => {
  it('is off with the defaults when nothing is set', () => {
    expect(authConfig({})).toEqual({ mode: 'off', clientOrigin: null, sessionDays: DEFAULT_SESSION_DAYS, rateLimit: DEFAULT_RATE_LIMIT });
  });

  it('takes custom values', () => {
    expect(authConfig({
      PALOMA_AUTH: ' On ', PALOMA_CLIENT_ORIGIN: 'https://photos.example.com/', PALOMA_SESSION_DAYS: '7', PALOMA_RATE_LIMIT: '0',
    })).toEqual({ mode: 'on', clientOrigin: 'https://photos.example.com', sessionDays: 7, rateLimit: 0 });
  });

  it('refuses an invalid PALOMA_AUTH, naming the allowed values', () => {
    expect(() => authConfig({ PALOMA_AUTH: 'yes' })).toThrow(/PALOMA_AUTH must be "off" or "on"/);
  });

  it('refuses invalid numbers', () => {
    expect(() => authConfig({ PALOMA_SESSION_DAYS: '0' })).toThrow(/PALOMA_SESSION_DAYS/);
    expect(() => authConfig({ PALOMA_RATE_LIMIT: '-1' })).toThrow(/PALOMA_RATE_LIMIT/);
    expect(() => authConfig({ PALOMA_RATE_LIMIT: 'many' })).toThrow(/PALOMA_RATE_LIMIT/);
  });
});

describe('mcpConfig', () => {
  it('is on when PALOMA_MCP is not set', () => {
    expect(mcpConfig({})).toEqual({ enabled: true, uriValidSec: 300 });
  });

  it('is off with PALOMA_MCP=off', () => {
    expect(mcpConfig({ PALOMA_MCP: ' Off ' })).toEqual({ enabled: false, uriValidSec: 300 });
  });

  it('refuses another value, naming PALOMA_MCP and the allowed values', () => {
    expect(() => mcpConfig({ PALOMA_MCP: 'yes' })).toThrow(/PALOMA_MCP must be "on" or "off"/);
  });

  it('takes the lifetime of temporary image URLs from PALOMA_MCP_URI_VALID_SEC', () => {
    expect(mcpConfig({ PALOMA_MCP_URI_VALID_SEC: '' }).uriValidSec).toBe(300);
    expect(mcpConfig({ PALOMA_MCP_URI_VALID_SEC: '10' }).uriValidSec).toBe(10);
    expect(mcpConfig({ PALOMA_MCP_URI_VALID_SEC: ' 3600 ' }).uriValidSec).toBe(3600);
  });

  it('refuses a lifetime that is not a whole number from 10 to 3600, naming PALOMA_MCP_URI_VALID_SEC', () => {
    for (const value of ['0', '9', '3601', 'abc', '1.5', '-5']) {
      expect(() => mcpConfig({ PALOMA_MCP_URI_VALID_SEC: value })).toThrow(/PALOMA_MCP_URI_VALID_SEC must be a whole number of seconds from 10 to 3600/);
    }
  });
});
