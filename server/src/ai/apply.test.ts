import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase } from '../auth/testing.js';
import type { CheckedAnswer } from './answer.js';
import { builtInDefaults } from './tasks.js';

let tmpDir: string;
let cleanup: () => void;
let applyResult: typeof import('./apply.js').applyResult;
let getApiPhoto: typeof import('../services/photoApi.js').getApiPhoto;
const id: Record<string, number> = {};
const dir: Record<string, string> = {};

const answer = (part: Partial<CheckedAnswer>): CheckedAnswer => ({ tags: [], objects: [], text: null, inputTokens: null, outputTokens: null, ...part });
const sidecar = (folder: string) => JSON.parse(fs.readFileSync(path.join(dir[folder], '.paloma.json'), 'utf-8'));
const tags = { ...builtInDefaults('tags'), model: 'm' };
const objects = { ...builtInDefaults('objects'), model: 'm' };
const description = { ...builtInDefaults('description'), model: 'm' };

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_ai_apply_test_'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ applyResult } = await import('./apply.js'));
  ({ getApiPhoto } = await import('../services/photoApi.js'));
  const { db } = await import('../db/index.js');
  const schema = await import('../db/schema.js');
  const { reapplyFolder } = await import('../services/folderChanges.js');

  for (const name of ['paloma', 'picasa', 'locked']) {
    dir[name] = path.join(tmpDir, 'photos', name);
    fs.mkdirSync(dir[name], { recursive: true });
    const folderId = db.insert(schema.folders).values({ path: dir[name], name, indexedAt: '' }).returning().get().id;
    for (const file of name === 'paloma' ? ['a', 'b', 'c'] : ['p']) {
      fs.writeFileSync(path.join(dir[name], `${file}.jpg`), '');
      id[`${name}/${file}`] = db.insert(schema.photos).values({ folderId, filename: `${file}.jpg`, fileHash: `hash-${name}-${file}`, createdAt: '' }).returning().get().id;
    }
  }
  fs.writeFileSync(path.join(dir.paloma, '.paloma.json'), JSON.stringify({
    format: 'paloma-folder', version: 2, photos: { 'a.jpg': { keywords: ['Family'] }, 'b.jpg': { caption: "Grandma's birthday" } },
  }));
  fs.writeFileSync(path.join(dir.picasa, '.picasa.ini'), '[p.jpg]\nstar=yes\n');
  fs.writeFileSync(path.join(dir.locked, '.paloma.json'), JSON.stringify({ format: 'paloma-folder', version: 2, photos: {} }));
  for (const name of ['paloma', 'picasa', 'locked']) await reapplyFolder(dir[name]);
});

afterAll(() => {
  fs.chmodSync(dir.locked, 0o755);
  vi.restoreAllMocks();
  cleanup();
});

describe('applyResult', () => {
  it('adds confident tags, ignoring case duplicates', async () => {
    const applied = await applyResult(id['paloma/a'], tags, answer({
      tags: [{ name: 'family', confidence: 0.9 }, { name: 'beach', confidence: 0.8 }, { name: 'boat', confidence: 0.3 }],
    }));
    expect(applied).toEqual({ tagsAdded: 1, descriptionSet: false, error: null });
    expect((await getApiPhoto(id['paloma/a']))!.keywords).toEqual(['Family', 'beach']);
    expect(sidecar('paloma').photos['a.jpg'].keywords).toEqual(['Family', 'beach']);
  });

  it('adds a tag again that the user removed', async () => {
    const { changePhotosKeywords } = await import('../services/photoApi.js');
    await changePhotosKeywords({ photoIds: [id['paloma/a']], remove: ['beach'] });
    const applied = await applyResult(id['paloma/a'], tags, answer({ tags: [{ name: 'beach', confidence: 0.8 }] }));
    expect(applied.tagsAdded).toBe(1);
    expect((await getApiPhoto(id['paloma/a']))!.keywords).toEqual(['Family', 'beach']);
  });

  it('keeps at most the task maximum', async () => {
    const few = { ...tags, options: { ...tags.options, maxTags: 2 } };
    await applyResult(id['paloma/c'], few, answer({ tags: ['x', 'y', 'z'].map((name) => ({ name, confidence: null })) }));
    expect((await getApiPhoto(id['paloma/c']))!.keywords).toEqual(['x', 'y']);
  });

  it('does not change a description the photo has by default', async () => {
    const applied = await applyResult(id['paloma/b'], description, answer({ text: 'Two children on a sandy beach' }));
    expect(applied).toEqual({ tagsAdded: 0, descriptionSet: false, error: null });
    expect((await getApiPhoto(id['paloma/b']))!.caption).toBe("Grandma's birthday");
  });

  it('fills an empty description, or always when the task says so', async () => {
    expect((await applyResult(id['paloma/c'], description, answer({ text: 'Two children on a sandy beach' }))).descriptionSet).toBe(true);
    expect((await getApiPhoto(id['paloma/c']))!.caption).toBe('Two children on a sandy beach');
    const always = { ...description, options: { ...description.options, textTarget: 'description-always' as const } };
    await applyResult(id['paloma/b'], always, answer({ text: 'A cake with candles' }));
    expect(sidecar('paloma').photos['b.jpg'].caption).toBe('A cake with candles');
    const nowhere = { ...description, options: { ...description.options, textTarget: 'none' as const } };
    expect((await applyResult(id['paloma/b'], nowhere, answer({ text: 'Other' }))).descriptionSet).toBe(false);
  });

  it('writes no folder file for objects, unless their labels become tags', async () => {
    const found = answer({ objects: [{ label: 'dog', rect: { left: 0, top: 0, right: 1, bottom: 1 }, confidence: 0.9 }] });
    expect(await applyResult(id['picasa/p'], objects, found)).toEqual({ tagsAdded: 0, descriptionSet: false, error: null });
    expect(fs.existsSync(path.join(dir.picasa, '.paloma.json'))).toBe(false);
    expect(fs.readFileSync(path.join(dir.picasa, '.picasa.ini'), 'utf-8')).toBe('[p.jpg]\nstar=yes\n');

    const labelling = { ...objects, options: { ...objects.options, labelsAsTags: true } };
    expect((await applyResult(id['picasa/p'], labelling, found)).tagsAdded).toBe(1);
    expect(sidecar('picasa').photos['p.jpg'].keywords).toEqual(['dog']);
  });

  it('reports a folder that cannot be written', async () => {
    fs.chmodSync(dir.locked, 0o555);
    const applied = await applyResult(id['locked/p'], tags, answer({ tags: [{ name: 'beach', confidence: null }] }));
    expect(applied.tagsAdded).toBe(0);
    expect(applied.error).toBeTruthy();
    fs.chmodSync(dir.locked, 0o755);
  });
});
