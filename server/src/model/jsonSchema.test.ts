import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { openTestDatabase } from '../auth/testing.js';
import { buildLibrary } from './testLibrary.js';
import type { ObjectType } from '../../../shared/types.js';

let tmpDir: string;
let cleanup: () => void;
let schemaModule: typeof import('./jsonSchema.js');
let registry: typeof import('../plugins/index.js').pluginRegistry;

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_json_schema_test_'));
  ({ pluginRegistry: registry } = await import('../plugins/index.js'));
  await registry.init();
  schemaModule = await import('./jsonSchema.js');
});

afterAll(() => cleanup());

/** A validator of one definition of the model schema. */
function validatorOf(name: string) {
  const ajv = new Ajv2020({ strict: false });
  ajv.addSchema(schemaModule.modelSchema());
  return ajv.getSchema(`paloma://schema#/$defs/${name}`)!;
}

type Defs = Record<string, { properties: Record<string, Record<string, unknown>> }>;
const defs = (): Defs => schemaModule.modelSchema().$defs as Defs;

describe('model schema', () => {
  it('describes caption as writable and fileName as read-only', () => {
    const photo = defs().PhotoDocument;
    expect(photo.properties.caption.description).toEqual(expect.any(String));
    expect(photo.properties.caption.readOnly).toBeUndefined();
    expect(photo.properties.fileName.readOnly).toBe(true);
  });

  it('validates every document the documents API returns', async () => {
    const BIRDS = 'c9ea9fa67022f38a3c771894d2a8a468';
    const ROY = 'b8e4117cf1d6615b';
    await buildLibrary(fs.mkdtempSync(path.join(tmpDir, 'photos_')), {
      trip: {
        photos: { a: { dateTaken: '2024-05-09T12:00:00' }, b: {} },
        sidecar: {
          albums: { [BIRDS]: { name: 'Birds' } },
          people: { [ROY]: { name: 'Roy Avery', email: null, googleId: null } },
          photos: {
            'a.jpg': {
              star: true, caption: 'Sunrise', keywords: ['dawn'], geotag: { lat: 48.1, lon: 24.5 }, albums: [BIRDS],
              faces: [{ person: ROY, rect: { left: 0.1, top: 0.1, right: 0.3, bottom: 0.4 } }],
              edits: [{ filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } }, { filter: 'sepia' }, { filter: 'finetune2', shadows: 0.1 }],
            },
          },
        },
      },
    });
    const { listDocuments } = await import('./documents.js');
    for (const type of ['photo', 'album', 'person', 'folder', 'tag'] as ObjectType[]) {
      const validate = validatorOf(schemaModule.definitionOf(type));
      const { items } = await listDocuments(type, {}, { limit: 100, offset: 0 });
      expect(items.length, type).toBeGreaterThan(0);
      for (const item of items) expect(validate(item), `${type}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('checks the parameters of active filters', () => {
    const validate = validatorOf('EditStep');
    expect(validate({ filter: 'brightness', amount: 20 })).toBe(true);
    expect(validate({ filter: 'brightness', amount: 500 })).toBe(false);
  });

  it('drops the definition of a switched-off filter but keeps its steps valid', async () => {
    const names = () => (defs().EditStep as unknown as { anyOf: { properties: { filter: { const?: string } } }[] }).anyOf
      .map((step) => step.properties.filter.const).filter(Boolean);
    expect(names()).toContain('sepia');
    await registry.setEnabled('basic-effects', false);
    try {
      expect(names()).not.toContain('sepia');
      expect(validatorOf('EditStep')({ filter: 'sepia' })).toBe(true);
    } finally {
      await registry.setEnabled('basic-effects', true);
    }
  });

  it('validates a changeset', () => {
    const validate = validatorOf('Changeset');
    expect(validate({ changes: [{ op: 'update', type: 'photo', ids: [3, 7], set: { star: true, tags: { add: ['sea'] } } }] })).toBe(true);
    expect(validate({ changes: [{ op: 'update', type: 'photo', id: 7, set: { fileName: 'x.jpg' } }] })).toBe(false);
  });
});
