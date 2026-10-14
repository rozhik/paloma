import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import type { AiPrices, AiUsageList, AiUsageRecord } from '../../../shared/types.js';
import { db } from '../db/index.js';
import { all, run } from '../db/query.js';
import { aiUsageLog } from '../db/schema.js';
import { TOKEN_KINDS } from './models.js';

const TOKENS_PER_PRICE = 1_000_000;

/**
 * The credits a call cost: for each token kind, the tokens times the model's price per 1,000,000 tokens. A kind
 * without a price costs 0, and a call that reported no tokens costs 0.
 */
export function creditsFor(tokens: Readonly<Record<string, number>> | null, prices: AiPrices): number {
  if (!tokens) return 0;
  let credits = 0;
  for (const kind of TOKEN_KINDS) credits += ((tokens[kind] ?? 0) * (prices[kind] ?? 0)) / TOKENS_PER_PRICE;
  // Drop the binary noise of summing decimals: 0.15 + 0.3 is 0.44999999999999996
  return Math.round(credits * 1e10) / 1e10;
}

export interface CallRecord {
  queueTaskId: string | null;
  aiTaskId: string;
  userId: string | null;
  providerId: string;
  providerName: string;
  model: string;
  /** Null when the provider reported no usage */
  tokens: Record<string, number> | null;
  /** The model's prices when the call was made */
  prices: AiPrices;
  ok: boolean;
  error?: string | null;
}

/** Stores the record of one model call and returns the credits it cost. A call that reported no tokens costs nothing. */
export async function recordCall(call: CallRecord): Promise<number> {
  const credits = creditsFor(call.tokens, call.prices);
  await run(db.insert(aiUsageLog).values({
    createdAt: new Date().toISOString(), queueTaskId: call.queueTaskId, aiTaskId: call.aiTaskId, userId: call.userId,
    providerId: call.providerId, providerName: call.providerName, model: call.model,
    tokens: call.tokens ? JSON.stringify(call.tokens) : null, prices: JSON.stringify(call.prices), credits, ok: call.ok, error: call.error ?? null,
  }));
  return credits;
}

export interface UsageFilter {
  /** Only this user's records; undefined for everyone's */
  userId?: string;
  from?: string;
  to?: string;
  aiTaskId?: string;
  model?: string;
  limit: number;
  offset: number;
}

const parseJson = <T>(text: string | null, fallback: T): T => {
  if (text === null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

/** The records matching a filter, newest first, with the totals of all matching records. */
export async function listUsage(filter: UsageFilter): Promise<AiUsageList> {
  const conditions: (SQL | undefined)[] = [
    filter.userId !== undefined ? eq(aiUsageLog.userId, filter.userId) : undefined,
    filter.from !== undefined ? gte(aiUsageLog.createdAt, filter.from) : undefined,
    filter.to !== undefined ? lte(aiUsageLog.createdAt, filter.to) : undefined,
    filter.aiTaskId !== undefined ? eq(aiUsageLog.aiTaskId, filter.aiTaskId) : undefined,
    filter.model !== undefined ? eq(aiUsageLog.model, filter.model) : undefined,
  ];
  const where = and(...conditions);
  const sums = await all(db.select({ tokens: aiUsageLog.tokens, credits: aiUsageLog.credits }).from(aiUsageLog).where(where));
  const totals: AiUsageList['totals'] = { calls: sums.length, tokens: {}, credits: 0 };
  for (const row of sums) {
    totals.credits += row.credits;
    for (const [kind, n] of Object.entries(parseJson<Record<string, number>>(row.tokens, {}))) totals.tokens[kind] = (totals.tokens[kind] ?? 0) + n;
  }
  totals.credits = Math.round(totals.credits * 1e10) / 1e10;
  const rows = await all(db.select().from(aiUsageLog).where(where).orderBy(desc(aiUsageLog.createdAt), desc(aiUsageLog.id)).limit(filter.limit).offset(filter.offset));
  const records = rows.map((row): AiUsageRecord => ({
    id: row.id, createdAt: row.createdAt, queueTaskId: row.queueTaskId, aiTaskId: row.aiTaskId, userId: row.userId, providerId: row.providerId,
    providerName: row.providerName, model: row.model, tokens: row.tokens === null ? null : parseJson(row.tokens, null), prices: parseJson(row.prices, {}),
    credits: row.credits, ok: row.ok, error: row.error,
  }));
  return { records, total: sums.length, totals };
}
