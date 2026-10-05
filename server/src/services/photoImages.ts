import crypto from 'node:crypto';
import type { EditStep } from '../../../shared/types.js';
import { checkStepParams, isEditChain, type FilterLookup } from './editChain.js';

/** A step that would actually render, tagged with the plugin version that renders it. */
export interface EffectiveStep {
  filter: string;
  plugin: string;
  params: Record<string, unknown>;
}

/** The steps of a chain that rendering applies: enabled, of an available filter, with valid parameters. */
export function effectiveChain(steps: readonly EditStep[] | null | undefined, lookup: FilterLookup): EffectiveStep[] {
  const effective: EffectiveStep[] = [];
  for (const step of steps ?? []) {
    if (step.enabled === false) continue;
    const filter = lookup(step.filter);
    if (!filter) continue;
    const check = checkStepParams(step, filter);
    if (check.ok) effective.push({ filter: step.filter, plugin: `${filter.pluginId}@${filter.pluginVersion}`, params: check.params });
  }
  return effective;
}

/**
 * Identifies how a photo looks with its edits: changes when the effective chain changes, for example
 * when a plugin is switched on or off or updated. Null when nothing would render.
 */
export function renderKey(steps: readonly EditStep[] | null | undefined, lookup: FilterLookup): string | null {
  const effective = effectiveChain(steps, lookup);
  if (effective.length === 0) return null;
  return crypto.createHash('sha1').update(JSON.stringify(effective)).digest('hex').slice(0, 12);
}

export interface PhotoImageUrls {
  thumbnailUrl: string;
  previewUrl: string;
}

/** Thumbnail and preview URLs: the scanner's files without effective edits, rendered ones keyed by the chain otherwise. */
export function photoImageUrls(photo: { id: number; fileHash: string }, edits: readonly EditStep[] | null | undefined, lookup: FilterLookup): PhotoImageUrls {
  const key = renderKey(edits, lookup);
  if (!key) {
    return { thumbnailUrl: `/api/cache/thumbnail/${photo.fileHash}`, previewUrl: `/api/cache/preview/${photo.fileHash}` };
  }
  return { thumbnailUrl: `/api/photos/${photo.id}/thumbnail?r=${key}`, previewUrl: `/api/photos/${photo.id}/preview?r=${key}` };
}

/** The edit chain stored in the library's `edits` table, or null when there is none or it is not a chain. */
export function parseEditsJson(json: string | null | undefined): EditStep[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return isEditChain(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}
