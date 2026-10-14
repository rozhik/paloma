import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Request, Response } from 'express';
import { authOn } from '../auth/middleware.js';
import { OFF_PRINCIPAL, principalFor, type Principal } from '../auth/principal.js';
import { runWithAccess } from '../auth/scope.js';
import { tokenById } from '../auth/tokens.js';
import { apiError } from '../services/apiError.js';
import { libraryLookup } from '../services/libraryImages.js';
import { getApiPhoto } from '../services/photoApi.js';
import { renderKey } from '../services/photoImages.js';
import { photoImage, renderPreview } from '../services/renderApi.js';

// Temporary image links of the MCP server (mcp-image-links capability). A link is
// `/api/mcp/media/<payload>.<signature>`: the payload names the photo, the image, the render key, the API token
// and the expiry, and the HMAC signature makes it unforgeable. Nothing is stored, so the links die with the
// process; each fetch checks the token, the photo and the render key again.

/** The cached thumbnail or preview, or a JPEG fitted within this many pixels (the image of `view_photo`). */
export type LinkImage = 'thumb' | 'preview' | number;

export interface LinkPayload {
  /** Photo id */
  p: number;
  /** Which image */
  k: LinkImage;
  /** Render key of the photo's edits when the link was made; null without effective edits */
  r: string | null;
  /** The API token the link was made for; null with auth off */
  t: string | null;
  /** Expiry, ms since the epoch */
  e: number;
}

/** Sizes `view_photo` renders; a link for any other number is refused. */
export const MIN_VIEW_SIZE = 64;
export const MAX_VIEW_SIZE = 1600;

/** Signs the links of this process; a restart makes every earlier link invalid. */
const SECRET = crypto.randomBytes(32);

const sign = (data: string): Buffer => crypto.createHmac('sha256', SECRET).update(data).digest();

/** The link of a payload: base64url JSON, a dot, and the base64url HMAC-SHA256 of the first part. */
export function signLink(payload: LinkPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data).toString('base64url')}`;
}

const isLinkImage = (value: unknown): value is LinkImage =>
  value === 'thumb' || value === 'preview' || (Number.isInteger(value) && (value as number) >= MIN_VIEW_SIZE && (value as number) <= MAX_VIEW_SIZE);

/** The payload of a link this process signed that has not expired; null for anything else. */
export function verifyLink(link: string, now = Date.now()): LinkPayload | null {
  const match = /^([A-Za-z0-9_-]{1,1024})\.([A-Za-z0-9_-]{43})$/.exec(link);
  if (!match) return null;
  const given = Buffer.from(match[2], 'base64url');
  const expected = sign(match[1]);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
  const { p, k, r, t, e } = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
  if (!Number.isSafeInteger(p) || !isLinkImage(k) || !(r === null || typeof r === 'string') || !(t === null || typeof t === 'string')) return null;
  if (typeof e !== 'number' || !(e > now)) return null;
  return { p: p as number, k, r, t, e };
}

/**
 * Who a link acts for, as of now: the token's owner with the token's permissions while the token exists, has
 * not expired and its owner is enabled; the single user when auth is off and the link was made with auth off.
 */
async function linkPrincipal(tokenId: string | null): Promise<Principal | null> {
  if (tokenId === null) return authOn() ? null : OFF_PRINCIPAL;
  if (!authOn()) return null;
  const token = await tokenById(tokenId);
  if (!token) return null;
  return principalFor(token.userId, { via: 'token', tokenId, tokenPermissions: token.permissions });
}

/** The image of a link for the current access scope, or null when the photo is not visible, hidden or edited since. */
async function linkImage(payload: LinkPayload): Promise<{ image: Buffer; type: string } | null> {
  const photo = await getApiPhoto(payload.p);
  if (!photo || photo.isHidden || renderKey(photo.edits, libraryLookup) !== payload.r) return null;
  if (typeof payload.k === 'number') {
    const rendered = await renderPreview(photo.id, { edits: photo.edits ?? [], maxSize: payload.k }, 'jpeg');
    return rendered.status === 200 && rendered.kind === 'buffer' ? { image: rendered.image, type: rendered.type } : null;
  }
  const cached = await photoImage(photo.id, payload.k);
  if (cached.status !== 200) return null;
  if (cached.kind === 'buffer') return { image: cached.image, type: cached.type };
  // Read here rather than with sendFile, whose errors would reach the error handler with the file's path
  const image = await fs.promises.readFile(cached.file).catch(() => null);
  return image && { image, type: cached.type ?? 'image/webp' };
}

const notFound = (res: Response) => res.status(404).json(apiError('file_not_found', 'Image not found'));

/**
 * `GET /api/mcp/media/:link`: the image of a temporary link, with no login. Every failure, whatever the reason,
 * is the same 404, so a link tells nothing about why it stopped working.
 */
export async function sendLinkImage(req: Request<{ link: string }>, res: Response): Promise<void> {
  const payload = verifyLink(req.params.link);
  const principal = payload && await linkPrincipal(payload.t);
  if (!payload || !principal || !principal.permissions.has('library.view')) {
    notFound(res);
    return;
  }
  const found = await runWithAccess(principal.access, () => linkImage(payload));
  if (!found) {
    notFound(res);
    return;
  }
  res.set({ 'Content-Type': found.type, 'Cache-Control': 'private, no-store' }).send(found.image);
}
