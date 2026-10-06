import type { TFunction } from 'i18next';
import type { Memory } from '../../../shared/types.js';

/**
 * A memory's name in the active language: its generated title when it has one, else its album and two-digit year
 * (`Kyiv in '91`), else its age (`10 years ago`). The album name is shown as stored.
 */
export function memoryName(memory: Pick<Memory, 'year' | 'yearsAgo' | 'album' | 'title'>, t: TFunction): string {
  if (memory.title) return memory.title;
  if (memory.album) return t('memories.albumInYear', { album: memory.album.name, yy: String(memory.year % 100).padStart(2, '0') });
  return t('memories.yearsAgo', { count: memory.yearsAgo });
}
