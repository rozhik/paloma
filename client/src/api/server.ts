import type { ServerInfo } from '../../../shared/types.js';
import { apiRequest } from './http.js';

/** The server's configuration from `.env`, read-only. */
export const fetchServerInfo = (): Promise<ServerInfo> => apiRequest('GET', '/api/server/info');
