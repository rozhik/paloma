import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { movieFilename, resolveInside } from './outputPaths.js';

const root = path.resolve('/data/export');

describe('resolveInside', () => {
  it('resolves relative folders against the root', () => {
    expect(resolveInside(root, 'Trip/2024')).toBe(path.join(root, 'Trip', '2024'));
    expect(resolveInside(root, '.')).toBe(root);
  });

  it('accepts an absolute path that is inside the root', () => {
    expect(resolveInside(root, path.join(root, 'a'))).toBe(path.join(root, 'a'));
  });

  it.each(['../x', 'a/../../x', '/etc', '..', 'a\0b', '', '  '])('rejects %j', (target) => {
    expect(resolveInside(root, target)).toBeNull();
  });

  it('does not treat a sibling with the same prefix as inside', () => {
    expect(resolveInside(root, '../export2/a')).toBeNull();
  });
});

describe('movieFilename', () => {
  it('keeps a plain name and adds .mp4', () => {
    expect(movieFilename('holiday')).toBe('holiday.mp4');
    expect(movieFilename('holiday.MP4')).toBe('holiday.mp4');
  });

  it('drops folders and traversal', () => {
    expect(movieFilename('../../etc/cron.d/x')).toBe('x.mp4');
    expect(movieFilename('..\\..\\x.mp4')).toBe('x.mp4');
    expect(movieFilename('..')).toBe('paloma_slideshow.mp4');
  });

  it('falls back to the default for anything but a usable string', () => {
    expect(movieFilename(undefined)).toBe('paloma_slideshow.mp4');
    expect(movieFilename(42)).toBe('paloma_slideshow.mp4');
    expect(movieFilename('')).toBe('paloma_slideshow.mp4');
  });
});
