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
} as const;
