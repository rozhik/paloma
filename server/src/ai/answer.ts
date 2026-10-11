import type { AiObject, AiOutputKind, AiTag } from '../../../shared/types.js';
import type { AiErrorKind } from '../plugins/api.js';

const MAX_ITEMS = 200;
const MAX_TAG_LENGTH = 100;
const MAX_TEXT_LENGTH = 10000;

/** A provider answer as Paloma keeps it: only usable tags, objects and text. */
export interface CheckedAnswer {
  tags: AiTag[];
  objects: AiObject[];
  text: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** A failed provider call, with how it failed (see `AiProviderError` in the plugin API). */
export class AiCallError extends Error {
  constructor(public readonly kind: AiErrorKind, message: string, public readonly retryAfterMs?: number) {
    super(message);
    this.name = 'AiCallError';
  }
}

const KINDS: readonly AiErrorKind[] = ['auth', 'unreachable', 'rate-limit', 'bad-answer', 'other'];

/** Any error a provider threw, as an AiCallError; errors without a known `kind` count as `other`. */
export function toCallError(err: unknown): AiCallError {
  if (err instanceof AiCallError) return err;
  const value = (typeof err === 'object' && err !== null ? err : {}) as { kind?: unknown; message?: unknown; retryAfterMs?: unknown };
  const kind = KINDS.includes(value.kind as AiErrorKind) ? value.kind as AiErrorKind : 'other';
  const message = typeof value.message === 'string' && value.message !== '' ? value.message : String(err);
  const retry = typeof value.retryAfterMs === 'number' && Number.isFinite(value.retryAfterMs) && value.retryAfterMs >= 0 ? value.retryAfterMs : undefined;
  return new AiCallError(kind, message, retry);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/** A confidence 0..1, or null when absent or not a number. */
function confidenceOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : null;
}

function tokens(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function checkTags(value: unknown): AiTag[] {
  if (!Array.isArray(value)) throw new AiCallError('bad-answer', 'The answer has no list of tags');
  const tags: AiTag[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const raw = typeof item === 'string' ? { name: item } : isObject(item) ? item : null;
    if (!raw || typeof raw.name !== 'string') continue;
    const name = raw.name.trim().slice(0, MAX_TAG_LENGTH);
    const key = name.toLowerCase();
    if (name === '' || seen.has(key)) continue;
    seen.add(key);
    tags.push({ name, confidence: confidenceOf(raw.confidence) });
    if (tags.length === MAX_ITEMS) break;
  }
  return tags;
}

function checkObjects(value: unknown): AiObject[] {
  if (!Array.isArray(value)) throw new AiCallError('bad-answer', 'The answer has no list of objects');
  const objects: AiObject[] = [];
  for (const item of value) {
    if (!isObject(item) || typeof item.label !== 'string' || !isObject(item.rect)) continue;
    const label = item.label.trim().slice(0, MAX_TAG_LENGTH);
    const { left, top, right, bottom } = item.rect;
    if (label === '' || ![left, top, right, bottom].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    const rect = { left: clamp01(left as number), top: clamp01(top as number), right: clamp01(right as number), bottom: clamp01(bottom as number) };
    if (rect.right <= rect.left || rect.bottom <= rect.top) continue;
    objects.push({ label, rect, confidence: confidenceOf(item.confidence) });
    if (objects.length === MAX_ITEMS) break;
  }
  return objects;
}

/**
 * Checks a provider's answer for a task's output kind: rectangles are clipped to the image, and empty tags and
 * labels, duplicate tags and rectangles without area are dropped. Throws a `bad-answer` AiCallError when the
 * answer does not have the asked-for part at all.
 */
export function checkAnswer(output: AiOutputKind, answer: unknown): CheckedAnswer {
  if (!isObject(answer)) throw new AiCallError('bad-answer', 'The answer is not an object');
  const usage = isObject(answer.usage) ? answer.usage : {};
  const checked: CheckedAnswer = {
    tags: [], objects: [], text: null, inputTokens: tokens(usage.inputTokens), outputTokens: tokens(usage.outputTokens),
  };
  if (output === 'tags') checked.tags = checkTags(answer.tags);
  else if (output === 'objects') checked.objects = checkObjects(answer.objects);
  else {
    if (typeof answer.text !== 'string') throw new AiCallError('bad-answer', 'The answer has no text');
    checked.text = answer.text.trim().slice(0, MAX_TEXT_LENGTH);
  }
  return checked;
}
