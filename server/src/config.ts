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

/**
 * The repo's `plugins/` folder of bundled plugins: the first ancestor of this module that holds both
 * `plugins/` and `shared/types.ts`, so it is found from the sources (tsx, vitest) and from `dist/`.
 */
function findBundledPluginsDir(start: string): string {
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'plugins')) && fs.existsSync(path.join(dir, 'shared', 'types.ts'))) {
      return path.join(dir, 'plugins');
    }
    if (path.dirname(dir) === dir) return path.resolve(start, '..', '..', 'plugins');
  }
}

/** External plugins folder from the environment, defaulting to `plugins` in the data directory. */
export function pluginsDirOf(env: NodeJS.ProcessEnv, dataDir: string): string {
  return resolveDir(env.PALOMA_PLUGINS_DIR?.trim(), path.join(dataDir, 'plugins'));
}

export const DEFAULT_SESSION_DAYS = 30;
export const DEFAULT_RATE_LIMIT = 600;

export interface AuthConfig {
  /** `off`: single user, no login; `on`: every request needs an authenticated user */
  mode: 'off' | 'on';
  /** Origin allowed to call the API with credentials when auth is on; null for same-origin only */
  clientOrigin: string | null;
  /** A session ends after this many days without use */
  sessionDays: number;
  /** Default API requests per minute per user or token; 0 = unlimited */
  rateLimit: number;
}

function nonNegativeNumber(name: string, value: string | undefined, fallback: number, positive = false): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (positive && parsed === 0)) {
    throw new Error(`${name} must be a ${positive ? 'positive' : 'non-negative'} number, got ${JSON.stringify(value)}`);
  }
  return parsed;
}

/** Auth settings from the environment; throws for a value the server cannot start with. */
export function authConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const mode = (env.PALOMA_AUTH ?? '').trim().toLowerCase() || 'off';
  if (mode !== 'off' && mode !== 'on') {
    throw new Error(`PALOMA_AUTH must be "off" or "on", got ${JSON.stringify(env.PALOMA_AUTH)}`);
  }
  return {
    mode,
    clientOrigin: env.PALOMA_CLIENT_ORIGIN?.trim().replace(/\/+$/, '') || null,
    sessionDays: nonNegativeNumber('PALOMA_SESSION_DAYS', env.PALOMA_SESSION_DAYS, DEFAULT_SESSION_DAYS, true),
    rateLimit: Math.floor(nonNegativeNumber('PALOMA_RATE_LIMIT', env.PALOMA_RATE_LIMIT, DEFAULT_RATE_LIMIT)),
  };
}

/** Where the MCP endpoint is served */
export const MCP_PATH = '/api/mcp';

export interface McpConfig {
  /** Whether `/api/mcp` is offered */
  enabled: boolean;
}

/** MCP settings from the environment: on unless `PALOMA_MCP=off`; throws for any other value. */
export function mcpConfig(env: NodeJS.ProcessEnv): McpConfig {
  const value = (env.PALOMA_MCP ?? '').trim().toLowerCase() || 'on';
  if (value !== 'off' && value !== 'on') {
    throw new Error(`PALOMA_MCP must be "on" or "off", got ${JSON.stringify(env.PALOMA_MCP)}`);
  }
  return { enabled: value === 'on' };
}

const dataDir = resolveDir(
  process.env.PALOMA_DATA_DIR,
  path.join(process.cwd(), '.paloma_data'),
);

export const config = {
  port: Number(process.env.PORT) || 3001,
  dataDir,
  cacheDir: resolveDir(process.env.PALOMA_CACHE_DIR, path.join(dataDir, 'cache')),
  /** The only place exports and movies are written to */
  exportDir: resolveDir(process.env.PALOMA_EXPORT_DIR, path.join(dataDir, 'export')),
  photosDirs: resolveDirList(process.env.PALOMA_PHOTOS_DIRS),
  excludeDirs: resolveDirList(process.env.PALOMA_EXCLUDE_DIRS),
  geo: geoConfig(process.env),
  pluginsDir: pluginsDirOf(process.env, dataDir),
  bundledPluginsDir: findBundledPluginsDir(__dirname),
  auth: authConfig(process.env),
  mcp: mcpConfig(process.env),
} as const;
