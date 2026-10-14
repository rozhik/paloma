import type { Request } from 'express';
import { config, MCP_PATH } from '../config.js';
import type { Principal } from '../auth/principal.js';
import { libraryLookup } from '../services/libraryImages.js';
import { renderKey } from '../services/photoImages.js';
import type { ObjectDocument, PhotoDocument } from '../../../shared/types.js';
import { signLink, type LinkImage } from './media.js';

// The temporary image URLs that MCP results carry (mcp-image-links capability).

/** A temporary URL; valid for `uri_valid_time_sec` seconds from when the result was made. */
export interface ImageLink {
  url: string;
}

/** A photo document in an MCP result: with links to its images unless it is hidden. */
export type McpPhotoDocument = PhotoDocument & { images?: { thumbnail: ImageLink; preview: ImageLink } };

/** Makes the links of one MCP request: for its token, on the address the client used, all expiring together. */
export interface ImageLinks {
  /** Seconds the links stay valid, reported as `uri_valid_time_sec` */
  readonly validSec: number;
  /** A link to an image of a photo as it looks with its saved edits; undefined for a hidden photo */
  link(photo: PhotoDocument, image: LinkImage): ImageLink | undefined;
}

/** The address the client reached the server on, e.g. `http://localhost:3001`. */
export const baseUrlOf = (req: Request): string => `${req.protocol}://${req.get('host')}`;

export function imageLinks(principal: Principal, baseUrl: string, now = Date.now(), validSec = config.mcp.uriValidSec): ImageLinks {
  const expires = now + validSec * 1000;
  return {
    validSec,
    link(photo, image) {
      if (photo.hidden) return undefined;
      const link = signLink({ p: photo.id, k: image, r: renderKey(photo.edits, libraryLookup), t: principal.tokenId ?? null, e: expires });
      return { url: `${baseUrl}${MCP_PATH}/media/${link}` };
    },
  };
}

/** The documents with `images` added to every photo that is not hidden; other documents unchanged. */
export function withImages<T extends ObjectDocument>(documents: readonly T[], links: ImageLinks): (T | McpPhotoDocument)[] {
  return documents.map((document) => {
    if (document.type !== 'photo') return document;
    const thumbnail = links.link(document, 'thumb');
    const preview = links.link(document, 'preview');
    return thumbnail && preview ? { ...document, images: { thumbnail, preview } } : document;
  });
}
