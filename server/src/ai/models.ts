import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AiCapability, AiCatalogModel, AiCatalogModelInput, AiPrices, AiTokenKind } from '../../../shared/types.js';
import { db } from '../db/index.js';
import { all, get, run, withTransaction } from '../db/query.js';
import { aiModelCapabilities, aiModels } from '../db/schema.js';

/** The token kinds a model is priced by. */
export const TOKEN_KINDS: readonly AiTokenKind[] = ['prompt_tokens', 'completion_tokens'];

export const MAX_DESCRIPTION = 2000;
export const MAX_CAPABILITY_NAME = 40;
const MAX_CAPABILITIES = 50;

/** A model input that cannot be saved; `field` names the part. */
export class ModelInputError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = 'ModelInputError';
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a provider reports about a model it lists. */
export interface ListedModel {
  id: string;
  info?: Record<string, unknown>;
}

type ModelRow = typeof aiModels.$inferSelect;

const parseObject = (text: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
};

/** The prices stored for a model: only known kinds with a number of at least 0. */
export function parsePrices(text: string): AiPrices {
  const stored = parseObject(text);
  const prices: AiPrices = {};
  for (const kind of TOKEN_KINDS) {
    const value = stored[kind];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) prices[kind] = value;
  }
  return prices;
}

function catalogModel(row: ModelRow, providerName: string, capabilities: AiCapability[]): AiCatalogModel {
  return {
    providerId: row.providerId, providerName, id: row.modelId, enabled: row.enabled, listed: row.listed, description: row.description,
    info: parseObject(row.info), prices: parsePrices(row.prices), capabilities,
  };
}

/**
 * The catalogue models of the given providers (id to name), sorted by provider name and model id. Disabled models
 * are left out unless `includeDisabled`.
 */
export async function listCatalog(providers: ReadonlyMap<string, string>, includeDisabled: boolean): Promise<AiCatalogModel[]> {
  const ids = [...providers.keys()];
  if (ids.length === 0) return [];
  const rows = await all(db.select().from(aiModels).where(and(inArray(aiModels.providerId, ids), includeDisabled ? undefined : eq(aiModels.enabled, true))));
  const capabilities = await all(db.select().from(aiModelCapabilities).where(inArray(aiModelCapabilities.providerId, ids)).orderBy(aiModelCapabilities.name));
  const byModel = new Map<string, AiCapability[]>();
  for (const c of capabilities) {
    const key = `${c.providerId}\0${c.modelId}`;
    byModel.set(key, [...(byModel.get(key) ?? []), { name: c.name, grade: c.grade }]);
  }
  return rows
    .map((row) => catalogModel(row, providers.get(row.providerId)!, byModel.get(`${row.providerId}\0${row.modelId}`) ?? []))
    .sort((a, b) => a.providerName.localeCompare(b.providerName) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** One catalogue model, or undefined. */
export async function findModel(providerId: string, providerName: string, modelId: string): Promise<AiCatalogModel | undefined> {
  return (await listCatalog(new Map([[providerId, providerName]]), true)).find((m) => m.id === modelId);
}

/** Adds a model when the provider has none with that id. Returns whether it was added. */
export async function ensureModel(providerId: string, modelId: string, enabled: boolean): Promise<boolean> {
  const result = await run(db.insert(aiModels).values({ providerId, modelId, enabled, updatedAt: new Date().toISOString() }).onConflictDoNothing());
  return result.changes > 0;
}

/** Makes sure every model a task names is in its provider's list, enabled when it had to be added. */
export async function ensureTaskModels(tasks: readonly { provider: string | null; model: string | null }[]): Promise<void> {
  for (const task of tasks) {
    if (task.provider && task.model) await ensureModel(task.provider, task.model, true);
  }
}

/** The enabled models, as `providerId\0modelId`. */
export async function enabledModelKeys(): Promise<Set<string>> {
  const rows = await all(db.select({ providerId: aiModels.providerId, modelId: aiModels.modelId }).from(aiModels).where(eq(aiModels.enabled, true)));
  return new Set(rows.map((row) => modelKey(row.providerId, row.modelId)));
}

export const modelKey = (providerId: string, modelId: string): string => `${providerId}\0${modelId}`;

/** The prices of a model; empty for an unknown model. */
export async function modelPrices(providerId: string, modelId: string): Promise<AiPrices> {
  const row = await get(db.select({ prices: aiModels.prices }).from(aiModels).where(and(eq(aiModels.providerId, providerId), eq(aiModels.modelId, modelId))));
  return row ? parsePrices(row.prices) : {};
}

/**
 * Merges what a provider lists into its catalogue: new models are added disabled, listed ones get their information
 * updated, and stored models the provider no longer lists are marked so but kept with their prices and capabilities.
 * `details` is the information from the single-model endpoint, by model id.
 */
export async function mergeListedModels(providerId: string, listed: readonly ListedModel[], details: ReadonlyMap<string, Record<string, unknown>> = new Map()): Promise<void> {
  const now = new Date().toISOString();
  const ids = new Set(listed.map((model) => model.id));
  await withTransaction(async (tx) => {
    for (const model of listed) {
      const info = JSON.stringify({ ...model.info, ...details.get(model.id) });
      const existing = await get(tx.select({ info: aiModels.info }).from(aiModels).where(and(eq(aiModels.providerId, providerId), eq(aiModels.modelId, model.id))));
      if (!existing) {
        await run(tx.insert(aiModels).values({ providerId, modelId: model.id, enabled: false, listed: true, info, updatedAt: now }));
      } else {
        // Details found earlier stay when this refresh did not fetch them again
        const merged = details.has(model.id) ? info : JSON.stringify({ ...parseObject(existing.info), ...model.info });
        await run(tx.update(aiModels).set({ listed: true, info: merged, updatedAt: now }).where(and(eq(aiModels.providerId, providerId), eq(aiModels.modelId, model.id))));
      }
    }
    const stored = await all(tx.select({ modelId: aiModels.modelId }).from(aiModels).where(eq(aiModels.providerId, providerId)));
    for (const row of stored) {
      if (!ids.has(row.modelId)) await run(tx.update(aiModels).set({ listed: false, updatedAt: now }).where(and(eq(aiModels.providerId, providerId), eq(aiModels.modelId, row.modelId))));
    }
  });
}

/** The model ids of a provider that have no stored information yet. */
export async function modelsWithoutInfo(providerId: string, ids: readonly string[]): Promise<Set<string>> {
  const rows = await all(db.select({ modelId: aiModels.modelId, info: aiModels.info }).from(aiModels).where(eq(aiModels.providerId, providerId)));
  const known = new Map(rows.map((row) => [row.modelId, parseObject(row.info)]));
  return new Set(ids.filter((id) => Object.keys(known.get(id) ?? {}).length <= 1));
}

function parseNewPrices(value: unknown): AiPrices {
  if (!isObject(value)) throw new ModelInputError('prices', 'prices must be an object of credits per 1,000,000 tokens');
  const prices: AiPrices = {};
  for (const [kind, price] of Object.entries(value)) {
    if (!(TOKEN_KINDS as readonly string[]).includes(kind)) throw new ModelInputError(kind, `${kind} is not a token kind; use ${TOKEN_KINDS.join(' or ')}`);
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) throw new ModelInputError(kind, `${kind} must be a number of at least 0`);
    prices[kind as AiTokenKind] = price;
  }
  return prices;
}

function parseCapabilities(value: unknown): AiCapability[] {
  if (!Array.isArray(value) || value.length > MAX_CAPABILITIES) throw new ModelInputError('capabilities', `capabilities must be a list of at most ${MAX_CAPABILITIES}`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (!isObject(entry) || typeof entry.name !== 'string') throw new ModelInputError('capabilities', `capability ${index + 1} needs a name`);
    const name = entry.name.trim();
    if (name === '' || name.length > MAX_CAPABILITY_NAME) throw new ModelInputError('capabilities', `a capability name must be 1 to ${MAX_CAPABILITY_NAME} characters`);
    if (seen.has(name.toLowerCase())) throw new ModelInputError('capabilities', `capability ${name} is listed twice`);
    seen.add(name.toLowerCase());
    if (typeof entry.grade !== 'number' || !Number.isInteger(entry.grade) || entry.grade < 0 || entry.grade > 100) {
      throw new ModelInputError('capabilities', `the grade of ${name} must be a whole number from 0 to 100`);
    }
    return { name, grade: entry.grade };
  });
}

