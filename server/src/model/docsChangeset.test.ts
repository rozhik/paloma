import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod/v4';
import { changeset } from './schemas.js';
import { isFailure, parseChangeset } from './changes/parse.js';

// The changeset example in docs/mcp.md stays valid
const doc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'mcp.md'), 'utf-8');
const example = JSON.parse(/<!-- changeset-example -->\s*```json\n([\s\S]*?)```/.exec(doc)![1]);

describe('docs/mcp.md changeset example', () => {
  it('matches the changeset schema', () => {
    expect(z.safeParse(changeset, example).success).toBe(true);
  });

  it('passes the changeset checks', () => {
    const parsed = parseChangeset(example);
    expect(isFailure(parsed), JSON.stringify(parsed)).toBe(false);
  });
});
