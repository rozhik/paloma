import type { Photo, PhotoInfo, TagSummary } from '../../../shared/types.js';
import { apiRequest } from './http.js';

export const fetchTags = (): Promise<TagSummary[]> => apiRequest<TagSummary[]>('GET', '/api/tags');

/** Adds tags to and removes tags from several photos; responds with the updated photos. */
export const changePhotosTags = (photoIds: number[], change: { add?: string[]; remove?: string[] }): Promise<Photo[]> =>
  apiRequest<Photo[]>('POST', '/api/photos/keywords', { photoIds, ...change });

/** Saves a photo's description (`caption`) or tags (`keywords`). */
export const updatePhotoText = (photoId: number, change: { caption?: string; keywords?: string[] }): Promise<Photo> =>
  apiRequest<Photo>('PATCH', `/api/photos/${photoId}`, change);

export const fetchPhotoInfo = (photoId: number, lang: string): Promise<PhotoInfo> =>
  apiRequest<PhotoInfo>('GET', `/api/photos/${photoId}/info?lang=${encodeURIComponent(lang)}`);
