import type { KeymapFile, KeymapResponse, KeymapSaved } from '../../../shared/types.js';
import { apiRequest } from './http.js';

/** The user's keymap with only its own keys, or null while nothing is stored for them. */
export const fetchKeymap = (): Promise<KeymapResponse> => apiRequest('GET', '/api/keymap');

/** Replaces the user's keymap; refused with 400 `invalid_keymap` and `problems` when it is not valid. */
export const saveKeymap = (file: KeymapFile): Promise<KeymapSaved> => apiRequest('PUT', '/api/keymap', file);
