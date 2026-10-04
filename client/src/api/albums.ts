import type { Album } from '../../../shared/types.js';

/** Sends an album request and returns its JSON, or throws with the server's error and the folders it could not change. */
export async function albumRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const failed: string[] = Array.isArray(data.failedFolders) ? data.failedFolders : [];
    const message = data.error ?? `Запит не вдався (${res.status})`;
    throw new Error(failed.length > 0 ? `${message}. Не змінено: ${failed.join(', ')}` : message);
  }
  return data as T;
}

export const fetchAlbums = (): Promise<Album[]> => albumRequest<Album[]>('GET', '/api/albums');
