import type { ErrorRequestHandler } from 'express';
import type { ApiError, ApiErrorCode } from '../../../shared/types.js';

/** An API error body: a stable code for the client to translate, English text, and the values the text refers to. */
export function apiError(code: ApiErrorCode, error: string, params?: ApiError['params']): ApiError {
  return params ? { error, code, params } : { error, code };
}

/** A failed request with its HTTP status and API error body; thrown by services, sent by `apiErrorHandler`. */
export class HttpError extends Error {
  constructor(public readonly status: number, public readonly body: ApiError, public readonly headers: Record<string, string> = {}) {
    super(body.error);
    this.name = 'HttpError';
  }
}

/** Throws an `HttpError` with an API error body. */
export function fail(status: number, code: ApiErrorCode, error: string, params?: ApiError['params']): never {
  throw new HttpError(status, apiError(code, error, params));
}

/**
 * Express error handler: an `HttpError` is sent as it is, malformed JSON is a 400 `invalid_body`, anything else
 * a 500 `internal`.
 */
export const apiErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    res.set(err.headers);
    return res.status(err.status).json(err.body);
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json(apiError('invalid_body', 'Body must be valid JSON'));
  }
  console.error('Unhandled API error:', err);
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json(apiError('internal', 'Internal server error', { message }));
};
