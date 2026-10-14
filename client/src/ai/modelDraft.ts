import type { AiCapability, AiCatalogModel, AiCatalogModelInput, AiPrices, AiTokenKind } from '../../../shared/types.js';

/** The token kinds a model is priced by, in the order the editor lists them. */
export const TOKEN_KINDS: readonly AiTokenKind[] = ['prompt_tokens', 'completion_tokens'];

/** What the model editor edits; prices and grades are text while typing. */
export interface ModelDraft {
  enabled: boolean;
  description: string;
  prices: Record<AiTokenKind, string>;
  capabilities: { name: string; grade: string }[];
}

export const draftOfModel = (model: AiCatalogModel): ModelDraft => ({
  enabled: model.enabled,
  description: model.description,
  prices: { prompt_tokens: String(model.prices.prompt_tokens ?? 0), completion_tokens: String(model.prices.completion_tokens ?? 0) },
  capabilities: model.capabilities.map((c) => ({ name: c.name, grade: String(c.grade) })),
});

/** The body to save: prices as numbers (an empty field is 0) and grades as whole numbers; the server checks the ranges. */
export function modelInput(draft: ModelDraft): AiCatalogModelInput {
  const prices: AiPrices = {};
  for (const kind of TOKEN_KINDS) prices[kind] = draft.prices[kind].trim() === '' ? 0 : Number(draft.prices[kind]);
  const capabilities: AiCapability[] = draft.capabilities.map((c) => ({ name: c.name.trim(), grade: c.grade.trim() === '' ? NaN : Number(c.grade) }));
  return { enabled: draft.enabled, description: draft.description, prices, capabilities };
}

/** Whether the draft differs from the model as stored. */
export const isChanged = (draft: ModelDraft, model: AiCatalogModel): boolean => JSON.stringify(draft) !== JSON.stringify(draftOfModel(model));
