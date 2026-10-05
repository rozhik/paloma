import type { EditHistory, EditStep, Photo, PhotoEdits, PluginInfo } from '../../../shared/types.js';
import { apiRequest } from './http.js';

/** Every plugin found at server startup, with texts in `lang`. */
export const fetchPlugins = (lang: string): Promise<PluginInfo[]> =>
  apiRequest<PluginInfo[]>('GET', `/api/plugins?${new URLSearchParams({ lang })}`);

/** Switches a plugin on or off; responds with the plugin as it is now. */
export const setPluginEnabled = (id: string, enabled: boolean, lang: string): Promise<PluginInfo> =>
  apiRequest<PluginInfo>('PATCH', `/api/plugins/${encodeURIComponent(id)}?${new URLSearchParams({ lang })}`, { enabled });

/**
 * Saves a photo's edit chain (`[]` removes all edits) and, when given, its undo history; responds with the
 * updated photo.
 */
export const savePhotoEdits = (photoId: number, edits: EditStep[], history?: EditHistory): Promise<Photo> =>
  apiRequest<Photo>('PUT', `/api/photos/${photoId}/edits`, history ? { edits, history } : { edits });

/** A photo's edit chain with its undo history, as stored in its sidecar. */
export const fetchPhotoEdits = (photoId: number): Promise<PhotoEdits> =>
  apiRequest<PhotoEdits>('GET', `/api/photos/${photoId}/edits`);
