import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES } from './languages.js';
import type { ApiErrorCode } from '../../../shared/types.js';

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'locales');
type Catalog = { [key: string]: string | Catalog };

const load = (tag: string): Catalog => JSON.parse(fs.readFileSync(path.join(localesDir, `${tag}.json`), 'utf-8'));

/** Dotted key -> text, leaving out the `_meta` block (review status, not UI text). */
function flatten(catalog: Catalog, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    if (prefix === '' && key === '_meta') continue;
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') flat.set(dotted, value);
    else for (const [k, v] of flatten(value, dotted)) flat.set(k, v);
  }
  return flat;
}

const PLURAL = /_(zero|one|two|few|many|other)$/;
const placeholders = (text: string) => [...text.matchAll(/\{\{\s*(\w+)/g)].map((m) => m[1]).sort();
const tags = (text: string) => [...text.matchAll(/<\/?(\w+)>/g)].map((m) => m[0]).sort();

const english = flatten(load('en'));
const englishPlurals = new Set([...english.keys()].filter((k) => PLURAL.test(k)).map((k) => k.replace(PLURAL, '')));

/** The keys a language must have: English keys, with each plural expanded to that language's plural categories. */
function expectedKeys(tag: string): string[] {
  const categories = new Intl.PluralRules(tag).resolvedOptions().pluralCategories;
  const keys = [...english.keys()].filter((k) => !PLURAL.test(k));
  for (const base of englishPlurals) keys.push(...categories.map((c) => `${base}_${c}`));
  return keys.sort();
}

describe('catalogs', () => {
  it('has one catalog file per supported language', () => {
    expect(fs.readdirSync(localesDir).sort()).toEqual(LANGUAGES.map((l) => `${l.tag}.json`).sort());
  });

  it('translates every API error code', () => {
    const codes: Record<ApiErrorCode, true> = {
      invalid_body: true, invalid_field: true, invalid_date: true, album_name_required: true, photo_ids_required: true, no_album_fields: true,
      no_photo_fields: true, photo_not_found: true, album_not_found: true, file_not_found: true, cover_not_in_album: true,
      sidecar_unreadable: true, sidecar_write_failed: true, album_empty: true, export_params_required: true,
      person_name_required: true, internal: true, invalid_location: true, query_required: true, geocoder_disabled: true,
      geocoder_failed: true, plugin_not_found: true, plugin_unavailable: true, plugin_invalid_body: true, filter_not_found: true, edits_invalid: true,
      render_failed: true, person_not_found: true, face_not_found: true,
      unauthenticated: true, permission_required: true, session_required: true, login_failed: true, login_throttled: true,
      provider_not_found: true, setup_done: true, setup_code_wrong: true, password_too_short: true, password_wrong: true,
      password_unsupported: true, username_invalid: true, username_taken: true, user_not_found: true, last_admin: true, self_change: true,
      role_not_found: true, role_name_taken: true, role_builtin: true, role_in_use: true, token_not_found: true,
      token_scope_exceeded: true, session_not_found: true, last_login_provider: true, quota_exceeded: true, rate_limited: true,
      album_not_granted: true, outside_access: true, person_linked: true, avatar_invalid: true,
      ai_provider_not_found: true, ai_provider_failed: true, ai_task_not_found: true, ai_task_builtin: true, ai_task_not_builtin: true,
      ai_task_not_ready: true, task_not_found: true, task_state: true, read_only_field: true, object_not_found: true, origin_not_allowed: true,
    };
    for (const code of Object.keys(codes)) expect(english.has(`errors.${code}`), code).toBe(true);
  });

  describe.each(LANGUAGES.map((l) => l.tag))('%s', (tag) => {
    const catalog = flatten(load(tag));

    it('has exactly the English keys, with its own plural forms', () => {
      expect([...catalog.keys()].sort()).toEqual(expectedKeys(tag));
    });

    it('has no empty texts', () => {
      for (const [key, text] of catalog) expect(text.trim(), key).not.toBe('');
    });

    it('keeps the placeholders and markup of the English texts', () => {
      for (const [key, text] of catalog) {
        const base = key.replace(PLURAL, '');
        const source = english.get(key) ?? english.get(`${base}_other`)!;
        expect(placeholders(text), key).toEqual(placeholders(source));
        expect(tags(text), key).toEqual(tags(source));
      }
    });
  });

  it('marks every translation of the English catalog as a machine translation awaiting review', () => {
    for (const { tag } of LANGUAGES) {
      if (tag === 'en') continue;
      expect(load(tag)._meta, tag).toEqual({ reviewed: false });
    }
  });
});
