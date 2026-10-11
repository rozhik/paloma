import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Request and scan code never blocks the event loop on the database or the disk: queries go through
 * db/query.ts and files through fs/promises. Only startup code and test helpers may call `*Sync`.
 */
const SRC = path.resolve(__dirname, '..');

/** Files allowed to call `fs.*Sync`: they run before the server listens, or only in tests. */
const SYNC_FS_ALLOWED = new Set(['config.ts', 'plugins/testing.ts', 'auth/testing.ts', 'services/embeddedText.fixtures.ts', 'model/testLibrary.ts']);

/** Lines that use a zero-argument `.run()` / `.all()` / `.get()` of something other than a query say so. */
const NOT_A_QUERY = '// ffmpeg, not a query';

const RULES: Array<{ name: string; pattern: RegExp; applies: (file: string) => boolean }> = [
  {
    name: 'synchronous query terminator (use all/get/run from db/query.ts)',
    pattern: /\.(all|get|run)\(\)/,
    applies: (file) => !file.startsWith('db/'),
  },
  {
    name: 'synchronous transaction (use withTransaction from db/query.ts)',
    pattern: /\bdb\.transaction\(/,
    applies: (file) => !file.startsWith('db/'),
  },
  {
    name: 'synchronous file call (use fs/promises)',
    pattern: /\b(?:fs\.)?(?:access|appendFile|copyFile|exists|lstat|mkdir|mkdtemp|open|read|readdir|readFile|realpath|rename|rm|rmdir|stat|unlink|writeFile)Sync\(/,
    applies: (file) => !SYNC_FS_ALLOWED.has(file),
  },
];

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

/** Offending lines of a file's text, as `file:line: rule`. */
function violations(file: string, text: string): string[] {
  const found: string[] = [];
  text.split('\n').forEach((line, index) => {
    if (line.includes(NOT_A_QUERY)) return;
    for (const rule of RULES) {
      if (rule.applies(file) && rule.pattern.test(line)) found.push(`${file}:${index + 1}: ${rule.name}`);
    }
  });
  return found;
}

describe('server code does not block the event loop', () => {
  it('has no synchronous queries, transactions or file calls outside db/, startup code and test helpers', () => {
    const found = sources(SRC).flatMap((full) => {
      const file = path.relative(SRC, full).split(path.sep).join('/');
      return violations(file, fs.readFileSync(full, 'utf-8'));
    });
    expect(found).toEqual([]);
  });

  it('catches a synchronous read added to a service', () => {
    expect(violations('services/example.ts', "const text = fs.readFileSync(file, 'utf-8');")).toHaveLength(1);
    expect(violations('services/example.ts', 'const rows = db.select().from(photos).all();')).toHaveLength(1);
    expect(violations('services/example.ts', 'db.transaction((tx) => {});')).toHaveLength(1);
    expect(violations('config.ts', 'fs.existsSync(candidate)')).toEqual([]);
    expect(violations('services/example.ts', 'const rows = await all(db.select().from(photos));')).toEqual([]);
  });
});
