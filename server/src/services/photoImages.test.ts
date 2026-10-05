import { describe, it, expect } from 'vitest';
import type { RegisteredFilter } from '../plugins/registry.js';
import { effectiveChain, photoImageUrls, renderKey } from './photoImages.js';

const filter = (name: string, version = '1.0.0'): RegisteredFilter => ({
  pluginId: 'basic-effects',
  pluginVersion: version,
  definition: {
    name, label: name, group: 'effects', render: ({ image }) => image,
    params: name === 'brightness' ? [{ name: 'amount', label: 'Amount', type: 'number', min: -100, max: 100, step: 1, default: 0 }] : [],
  },
  host: {} as RegisteredFilter['host'],
});

const lookupOf = (...filters: RegisteredFilter[]) => {
  const map = new Map(filters.map((f) => [f.definition.name, f]));
  return (name: string) => map.get(name);
};

const all = lookupOf(filter('sepia'), filter('brightness'));
const PHOTO = { id: 7, fileHash: 'abc' };

describe('renderKey', () => {
  it('is null without effective steps', () => {
    expect(renderKey(null, all)).toBeNull();
    expect(renderKey([], all)).toBeNull();
    expect(renderKey([{ filter: 'sepia', enabled: false }, { filter: 'grain' }], all)).toBeNull();
    expect(renderKey([{ filter: 'brightness', amount: 900 }], all)).toBeNull();
  });

  it('is stable for the same effective chain', () => {
    const a = renderKey([{ filter: 'sepia' }, { filter: 'grain' }], all);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(renderKey([{ filter: 'sepia' }], all)).toBe(a);
    expect(renderKey([{ filter: 'brightness' }], all)).toBe(renderKey([{ filter: 'brightness', amount: 0 }], all));
  });

  it('changes with parameters, order, a plugin switched off and a plugin version', () => {
    const key = renderKey([{ filter: 'sepia' }, { filter: 'brightness', amount: 20 }], all);
    expect(renderKey([{ filter: 'sepia' }, { filter: 'brightness', amount: 30 }], all)).not.toBe(key);
    expect(renderKey([{ filter: 'brightness', amount: 20 }, { filter: 'sepia' }], all)).not.toBe(key);
    expect(renderKey([{ filter: 'sepia' }, { filter: 'brightness', amount: 20 }], lookupOf(filter('brightness')))).not.toBe(key);
    expect(renderKey([{ filter: 'sepia' }, { filter: 'brightness', amount: 20 }], lookupOf(filter('sepia', '1.1.0'), filter('brightness')))).not.toBe(key);
  });
});

describe('effectiveChain', () => {
  it('keeps the steps that render, with defaults and plugin versions', () => {
    expect(effectiveChain([{ filter: 'grain' }, { filter: 'brightness' }], all)).toEqual([
      { filter: 'brightness', plugin: 'basic-effects@1.0.0', params: { amount: 0 } },
    ]);
  });
});

describe('photoImageUrls', () => {
  it('uses the scanner files without effective edits', () => {
    expect(photoImageUrls(PHOTO, [{ filter: 'grain' }], all)).toEqual({
      thumbnailUrl: '/api/cache/thumbnail/abc',
      previewUrl: '/api/cache/preview/abc',
    });
  });

  it('uses rendered images keyed by the chain with effective edits', () => {
    const key = renderKey([{ filter: 'sepia' }], all);
    expect(photoImageUrls(PHOTO, [{ filter: 'sepia' }], all)).toEqual({
      thumbnailUrl: `/api/photos/7/thumbnail?r=${key}`,
      previewUrl: `/api/photos/7/preview?r=${key}`,
    });
  });
});
