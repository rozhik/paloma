import { describe, it, expect } from 'vitest';
import { redactPaths, redactPhotoPath } from './redact.js';

describe('redactPaths', () => {
  it('replaces POSIX and Windows paths', () => {
    expect(redactPaths('Input file is missing: /Users/anna/Photos/trip/a.jpg')).toBe('Input file is missing: <path>');
    expect(redactPaths('/var/cache/paloma/thumbs/ab.webp not found')).toBe('<path> not found');
    expect(redactPaths("ENOENT: no such file or directory, open '/srv/photos/x.jpg'")).toBe("ENOENT: no such file or directory, open '<path>'");
    expect(redactPaths('failed (C:\\Users\\anna\\Pictures\\a.jpg)')).toBe('failed (<path>)');
    expect(redactPaths('share \\\\nas\\photos\\a.jpg gone')).toBe('share <path> gone');
    expect(redactPaths('dir=/data/library/2024')).toBe('dir=<path>');
  });

  it('leaves ordinary text, ratios, single-segment slashes and URLs alone', () => {
    for (const text of ['Aspect 1/2 and 3/4', 'use /api only', 'see http://localhost:3001/api/mcp/x', 'https://example.com/a/b/c', 'and/or']) {
      expect(redactPaths(text)).toBe(text);
    }
  });
});

describe('redactPhotoPath', () => {
  it('names the photo instead of its file', () => {
    expect(redactPhotoPath('Could not read /photos/trip/a.jpg (cache /tmp/c/x.webp)', '/photos/trip/a.jpg', 7))
      .toBe('Could not read photo 7 (cache <path>)');
  });
});
