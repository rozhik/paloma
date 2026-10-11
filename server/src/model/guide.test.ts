import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openTestDatabase } from '../auth/testing.js';

let cleanup: () => void;
let guide: typeof import('./guide.js');
let registry: typeof import('../plugins/index.js').pluginRegistry;

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_guide_test_'));
  ({ pluginRegistry: registry } = await import('../plugins/index.js'));
  await registry.init();
  guide = await import('./guide.js');
});

afterAll(() => cleanup());

describe('AI guide', () => {
  it('explains ids, changesets, dry runs and that only .paloma.json is written', () => {
    const text = guide.aiGuide();
    for (const part of ['`photo`', '"dryRun": true', '.paloma.json', 'includeHidden', '"@<ref>"', 'view_photo']) expect(text).toContain(part);
  });

  it('lists the filters of active plugins only', async () => {
    expect(guide.aiGuide()).toMatch(/- `sepia` — /);
    expect(guide.aiGuide()).toMatch(/- `brightness` — .*`amount` — .*from -100 to 100/);
    await registry.setEnabled('basic-effects', false);
    try {
      expect(guide.aiGuide()).not.toMatch(/- `sepia` — /);
      expect(guide.aiGuide()).toMatch(/- `crop64` — /);
    } finally {
      await registry.setEnabled('basic-effects', true);
    }
  });
});
