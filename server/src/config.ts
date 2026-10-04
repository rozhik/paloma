import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
];

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

function resolveDir(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function resolveDirList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((dir) => dir.trim())
    .filter(Boolean)
    .map((dir) => resolveDir(dir, dir));
}

export const DEFAULT_GEOCODER_URL = 'https://nominatim.openstreetmap.org';
export const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const DEFAULT_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export interface GeoConfig {
  /** Base URL of a Nominatim-compatible geocoder; null when geocoding is off */
  geocoderUrl: string | null;
  /** Contact (e-mail or URL) sent in the User-Agent, as the Nominatim usage policy asks */
  geocoderContact: string | null;
  tileUrl: string;
  tileAttribution: string;
}

/** Geo settings from the environment: an unset geocoder URL means the public Nominatim, an empty one turns geocoding off. */
export function geoConfig(env: NodeJS.ProcessEnv): GeoConfig {
  const geocoderUrl = env.PALOMA_GEOCODER_URL === undefined ? DEFAULT_GEOCODER_URL : env.PALOMA_GEOCODER_URL.trim();
  return {
    geocoderUrl: geocoderUrl ? geocoderUrl.replace(/\/+$/, '') : null,
    geocoderContact: env.PALOMA_GEOCODER_CONTACT?.trim() || null,
    tileUrl: env.PALOMA_MAP_TILE_URL?.trim() || DEFAULT_TILE_URL,
    tileAttribution: env.PALOMA_MAP_TILE_ATTRIBUTION?.trim() || DEFAULT_TILE_ATTRIBUTION,
  };
}

const dataDir = resolveDir(
  process.env.PALOMA_DATA_DIR,
  path.join(process.cwd(), '.paloma_data'),
);

export const config = {
  port: Number(process.env.PORT) || 3001,
  dataDir,
  cacheDir: resolveDir(process.env.PALOMA_CACHE_DIR, path.join(dataDir, 'cache')),
  photosDirs: resolveDirList(process.env.PALOMA_PHOTOS_DIRS),
  excludeDirs: resolveDirList(process.env.PALOMA_EXCLUDE_DIRS),
  geo: geoConfig(process.env),
} as const;
