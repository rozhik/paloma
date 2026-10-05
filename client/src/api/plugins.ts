import type { EditStep, Photo, PluginInfo } from '../../../shared/types.js';
import { apiRequest } from './http.js';

/** Every plugin found at server startup, with texts in `lang`. */
export const fetchPlugins = (lang: string): Promise<PluginInfo[]> =>
  apiRequest<PluginInfo[]>('GET', `/api/plugins?${new URLSearchParams({ lang })}`);

/** Switches a plugin on or off; responds with the plugin as it is now. */
export const setPluginEnabled = (id: string, enabled: boolean, lang: string): Promise<PluginInfo> =>
  apiRequest<PluginInfo>('PATCH', `/api/plugins/${encodeURIComponent(id)}?${new URLSearchParams({ lang })}`, { enabled });

/** Saves a photo's edit chain (`[]` removes all edits); responds with the updated photo. */
export const savePhotoEdits = (photoId: number, edits: EditStep[]): Promise<Photo> =>
  apiRequest<Photo>('PUT', `/api/photos/${photoId}/edits`, { edits });