/** Checks a `PATCH` body for a model; nothing is saved when any field is invalid. */
export function parseModelInput(body: unknown): AiCatalogModelInput {
  if (!isObject(body)) throw new ModelInputError('', 'Body must be an object');
  const input: AiCatalogModelInput = {};
  for (const [field, value] of Object.entries(body)) {
    switch (field) {
      case 'enabled':
        if (typeof value !== 'boolean') throw new ModelInputError('enabled', 'enabled must be true or false');
        input.enabled = value;
        break;
      case 'description':
        if (typeof value !== 'string' || value.length > MAX_DESCRIPTION) throw new ModelInputError('description', `description must be a text of at most ${MAX_DESCRIPTION} characters`);
        input.description = value;
        break;
      case 'prices':
        input.prices = parseNewPrices(value);
        break;
      case 'capabilities':
        input.capabilities = parseCapabilities(value);
        break;
      default:
        throw new ModelInputError(field, `${field} cannot be set`);
    }
  }
  return input;
}

/** Saves the fields of a checked input on a stored model. Prices replace the whole price list. Returns false for an unknown model. */
export async function updateModel(providerId: string, modelId: string, input: AiCatalogModelInput): Promise<boolean> {
  return withTransaction(async (tx) => {
    const where = and(eq(aiModels.providerId, providerId), eq(aiModels.modelId, modelId));
    if (!await get(tx.select({ id: aiModels.modelId }).from(aiModels).where(where))) return false;
    const set: Partial<typeof aiModels.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (input.enabled !== undefined) set.enabled = input.enabled;
    if (input.description !== undefined) set.description = input.description;
    if (input.prices !== undefined) set.prices = JSON.stringify(input.prices);
    await run(tx.update(aiModels).set(set).where(where));
    if (input.capabilities !== undefined) {
      await run(tx.delete(aiModelCapabilities).where(and(eq(aiModelCapabilities.providerId, providerId), eq(aiModelCapabilities.modelId, modelId))));
      for (const c of input.capabilities) await run(tx.insert(aiModelCapabilities).values({ providerId, modelId, name: c.name, grade: c.grade }));
    }
    return true;
  });
}

/** Deletes a provider's models and their capabilities. */
export async function deleteProviderModels(providerId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await run(tx.delete(aiModelCapabilities).where(eq(aiModelCapabilities.providerId, providerId)));
    await run(tx.delete(aiModels).where(eq(aiModels.providerId, providerId)));
  });
}

/** The number of models stored for a provider. */
export async function countModels(providerId: string): Promise<number> {
  const row = await get(db.select({ n: sql<number>`count(*)` }).from(aiModels).where(eq(aiModels.providerId, providerId)));
  return row?.n ?? 0;
}
