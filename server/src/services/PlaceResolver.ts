import { and, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { all, get } from '../db/query.js';
import { geoPlaces, photos } from '../db/schema.js';
import { cellCentre } from './location.js';
import type { GeocoderService } from './GeocoderService.js';
import { savePlace, savePlaceFailure } from './placeCache.js';

const IDLE_CHECK_MS = 30_000;

/**
 * Resolves missing place names in the background, one cell and language at a time, for the languages
 * clients have asked for. Failed lookups are retried once their backoff has passed.
 */
export class PlaceResolver {
  private readonly languages = new Set<string>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;

  constructor(
    private readonly getGeocoder: () => GeocoderService | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Starts resolving, with the languages already in the cache, and checks again every 30 s while idle. */
  public async start(): Promise<void> {
    this.stopped = false;
    for (const { lang } of await all(db.selectDistinct({ lang: geoPlaces.lang }).from(geoPlaces))) this.languages.add(lang);
    this.wake();
  }

  public stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** A client asked for place names in `lang`; resolves them from now on. */
  public noteLanguage(lang: string): void {
    if (this.languages.has(lang)) return;
    this.languages.add(lang);
    this.wake();
  }

  /** Something may need a place name, e.g. a location changed. */
  public wake(): void {
    if (this.stopped) return;
    void this.drain();
  }

  /** Resolves until nothing is missing; resolves when idle. Safe to call while running. */
  public drain(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.loop().finally(() => {
      this.running = null;
      this.scheduleIdleCheck();
    });
    return this.running;
  }

  /** The next cell and language that photos use and the cache cannot answer yet. */
  public async nextMissing(): Promise<{ cell: string; lang: string } | undefined> {
    const now = this.now().toISOString();
    for (const lang of this.languages) {
      const row = await get(db.selectDistinct({ cell: photos.geoCell })
        .from(photos)
        .leftJoin(geoPlaces, and(eq(geoPlaces.cell, photos.geoCell), eq(geoPlaces.lang, lang)))
        .where(and(
          isNotNull(photos.geoCell),
          or(isNull(geoPlaces.cell), and(eq(geoPlaces.status, 'failed'), lte(geoPlaces.retryAt, now))),
        ))
        .orderBy(sql`${photos.geoCell}`)
        .limit(1));
      if (row?.cell) return { cell: row.cell, lang };
    }
    return undefined;
  }

  private async loop(): Promise<void> {
    do {
      this.again = false;
      for (;;) {
        const geocoder = this.getGeocoder();
        const next = geocoder && await this.nextMissing();
        if (!geocoder || !next) break;
        const { lat, lon } = cellCentre(next.cell);
        try {
          await savePlace(next.cell, next.lang, await geocoder.reverse(lat, lon, next.lang), this.now());
        } catch (err) {
          console.error(`Place lookup for ${next.cell} (${next.lang}) failed: ${(err as Error).message}`);
          await savePlaceFailure(next.cell, next.lang, this.now());
        }
      }
    } while (this.again);
  }

  private scheduleIdleCheck(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.wake(), IDLE_CHECK_MS);
    this.timer.unref();
  }
}
