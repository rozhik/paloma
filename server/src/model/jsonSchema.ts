import { z } from 'zod/v4';
import { pluginRegistry } from '../plugins/index.js';
import { changeset, documentSchemas, editStep, relativeRect } from './schemas.js';
import type { FilterInfo, FilterParamInfo, ObjectType } from '../../../shared/types.js';

// The published JSON Schema of the object model (`GET /api/schema`, MCP `paloma://schema`).

type Json = Record<string, unknown>;

const DEF_NAMES: Record<ObjectType, string> = {
  photo: 'PhotoDocument', album: 'AlbumDocument', person: 'PersonDocument', folder: 'FolderDocument', tag: 'TagDocument',
};

/** The filters of the active plugins, as `GET /api/plugins` lists them in English. */
export function activeFilters(): FilterInfo[] {
  return pluginRegistry.list('en').filter((plugin) => plugin.status === 'active').flatMap((plugin) => plugin.filters);
}

function paramSchema(param: FilterParamInfo): Json {
  switch (param.type) {
    case 'number':
      return {
        type: 'number', minimum: param.min, maximum: param.max, default: param.default,
        description: `${param.label}: a number from ${param.min} to ${param.max} (default ${param.default})`,
      };
    case 'boolean':
      return { type: 'boolean', default: param.default, description: `${param.label} (default ${param.default})` };
    case 'choice':
      return {
        enum: param.options.map((option) => option.value), default: param.default,
        description: `${param.label}: one of ${param.options.map((option) => `${JSON.stringify(option.value)} (${option.label})`).join(', ')}`,
      };
    case 'rect':
      return { $ref: '#/$defs/RelativeRect', description: `${param.label}: a rectangle as fractions 0..1 of the image at this step` };
  }
}

/** The schema of one step of an active filter: its name, `enabled` and its parameters, each optional with a default. */
export function filterStepSchema(filter: FilterInfo): Json {
  return {
    type: 'object',
    description: `${filter.label} (${filter.group})${filter.params.length === 0 ? ', no parameters' : ''}`,
    properties: {
      filter: { const: filter.name, description: `"${filter.name}"` },
      enabled: { const: false, description: 'false keeps the step without applying it; leave out to apply it' },
      ...Object.fromEntries(filter.params.map((param) => [param.name, paramSchema(param)])),
    },
    required: ['filter'],
    additionalProperties: false,
  };
}

/** One definition per active filter, and any other filter's step as it is kept. */
function editStepDefinition(filters: readonly FilterInfo[]): Json {
  return {
    description: 'One step of the non-destructive edit chain. Steps of filters that are not available are kept unchanged and skipped when rendering',
    anyOf: [
      ...filters.map(filterStepSchema),
      {
        type: 'object',
        description: 'A step of a filter that is not available now, e.g. one imported from Picasa',
        properties: {
          filter: { type: 'string', ...(filters.length > 0 ? { not: { enum: filters.map((filter) => filter.name) } } : {}), description: 'Filter name' },
        },
        required: ['filter'],
        additionalProperties: true,
      },
    ],
  };
}

/** A zod schema as JSON Schema, with edit steps and rectangles as references to the shared definitions. */
function toJson(schema: z.ZodType): Json {
  const json = z.toJSONSchema(schema, {
    override: (ctx) => {
      const ref = ctx.zodSchema === editStep ? '#/$defs/EditStep' : ctx.zodSchema === relativeRect ? '#/$defs/RelativeRect' : null;
      if (!ref) return;
      const description = ctx.jsonSchema.description;
      for (const key of Object.keys(ctx.jsonSchema)) delete (ctx.jsonSchema as Json)[key];
      Object.assign(ctx.jsonSchema, { $ref: ref, ...(description ? { description } : {}) });
    },
  }) as Json;
  delete json.$schema;
  return json;
}

/** The whole model schema: one definition per document type, the changeset, edit steps and rectangles. */
export function modelSchema(): Json {
  const rect = z.toJSONSchema(relativeRect) as Json;
  delete rect.$schema;
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'paloma://schema',
    title: 'Paloma object model',
    description: 'Documents of the photo library (photo, album, person, folder, tag) and the changeset that changes them. '
      + 'Read documents with GET /api/objects/:type and /api/objects/:type/:id (MCP: search_photos, list_objects, get_objects); '
      + 'change them with POST /api/changes (MCP: apply_changes). Properties marked readOnly cannot be set.',
    $defs: {
      ...Object.fromEntries(Object.entries(documentSchemas).map(([type, schema]) => [DEF_NAMES[type as ObjectType], toJson(schema)])),
      Changeset: toJson(changeset),
      EditStep: editStepDefinition(activeFilters()),
      RelativeRect: rect,
    },
  };
}

/** The `$defs` name of a document type. */
export const definitionOf = (type: ObjectType): string => DEF_NAMES[type];
