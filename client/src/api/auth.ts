import type {
  ApiTokenInfo, AuthStatus, CreatedApiToken, MeResponse, Permission, PermissionInfo, RoleInfo, SessionInfo, UserInfo, UserInput,
} from '../../../shared/types.js';
import { ApiRequestError, apiRequest } from './http.js';

const withLang = (url: string, lang: string) => `${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams({ lang })}`;

// --- The current user ---

export const fetchAuthStatus = (lang: string): Promise<AuthStatus> => apiRequest('GET', withLang('/api/auth/status', lang));
export const fetchMe = (lang: string): Promise<MeResponse> => apiRequest('GET', withLang('/api/auth/me', lang));

export const setupAdmin = (body: { setupCode: string; username: string; displayName: string; password: string }, lang: string): Promise<MeResponse> =>
  apiRequest('POST', withLang('/api/auth/setup', lang), body);

export const login = (provider: string, fields: Record<string, string>, lang: string): Promise<MeResponse> =>
  apiRequest('POST', withLang(`/api/auth/login/${encodeURIComponent(provider)}`, lang), fields);

export const logout = (): Promise<{ success: true }> => apiRequest('POST', '/api/auth/logout', {});

export const updateProfile = (displayName: string, lang: string): Promise<MeResponse> =>
  apiRequest('PATCH', withLang('/api/auth/me', lang), { displayName });

export const changePassword = (currentPassword: string, newPassword: string): Promise<{ success: true }> =>
  apiRequest('POST', '/api/auth/password', { currentPassword, newPassword });

export const fetchSessions = (): Promise<SessionInfo[]> => apiRequest('GET', '/api/auth/sessions');
export const revokeSession = (id: string): Promise<{ success: true }> => apiRequest('DELETE', `/api/auth/sessions/${encodeURIComponent(id)}`);

export const fetchTokens = (): Promise<ApiTokenInfo[]> => apiRequest('GET', '/api/auth/tokens');
export const createToken = (body: { name: string; permissions: Permission[]; expiresAt: string | null }): Promise<CreatedApiToken> =>
  apiRequest('POST', '/api/auth/tokens', body);
export const revokeToken = (id: string): Promise<{ success: true }> => apiRequest('DELETE', `/api/auth/tokens/${encodeURIComponent(id)}`);

// --- Administration ---

export const fetchPermissions = (lang: string): Promise<PermissionInfo[]> => apiRequest('GET', withLang('/api/admin/permissions', lang));

export const fetchRoles = (lang: string): Promise<RoleInfo[]> => apiRequest('GET', withLang('/api/admin/roles', lang));
export const createRole = (body: { name: string; description: string; permissions: Permission[] }, lang: string): Promise<RoleInfo> =>
  apiRequest('POST', withLang('/api/admin/roles', lang), body);
export const updateRole = (id: string, body: { name?: string; description?: string; permissions?: Permission[] }, lang: string): Promise<RoleInfo> =>
  apiRequest('PATCH', withLang(`/api/admin/roles/${encodeURIComponent(id)}`, lang), body);
export const deleteRole = (id: string): Promise<{ success: true }> => apiRequest('DELETE', `/api/admin/roles/${encodeURIComponent(id)}`);

export const fetchUsers = (): Promise<UserInfo[]> => apiRequest('GET', '/api/admin/users');
export const createUser = (body: UserInput): Promise<UserInfo> => apiRequest('POST', '/api/admin/users', body);
export const updateUser = (id: string, body: UserInput): Promise<UserInfo> => apiRequest('PATCH', `/api/admin/users/${encodeURIComponent(id)}`, body);
export const deleteUser = (id: string): Promise<{ success: true }> => apiRequest('DELETE', `/api/admin/users/${encodeURIComponent(id)}`);
export const resetUserPassword = (id: string, password: string): Promise<UserInfo> =>
  apiRequest('POST', `/api/admin/users/${encodeURIComponent(id)}/password`, { password });

export const fetchAllSessions = (): Promise<SessionInfo[]> => apiRequest('GET', '/api/admin/sessions');
export const revokeAnySession = (id: string): Promise<{ success: true }> => apiRequest('DELETE', `/api/admin/sessions/${encodeURIComponent(id)}`);
export const fetchAllTokens = (): Promise<ApiTokenInfo[]> => apiRequest('GET', '/api/admin/tokens');
export const revokeAnyToken = (id: string): Promise<{ success: true }> => apiRequest('DELETE', `/api/admin/tokens/${encodeURIComponent(id)}`);

/** Uploads a picture file as the own avatar; responds with the current user. */
export async function uploadAvatar(file: Blob, lang: string): Promise<MeResponse> {
  const res = await fetch(withLang('/api/auth/avatar', lang), { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(res.status, data);
  return data as MeResponse;
}

export const removeAvatar = (lang: string): Promise<MeResponse> => apiRequest('DELETE', withLang('/api/auth/avatar', lang));
export const removeUserAvatar = (id: string): Promise<UserInfo> => apiRequest('DELETE', `/api/admin/users/${encodeURIComponent(id)}/avatar`);
