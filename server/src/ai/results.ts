import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { all, BATCH_SIZE, chunked, get, run, withTransaction } from '../db/query.js';
import { aiObjects, aiResults, photos } from '../db/schema.js';
import type { AiObject, AiOutputKind, AiTag, PhotoAiResult } from '../../../shared/types.js';
import type { CheckedAnswer } from './answer.js';

export interface ResultToSave {
  photoId: number;
  taskId: string;
  fingerprint: string;
  /** The content the provider looked at */
  fileHash: string;
  provider: string;
  model: string;
  output: AiOutputKind;
  answer: CheckedAnswer;
}

/** Saves a task's result on a photo, replacing its previous result and objects of that task. Writes no files. */
export async function saveResult(result: ResultToSave): Promise<void> {
  const { photoId, taskId, answer } = result;
  const stored = result.output === 'tags' ? answer.tags : result.output === 'text' ? answer.text : [];
  const row = {
    fingerprint: result.fingerprint, fileHash: result.fileHash, provider: result.provider, model: result.model, output: result.output,
    result: JSON.stringify(stored), inputTokens: answer.inputTokens, outputTokens: answer.outputTokens, createdAt: new Date().toISOString(),
  };
  await withTransaction(async (tx) => {
    await run(tx.delete(aiObjects).where(and(eq(aiObjects.photoId, photoId), eq(aiObjects.taskId, taskId))));
    for (const object of result.output === 'objects' ? answer.objects : []) {
      await run(tx.insert(aiObjects).values({ photoId, taskId, label: object.label, confidence: object.confidence, rect: JSON.stringify(object.rect) }));
    }
    await run(tx.insert(aiResults).values({ photoId, taskId, ...row })
      .onConflictDoUpdate({ target: [aiResults.photoId, aiResults.taskId], set: row }));
  });
}

/**
 * The results of the listed tasks on a photo's current content, in the order of `tasks`; results of other tasks
 * and for content the photo no longer has are left out.
 */
export async function photoResults(photoId: number, tasks: readonly { id: string; name: string | null }[]): Promise<PhotoAiResult[]> {
  const photo = await get(db.select({ fileHash: photos.fileHash }).from(photos).where(eq(photos.id, photoId)));
  if (!photo) return [];
  const rows = await all(db.select().from(aiResults).where(and(eq(aiResults.photoId, photoId), eq(aiResults.fileHash, photo.fileHash))));
  const objects = await all(db.select().from(aiObjects).where(eq(aiObjects.photoId, photoId)).orderBy(aiObjects.id));
  const results: PhotoAiResult[] = [];
  for (const task of tasks) {
    const row = rows.find((r) => r.taskId === task.id);
    if (!row) continue;
    const result: PhotoAiResult = {
      taskId: task.id, taskName: task.name, output: row.output as AiOutputKind, provider: row.provider, model: row.model,
      createdAt: row.createdAt, inputTokens: row.inputTokens, outputTokens: row.outputTokens,
    };
    if (result.output === 'tags') result.tags = JSON.parse(row.result) as AiTag[];
    else if (result.output === 'text') result.text = JSON.parse(row.result) as string;
    else {
      result.objects = objects.filter((o) => o.taskId === task.id)
        .map((o): AiObject => ({ label: o.label, rect: JSON.parse(o.rect), confidence: o.confidence }));
    }
    results.push(result);
  }
  return results;
}

/** The photos among `photoIds` the task already processed with this fingerprint on their current content. */
export async function processedPhotos(taskId: string, fingerprint: string, photoIds: readonly number[]): Promise<Set<number>> {
  const rows = await chunked(photoIds, BATCH_SIZE, (chunk) => all(db.select({ id: aiResults.photoId })
    .from(aiResults)
    .innerJoin(photos, and(eq(photos.id, aiResults.photoId), eq(photos.fileHash, aiResults.fileHash)))
    .where(and(eq(aiResults.taskId, taskId), eq(aiResults.fingerprint, fingerprint), inArray(aiResults.photoId, chunk)))));
  return new Set(rows.map((row) => row.id));
}

/** Deletes every result and object of a task. */
export async function deleteTaskResults(taskId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await run(tx.delete(aiObjects).where(eq(aiObjects.taskId, taskId)));
    await run(tx.delete(aiResults).where(eq(aiResults.taskId, taskId)));
  });
}
