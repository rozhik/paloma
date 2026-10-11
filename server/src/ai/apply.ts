import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { get } from '../db/query.js';
import { photos } from '../db/schema.js';
import { changePhotosKeywords, updatePhoto } from '../services/photoApi.js';
import { parseKeywords } from '../services/libraryText.js';
import type { CheckedAnswer } from './answer.js';
import type { StoredTask } from './store.js';

/** What applying a result changed, or why a change could not be saved. */
export interface Applied {
  tagsAdded: number;
  descriptionSet: boolean;
  /** The message of a failed save; the result itself is stored anyway */
  error: string | null;
}

const confident = (confidence: number | null, min: number) => confidence === null || confidence >= min;

/** The tags a result adds: tags (or, when the task says so, object labels) confident enough, at most the task's maximum. */
export function tagsToAdd(task: StoredTask, answer: CheckedAnswer): string[] {
  const min = task.options.minConfidence ?? 0;
  if (task.output === 'tags') {
    return answer.tags.filter((tag) => confident(tag.confidence, min)).slice(0, task.options.maxTags ?? answer.tags.length).map((tag) => tag.name);
  }
  if (task.output === 'objects' && task.options.labelsAsTags) {
    return answer.objects.filter((object) => confident(object.confidence, min)).map((object) => object.label);
  }
  return [];
}

/** The description a text result sets, or null when it sets none. */
export function descriptionToSet(task: StoredTask, answer: CheckedAnswer, current: string | null): string | null {
  if (task.output !== 'text' || !answer.text) return null;
  const target = task.options.textTarget ?? 'description-if-empty';
  if (target === 'none' || (target === 'description-if-empty' && current !== null && current.trim() !== '')) return null;
  return answer.text === current ? null : answer.text;
}

const messageOf = (body: unknown) => (typeof body === 'object' && body !== null && 'error' in body ? String((body as { error: unknown }).error) : 'The change could not be saved');

/**
 * Applies a task's result to the photo as a user edit would: adds tags (never removing any) and sets the
 * description, writing the folder's `.paloma.json`. Runs with the access of the current request.
 */
export async function applyResult(photoId: number, task: StoredTask, answer: CheckedAnswer): Promise<Applied> {
  const applied: Applied = { tagsAdded: 0, descriptionSet: false, error: null };
  const before = await get(db.select({ keywords: photos.keywords, caption: photos.caption }).from(photos).where(eq(photos.id, photoId)));
  if (!before) return { ...applied, error: 'Photo not found' };

  const add = tagsToAdd(task, answer);
  if (add.length > 0) {
    const result = await changePhotosKeywords({ photoIds: [photoId], add });
    if (result.status !== 200) return { ...applied, error: messageOf(result.body) };
    applied.tagsAdded = (result.body[0]?.keywords.length ?? 0) - parseKeywords(before.keywords).length;
  }

  const description = descriptionToSet(task, answer, before.caption);
  if (description !== null) {
    const result = await updatePhoto(photoId, { caption: description });
    if (result.status !== 200) return { ...applied, error: messageOf(result.body) };
    applied.descriptionSet = true;
  }
  return applied;
}
