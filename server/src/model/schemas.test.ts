import { describe, it, expect } from 'vitest';
import { z } from 'zod/v4';
import { changeset, documentSchemas } from './schemas.js';

type Json = Record<string, unknown>;

/** Paths of object properties without a description, anywhere in a JSON Schema. */
function undescribed(schema: unknown, at = '#'): string[] {
  if (Array.isArray(schema)) return schema.flatMap((item, i) => undescribed(item, `${at}/${i}`));
  if (typeof schema !== 'object' || schema === null) return [];
  const node = schema as Json;
  const missing: string[] = [];
  if (node.properties && typeof node.properties === 'object') {
    for (const [name, property] of Object.entries(node.properties as Json)) {
      const described = typeof (property as Json).description === 'string';
      if (!described) missing.push(`${at}/${name}`);
    }
  }
  for (const [key, value] of Object.entries(node)) missing.push(...undescribed(value, `${at}/${key}`));
  return missing;
}

describe('model schemas', () => {
  it('describes every property of every document', () => {
    for (const [type, schema] of Object.entries(documentSchemas)) {
      expect(undescribed(z.toJSONSchema(schema)), type).toEqual([]);
    }
  });

  it('marks read-only document properties', () => {
    const photo = z.toJSONSchema(documentSchemas.photo) as { properties: Record<string, Json> };
    expect(photo.properties.fileName.readOnly).toBe(true);
    expect(photo.properties.caption.readOnly).toBeUndefined();
  });

  it('describes the set attributes of the changeset', () => {
    expect(undescribed(z.toJSONSchema(changeset))).toEqual([]);
  });
});
