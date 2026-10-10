import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { apiError } from '../services/apiError.js';
import type { ApiErrorCode } from '../../../shared/types.js';

/**
 * An Express handler from an async one: a rejection goes to `next`, so it reaches `apiErrorHandler`
 * (Express 4 does not catch rejected promises itself).
 */
export function asyncRoute<P = Record<string, string>>(
  handler: (req: Request<P>, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler<P> {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** Headers set for a file response that must not stay on an error response sent instead. */
const FILE_HEADERS = ['Content-Type', 'Cache-Control', 'X-Content-Type-Options', 'X-Paloma-Full-Width', 'X-Paloma-Full-Height'];

/**
 * Streams a file; a file that is missing (or vanished meanwhile) answers 404 with `code`, any other failure
 * goes to `next`. Replaces checking with `existsSync` before `sendFile`.
 */
export function sendFileOr404(res: Response, next: NextFunction, file: string, code: ApiErrorCode, message: string): void {
  res.sendFile(file, (err?: NodeJS.ErrnoException) => {
    if (!err || res.headersSent) return;
    for (const header of FILE_HEADERS) res.removeHeader(header);
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'EISDIR') {
      res.status(404).json(apiError(code, message));
      return;
    }
    next(err);
  });
}
