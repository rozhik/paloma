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
