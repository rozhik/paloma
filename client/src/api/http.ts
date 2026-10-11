import type { TFunction } from 'i18next';
import type { ApiError } from '../../../shared/types.js';
import en from '../i18n/locales/en.json';

/** A failed API request: its HTTP status and the error body the server sent, if any. */
export class ApiRequestError extends Error {
  constructor(public readonly status: number, public readonly body: Partial<ApiError> | null) {
    super(body?.error ?? `Request failed (${status})`);
    this.name = 'ApiRequestError';
  }
}

/** Sends a JSON request and returns the response JSON, or throws an `ApiRequestError`. */
export async function apiRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const errorBody = typeof data === 'object' && data !== null && !Array.isArray(data) ? data as Partial<ApiError> : null;
    throw new ApiRequestError(res.status, errorBody);
  }
  return data as T;
}

const isKnownCode = (code: unknown): code is keyof typeof en.errors =>
  typeof code === 'string' && Object.prototype.hasOwnProperty.call(en.errors, code);

/**
 * The message to show for a failed request, in the active language: the translation of the server's error code,
 * else the server's own text, else a generic failure with the HTTP status.
 */
export function describeError(err: unknown, t: TFunction): string {
  if (!(err instanceof ApiRequestError)) return t('errors.network');
  const { status, body } = err;
  if (isKnownCode(body?.code)) return t(`errors.${body.code}`, { ...body.params });

  const message = typeof body?.error === 'string' && body.error !== '' ? body.error : t('errors.request_failed', { status });
  const failed = Array.isArray(body?.failedFolders) ? body.failedFolders : [];
  return failed.length > 0 ? `${message} ${t('errors.not_changed', { folders: failed.join(', ') })}` : message;
}

/**
 * Calls `onEnded` whenever an API request other than `/api/auth/*` gets 401, which means the session ended
 * (logged out elsewhere, revoked, expired or the account disabled), and `onForbidden` when one gets 403, which
 * can mean the user's permissions changed. Wraps `fetch` once, so requests made with `fetch` directly are
 * noticed too. Returns a function that removes the wrapper.
 */
export function watchSessionEnd(
  onEnded: () => void, target: { fetch: typeof fetch } = globalThis, onForbidden: () => void = () => {},
): () => void {
  const original = target.fetch;
  const watched: typeof fetch = async (input, init) => {
    const response = await original(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith('http') ? new URL(url).pathname : url;
    if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
      if (response.status === 401) onEnded();
      if (response.status === 403) onForbidden();
    }
    return response;
  };
  target.fetch = watched;
  return () => {
    if (target.fetch === watched) target.fetch = original;
  };
}
