import path from 'node:path';

/**
 * `target` resolved against `root` (a relative `target` starts at `root`), or null when the result is
 * not `root` itself or inside it, or `target` is empty or has a NUL character.
 */
export function resolveInside(root: string, target: string): string | null {
  if (target.trim() === '' || target.includes('\0')) return null;
  const base = path.resolve(root);
  const resolved = path.resolve(base, target);
  const relative = path.relative(base, resolved);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)) ? resolved : null;
}

/** A safe `.mp4` file name from a requested one: its last path segment, without unusual characters. */
export function movieFilename(requested: unknown): string {
  const name = typeof requested === 'string' ? path.basename(requested.replace(/\\/g, '/')) : '';
  const stem = name.replace(/\.mp4$/i, '').replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/^\.+/, '').slice(0, 100);
  return `${stem || 'paloma_slideshow'}.mp4`;
}
