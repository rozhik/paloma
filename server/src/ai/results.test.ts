import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { openTestDatabase } from '../auth/testing.js';
import type { CheckedAnswer } from './answer.js';

let cleanup: () => void;
let results: typeof import('./results.js');
let setHash: (id: number, hash: string) => Promise<void>;

const answer = (part: Partial<CheckedAnswer>): CheckedAnswer => ({ tags: [], objects: [], text: null, inputTokens: null, outputTokens: null, tokens: null, ...part });
const TASKS = [{ id: 'tags', name: null }, { id: 'objects', name: null }, { id: 'description', name: 'Caption' }];

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_ai_results_test_'));
  results = await import('./results.js');
  const { db } = await import('../db/index.js');
  const { folders, photos } = await import('../db/schema.js');
  const [folder] = db.insert(folders).values({ path: '/photos/a', name: 'a', indexedAt: '' }).returning().all();
  for (const filename of ['a.jpg', 'b.jpg']) {
    db.insert(photos).values({
      folderId: folder.id, filename, fileHash: `hash-${filename}`, width: 100, height: 100, fileSize: 1, createdAt: '',
    } as typeof photos.$inferInsert).run();
  }
  setHash = async (id, hash) => { db.update(photos).set({ fileHash: hash }).where(eq(photos.id, id)).run(); };
});

afterAll(() => cleanup());

const base = { provider: 'openai', model: 'gpt-x', fingerprint: 'f1' };

describe('AI results', () => {
  it('stores and lists the results of a photo in task order', async () => {
    await results.saveResult({ ...base, photoId: 1, taskId: 'description', fileHash: 'hash-a.jpg', output: 'text', answer: answer({ text: 'Two children', inputTokens: 800, outputTokens: 12 }) });
    await results.saveResult({ ...base, photoId: 1, taskId: 'tags', fileHash: 'hash-a.jpg', output: 'tags', answer: answer({ tags: [{ name: 'beach', confidence: 0.8 }] }) });
    await results.saveResult({
      ...base, photoId: 1, taskId: 'objects', fileHash: 'hash-a.jpg', output: 'objects',
      answer: answer({ objects: [{ label: 'dog', rect: { left: 0.1, top: 0.1, right: 0.5, bottom: 0.5 }, confidence: 0.92 }] }),
    });
    const listed = await results.photoResults(1, TASKS);
    expect(listed.map((r) => r.taskId)).toEqual(['tags', 'objects', 'description']);
    expect(listed[0]).toMatchObject({ output: 'tags', provider: 'openai', model: 'gpt-x', tags: [{ name: 'beach', confidence: 0.8 }] });
    expect(listed[1].objects).toEqual([{ label: 'dog', rect: { left: 0.1, top: 0.1, right: 0.5, bottom: 0.5 }, confidence: 0.92 }]);
    expect(listed[2]).toMatchObject({ taskName: 'Caption', text: 'Two children', inputTokens: 800, outputTokens: 12 });
  });

  it('replaces the previous result of the same task', async () => {
    await results.saveResult({
      ...base, photoId: 1, taskId: 'objects', fileHash: 'hash-a.jpg', output: 'objects',
      answer: answer({ objects: [{ label: 'cat', rect: { left: 0.2, top: 0.2, right: 0.4, bottom: 0.4 }, confidence: null }] }),
    });
    const objects = (await results.photoResults(1, TASKS)).find((r) => r.taskId === 'objects')!.objects!;
    expect(objects.map((o) => o.label)).toEqual(['cat']);
  });

  it('knows which photos a task processed with a fingerprint', async () => {
    expect([...await results.processedPhotos('tags', 'f1', [1, 2])]).toEqual([1]);
    expect([...await results.processedPhotos('tags', 'f2', [1, 2])]).toEqual([]);
  });

  it('forgets results for content the photo no longer has', async () => {
    await setHash(1, 'hash-new');
    expect(await results.photoResults(1, TASKS)).toEqual([]);
    expect([...await results.processedPhotos('tags', 'f1', [1])]).toEqual([]);
    await setHash(1, 'hash-a.jpg');
  });

  it('deletes the results of a task', async () => {
    await results.deleteTaskResults('objects');
    expect((await results.photoResults(1, TASKS)).map((r) => r.taskId)).toEqual(['tags', 'description']);
  });

  it('leaves out tasks that do not exist', async () => {
    expect((await results.photoResults(1, [{ id: 'tags', name: null }])).map((r) => r.taskId)).toEqual(['tags']);
  });
});
