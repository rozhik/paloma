import fs from 'node:fs';
import path from 'node:path';
import type { ComplexityLevel, LocalizedText } from '../../../shared/types.js';
import { PLUGIN_API_VERSION } from './api.js';

export const MANIFEST_NAME = 'paloma-plugin.json';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** The levels a plugin or filter may declare, lowest first. */
export const COMPLEXITY_LEVELS = ['child', 'easy', 'normal', 'pro', 'developer'] as const satisfies readonly ComplexityLevel[];
/** The level of a plugin whose manifest declares none */
export const DEFAULT_PLUGIN_LEVEL: ComplexityLevel = 'normal';

export const isComplexityLevel = (value: unknown): value is ComplexityLevel =>
  COMPLEXITY_LEVELS.includes(value as ComplexityLevel);

export interface PluginManifest {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  version: string;
  apiVersion: number;
  /** Absolute path of the server module, inside the plugin folder */
  server: string;
  /** The lowest level at which the UI offers what the plugin contributes */
  level: ComplexityLevel;
}

/** What could be read of a manifest that cannot be used, so the plugin can still be listed. */
export interface PartialManifest {
  id?: string;
  name?: LocalizedText;
  description?: LocalizedText;
  version?: string;
  level?: ComplexityLevel;
}

export type ManifestRead =
  | { kind: 'missing' }
  | { kind: 'ok'; manifest: PluginManifest }
  | { kind: 'invalid'; partial: PartialManifest; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-empty string, or an object of language tags to strings that includes `en`. */
export function isLocalizedText(value: unknown): value is LocalizedText {
  if (typeof value === 'string') return value.trim() !== '';
  return isPlainObject(value)
    && typeof value.en === 'string'
    && value.en.trim() !== ''
    && Object.values(value).every((text) => typeof text === 'string');
}

/** The text in `lang` (exact tag, then its primary subtag), else English, else the first one given. */
export function localize(text: LocalizedText, lang = 'en'): string {
  if (typeof text === 'string') return text;
  const primary = lang.split('-')[0];
  return text[lang] ?? text[primary] ?? text.en ?? Object.values(text)[0] ?? '';
}

/** True when `target` is `dir` itself or inside it. */
function isInside(dir: string, target: string): boolean {
  const relative = path.relative(dir, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Reads and checks `paloma-plugin.json` in a plugin folder. */
export async function readManifest(folder: string): Promise<ManifestRead> {
  const file = path.join(folder, MANIFEST_NAME);
  let text: string;
  try {
    text = await fs.promises.readFile(file, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'invalid', partial: {}, reason: `cannot read ${MANIFEST_NAME}: ${(err as Error).message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.startsWith('﻿') ? text.slice(1) : text);
  } catch (err) {
    return { kind: 'invalid', partial: {}, reason: `${MANIFEST_NAME} is not valid JSON (${(err as Error).message})` };
  }
  if (!isPlainObject(parsed)) return { kind: 'invalid', partial: {}, reason: `${MANIFEST_NAME} is not a JSON object` };

  const partial: PartialManifest = {};
  if (typeof parsed.id === 'string' && ID_PATTERN.test(parsed.id)) partial.id = parsed.id;
  if (isLocalizedText(parsed.name)) partial.name = parsed.name;
  if (isLocalizedText(parsed.description)) partial.description = parsed.description;
  if (typeof parsed.version === 'string' && parsed.version.trim() !== '') partial.version = parsed.version;
  if (isComplexityLevel(parsed.level)) partial.level = parsed.level;
  const invalid = (reason: string): ManifestRead => ({ kind: 'invalid', partial, reason });

  if (parsed.id === undefined) return invalid('the manifest has no "id"');
  if (!partial.id) return invalid('"id" must use only lowercase letters, digits and hyphens');
  if (!partial.name) return invalid('"name" must be a text, or an object of texts by language that includes "en"');
  if (!partial.description) return invalid('"description" must be a text, or an object of texts by language that includes "en"');
  if (!partial.version) return invalid('"version" must be a non-empty string');
  if (!Number.isInteger(parsed.apiVersion)) return invalid('"apiVersion" must be an integer');
  if (parsed.apiVersion !== PLUGIN_API_VERSION) {
    return invalid(`the plugin needs plugin API ${parsed.apiVersion}, while Paloma supports ${PLUGIN_API_VERSION}`);
  }
  if (typeof parsed.server !== 'string' || parsed.server.trim() === '') return invalid('"server" must name the module file');
  if (parsed.level !== undefined && !partial.level) {
    return invalid(`"level" must be one of ${COMPLEXITY_LEVELS.join(', ')}`);
  }

  const root = await fs.promises.realpath(folder);
  const server = path.resolve(root, parsed.server);
  if (!isInside(root, server)) return invalid(`"server" ${JSON.stringify(parsed.server)} is outside the plugin folder`);
  let realServer: string;
  try {
    realServer = await fs.promises.realpath(server);
  } catch {
    return invalid(`the module ${JSON.stringify(parsed.server)} does not exist`);
  }
  if (!isInside(root, realServer)) return invalid(`"server" ${JSON.stringify(parsed.server)} is outside the plugin folder`);
  if (!(await fs.promises.stat(realServer)).isFile()) return invalid(`the module ${JSON.stringify(parsed.server)} is not a file`);

  return {
    kind: 'ok',
    manifest: {
      id: partial.id,
      name: partial.name,
      description: partial.description,
      version: partial.version,
      apiVersion: parsed.apiVersion,
      server: realServer,
      level: partial.level ?? DEFAULT_PLUGIN_LEVEL,
    },
  };
}
