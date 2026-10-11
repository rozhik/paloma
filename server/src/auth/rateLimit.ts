import type { RequestHandler } from 'express';
import { apiError } from '../services/apiError.js';
import { authOn } from './middleware.js';
import type { Principal } from './principal.js';

const WINDOW_MS = 60_000;

/** Image requests do not count: one grid of thumbnails would use up a minute's requests. */
const IMAGE_ROUTES = [
  /^\/photos\/\d+\/(thumbnail|preview|face|face-source)$/,
  /^\/cache\/(thumbnail|preview)\/[^/]+$/,
  /^\/raw\/[^/]+$/,
  /^\/people\/[^/]+\/avatar$/,
  /^\/plugins\/[^/]+\/filters\/[^/]+\/icon$/,
];

export const isImageRequest = (method: string, path: string): boolean =>
  method === 'GET' && IMAGE_ROUTES.some((pattern) => pattern.test(path));

/** Requests per key in fixed one-minute windows; kept in memory, so a restart resets it. */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  /** Counts a request; returns the seconds to wait when it is over `limit`, else 0. */
  hit(key: string, limit: number, now = Date.now()): number {
    let window = this.windows.get(key);
    if (!window || now - window.start >= WINDOW_MS) {
      if (this.windows.size > 10_000) this.sweep(now);
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    window.count += 1;
    return window.count > limit ? Math.max(1, Math.ceil((window.start + WINDOW_MS - now) / 1000)) : 0;
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) if (now - window.start >= WINDOW_MS) this.windows.delete(key);
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Limits API requests per minute: all sessions of a user together, and each API token separately, to the
 * user's request rate quota. Over it, 429 `rate_limited` with the seconds to wait.
 */
export function rateLimit(limiter: RateLimiter = rateLimiter): RequestHandler {
  return (req, res, next) => {
    const principal = res.locals.principal as Principal | undefined;
    if (!authOn() || !principal?.user || principal.rateLimit === null || isImageRequest(req.method, req.path)) return next();
    const key = principal.via === 'token' ? `token:${principal.tokenId ?? principal.user.id}` : `user:${principal.user.id}`;
    const wait = limiter.hit(key, principal.rateLimit);
    if (wait === 0) return next();
    res.set('Retry-After', String(wait));
    res.status(429).json(apiError('rate_limited', `Too many requests; try again in ${wait} seconds`, { seconds: wait }));
  };
}
