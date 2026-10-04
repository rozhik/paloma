import type { Album } from '../../../shared/types.js';
import { apiRequest } from './http.js';

export const fetchAlbums = (): Promise<Album[]> => apiRequest<Album[]>('GET', '/api/albums');
