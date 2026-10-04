import path from 'node:path';

// Skip dotfiles/dot-directories and dependency trees
const IGNORED_NAME = /^(\..*|node_modules)$/;

/** The folder's own metadata files: the Paloma sidecar and the Picasa .ini (read-only), any case. */
export function isFolderMetaFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === '.paloma.json' || lower === '.picasa.ini' || lower === 'picasa.ini';
}

export function isIgnoredName(name: string): boolean {
  return IGNORED_NAME.test(name) && !isFolderMetaFile(name);
}

function isInside(absPath: string, dir: string): boolean {
  return absPath === dir || absPath.startsWith(dir + path.sep);
}

export function isExcluded(absPath: string, excludeDirs: readonly string[]): boolean {
  return excludeDirs.some((dir) => isInside(absPath, path.resolve(dir)));
}

/**
 * Whether a folder belongs in the library under the given configuration: it lies inside a photos
 * root, and nothing between the root and the folder is hidden, `node_modules` or excluded.
 * Purely path-based, so a configured root that is missing on disk still covers its folders.
 */
export function isPathCovered(
  folderPath: string,
  photosDirs: readonly string[],
  excludeDirs: readonly string[],
): boolean {
  const absPath = path.resolve(folderPath);
  if (isExcluded(absPath, excludeDirs)) return false;

  return photosDirs.some((dir) => {
    const root = path.resolve(dir);
    if (!isInside(absPath, root)) return false;
    return !path.relative(root, absPath).split(path.sep).some((segment) => segment && isIgnoredName(segment));
  });
}

/** Resolves and de-duplicates roots, dropping any root nested inside another one. */
export function collapseRoots(dirs: readonly string[]): string[] {
  const unique = [...new Set(dirs.map((dir) => path.resolve(dir)))].sort((a, b) => a.length - b.length);
  const roots: string[] = [];
  for (const dir of unique) {
    if (!roots.some((root) => isInside(dir, root))) roots.push(dir);
  }
  return roots;
}
