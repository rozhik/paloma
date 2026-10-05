import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { localize, readManifest } from './manifest.js';

let dir: string;

const VALID = {
  id: 'film-grain',
  name: { en: 'Film grain', uk: 'Плівкове зерно' },
  description: 'Adds grain',
  version: '1.2.0',
  apiVersion: 1,
  server: 'index.js',
};

function writePlugin(manifest: unknown, files: Record<string, string> = { 'index.js': 'export function activate() { return {}; }' }): void {
  fs.writeFileSync(path.join(dir, 'paloma-plugin.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
}

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_manifest_test_')));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('readManifest', () => {
  it('reads a valid manifest and resolves the module path', () => {
    writePlugin(VALID);
    expect(readManifest(dir)).toEqual({
      kind: 'ok',
      manifest: { ...VALID, server: path.join(dir, 'index.js'), level: 'normal' },
    });
  });

  it('reads a declared level', () => {
    writePlugin({ ...VALID, level: 'pro' });
    expect(readManifest(dir)).toMatchObject({ kind: 'ok', manifest: { level: 'pro' } });
  });

  it('rejects an unknown level, naming the allowed ones', () => {
    writePlugin({ ...VALID, level: 'expert' });
    const read = readManifest(dir);
    expect(read.kind).toBe('invalid');
    if (read.kind === 'invalid') expect(read.reason).toBe('"level" must be one of child, easy, normal, pro, developer');
  });

  it('reports a folder without a manifest as missing', () => {
    expect(readManifest(dir)).toEqual({ kind: 'missing' });
  });

  it('rejects invalid JSON', () => {
    writePlugin('{ "id": ');
    const read = readManifest(dir);
    expect(read.kind).toBe('invalid');
    if (read.kind === 'invalid') expect(read.reason).toMatch(/not valid JSON/);
  });

  it('rejects a manifest without an id, keeping what it could read', () => {
    const { id, ...rest } = VALID;
    writePlugin(rest);
    const read = readManifest(dir);
    expect(read).toMatchObject({ kind: 'invalid', partial: { name: VALID.name, version: '1.2.0' } });
    if (read.kind === 'invalid') expect(read.reason).toMatch(/no "id"/);
  });

  it('rejects an id with capitals or spaces', () => {
    writePlugin({ ...VALID, id: 'Film Grain' });
    expect(readManifest(dir).kind).toBe('invalid');
  });

  it('rejects a localized name without English', () => {
    writePlugin({ ...VALID, name: { uk: 'Зерно' } });
    expect(readManifest(dir).kind).toBe('invalid');
  });

  it('rejects a module path outside the folder', () => {
    writePlugin({ ...VALID, server: '../other/index.js' });
    const read = readManifest(dir);
    expect(read.kind).toBe('invalid');
    if (read.kind === 'invalid') expect(read.reason).toMatch(/outside the plugin folder/);
  });

  it('rejects a symlinked module that points outside the folder', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_manifest_outside_'));
    fs.writeFileSync(path.join(outside, 'evil.js'), 'export {}');
    writePlugin({ ...VALID, server: 'link.js' }, {});
    fs.symlinkSync(path.join(outside, 'evil.js'), path.join(dir, 'link.js'));
    expect(readManifest(dir).kind).toBe('invalid');
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('rejects a missing module file', () => {
    writePlugin({ ...VALID, server: 'missing.js' }, {});
    expect(readManifest(dir).kind).toBe('invalid');
  });

  it('rejects a plugin built for a newer API, naming both versions', () => {
    writePlugin({ ...VALID, apiVersion: 2 });
    const read = readManifest(dir);
    expect(read).toMatchObject({ kind: 'invalid', partial: { id: 'film-grain' } });
    if (read.kind === 'invalid') expect(read.reason).toBe('the plugin needs plugin API 2, while Paloma supports 1');
  });
});

describe('localize', () => {
  const name = { en: 'Film grain', uk: 'Плівкове зерно', 'pt-BR': 'Grão' };

  it('uses the requested language when given', () => {
    expect(localize(name, 'uk')).toBe('Плівкове зерно');
    expect(localize(name, 'pt-BR')).toBe('Grão');
  });

  it('falls back to English', () => {
    expect(localize(name, 'de')).toBe('Film grain');
  });

  it('matches the primary subtag', () => {
    expect(localize({ en: 'Grain', zh: '颗粒' }, 'zh-Hans')).toBe('颗粒');
  });

  it('returns a plain string as is', () => {
    expect(localize('Adds grain', 'uk')).toBe('Adds grain');
  });
});
