import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { geoPlaces, geoSearch } from '../db/schema.js';
import type { GeoSearchResult } from '../../../shared/types.js';

const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 60 * 60_000;

/** Delay before retrying a lookup that failed `attempts` times: 1 min, doubling, at most 1 h. */
export function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);
}

/** A BCP 47-like language tag the geocoder understands, or `en` for anything else. */
export function normalizeLang(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(value) ? value : 'en';
}

/** Search text as cached: trimmed, lowercased, inner spaces collapsed. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getCachedPlace(cell: string, lang: string) {
  return db.select().from(geoPlaces).where(and(eq(geoPlaces.cell, cell), eq(geoPlaces.lang, lang))).get();
}

/** Stores a resolved place name, or that the geocoder knows no place in the cell (`null`). */
export function savePlace(cell: string, lang: string, name: string | null, now = new Date()): void {
  const row = {
    cell, lang, name, searchText: name?.toLowerCase() ?? null, status: name === null ? 'none' as const : 'ok' as const,
    attempts: 0, retryAt: null, updatedAt: now.toISOString(),
  };
  db.insert(geoPlaces).values(row).onConflictDoUpdate({ target: [geoPlaces.cell, geoPlaces.lang], set: row }).run();
}

/** Records a failed lookup and when to try again. */
export function savePlaceFailure(cell: string, lang: string, now = new Date()): void {
  const attempts = (getCachedPlace(cell, lang)?.attempts ?? 0) + 1;
  const row = {
    cell, lang, name: null, searchText: null, status: 'failed' as const,
    attempts, retryAt: new Date(now.getTime() + retryDelayMs(attempts)).toISOString(), updatedAt: now.toISOString(),
  };
  db.insert(geoPlaces).values(row).onConflictDoUpdate({ target: [geoPlaces.cell, geoPlaces.lang], set: row }).run();
}

export function getCachedSearch(lang: string, query: string): GeoSearchResult[] | undefined {
  const row = db.select().from(geoSearch)
    .where(and(eq(geoSearch.lang, lang), eq(geoSearch.query, normalizeQuery(query)))).get();
  return row ? JSON.parse(row.resultsJson) : undefined;
}

export function saveSearch(lang: string, query: string, results: GeoSearchResult[], now = new Date()): void {
  const row = { lang, query: normalizeQuery(query), resultsJson: JSON.stringify(results), createdAt: now.toISOString() };
  db.insert(geoSearch).values(row).onConflictDoUpdate({ target: [geoSearch.lang, geoSearch.query], set: row }).run();
}
