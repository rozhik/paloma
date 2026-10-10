import { and, count, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { all } from '../db/query.js';
import { photoKeywords, photos } from '../db/schema.js';
import type { TagSummary } from '../../../shared/types.js';

/**
 * `GET /api/tags`: the tags of photos that are not hidden, grouped ignoring case, each under the spelling
 * most of its photos use (on a tie, the first by code points), sorted by name ignoring case.
 */
export async function listTags(): Promise<TagSummary[]> {
  const rows = await all(db.select({ key: photoKeywords.key, keyword: photoKeywords.keyword, photos: count() })
    .from(photoKeywords)
    .innerJoin(photos, and(eq(photoKeywords.photoId, photos.id), eq(photos.isHidden, false)))
    .groupBy(photoKeywords.key, photoKeywords.keyword));

  const byKey = new Map<string, { name: string; best: number; photoCount: number }>();
  for (const { key, keyword, photos: used } of rows) {
    const tag = byKey.get(key);
    if (!tag) {
      byKey.set(key, { name: keyword, best: used, photoCount: used });
      continue;
    }
    tag.photoCount += used;
    if (used > tag.best || (used === tag.best && keyword < tag.name)) {
      tag.name = keyword;
      tag.best = used;
    }
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map(([, { name, photoCount }]) => ({ name, photoCount }));
}
