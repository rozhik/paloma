import { describe, it, expect } from 'vitest';
import { isPathCovered, collapseRoots, isIgnoredName, isFolderMetaFile } from './scanPaths.js';

describe('isPathCovered', () => {
  const roots = ['/photos', '/archive'];

  it('covers a root and folders inside it', () => {
    expect(isPathCovered('/photos', roots, [])).toBe(true);
    expect(isPathCovered('/photos/2024/trip', roots, [])).toBe(true);
  });

  it('does not cover folders outside every root', () => {
    expect(isPathCovered('/other', roots, [])).toBe(false);
    expect(isPathCovered('/photos-old', roots, [])).toBe(false);
  });

  it('does not cover an excluded folder or its subfolders', () => {
    expect(isPathCovered('/photos/tmp', roots, ['/photos/tmp'])).toBe(false);
    expect(isPathCovered('/photos/tmp/x', roots, ['/photos/tmp'])).toBe(false);
    expect(isPathCovered('/photos/tmpfiles', roots, ['/photos/tmp'])).toBe(true);
  });

  it('does not cover folders under a hidden segment or node_modules', () => {
    expect(isPathCovered('/photos/.picasaoriginals', roots, [])).toBe(false);
    expect(isPathCovered('/photos/a/.hidden/b', roots, [])).toBe(false);
    expect(isPathCovered('/photos/node_modules/x', roots, [])).toBe(false);
  });

  it('allows a hidden segment above the root', () => {
    expect(isPathCovered('/home/.cloud/photos/a', ['/home/.cloud/photos'], [])).toBe(true);
  });

  it('covers folders of a configured root that does not exist on disk', () => {
    expect(isPathCovered('/Volumes/NotMounted/2020', ['/Volumes/NotMounted'], [])).toBe(true);
  });
});

describe('collapseRoots', () => {
  it('removes duplicates and trailing separators', () => {
    expect(collapseRoots(['/photos', '/photos/', '/photos'])).toEqual(['/photos']);
  });

  it('drops roots nested inside other roots, in any order', () => {
    expect(collapseRoots(['/photos/2024', '/photos', '/archive'])).toEqual(['/photos', '/archive']);
  });

  it('keeps siblings that only share a name prefix', () => {
    expect(collapseRoots(['/photos', '/photos-old']).sort()).toEqual(['/photos', '/photos-old']);
  });
});

describe('isIgnoredName', () => {
  it('lets the sidecar and the Picasa .ini through in any case', () => {
    for (const name of ['.paloma.json', '.picasa.ini', '.Picasa.INI', 'Picasa.ini']) {
      expect(isIgnoredName(name)).toBe(false);
      expect(isFolderMetaFile(name)).toBe(true);
    }
  });

  it('still ignores other dotfiles, sidecar temp files and hidden folders', () => {
    for (const name of ['.DS_Store', '.paloma.json.123.ab12cd34.tmp', '.paloma', '.picasaoriginals', 'node_modules']) {
      expect(isIgnoredName(name)).toBe(true);
      expect(isFolderMetaFile(name)).toBe(false);
    }
  });
});
