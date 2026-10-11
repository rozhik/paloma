import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { run } from '../db/query.js';
import { users } from '../db/schema.js';
import { fail } from '../services/apiError.js';

/** Avatars are kept in Paloma's data directory, never in the photo folders. */
export const AVATAR_SIZE = 256;
export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const avatarsDir = () => path.join(config.dataDir, 'avatars');

/** The file of a user's avatar (whether or not it exists). */
export const avatarFile = (userId: string): string => path.join(avatarsDir(), `${userId}.webp`);

/**
 * Stores an uploaded image as the user's avatar: turned upright, cropped to a centered square and at most
 * 256×256 WebP. Throws 400 `avatar_invalid` for anything sharp cannot read; the old avatar then stays.
 */
export async function saveAvatar(userId: string, image: unknown): Promise<string> {
  if (!Buffer.isBuffer(image) || image.length === 0) fail(400, 'avatar_invalid', 'Send a JPEG, PNG or WebP image of at most 10 MB');
  let square: Buffer;
  try {
    square = await sharp(image, { failOn: 'error' })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', withoutEnlargement: false })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    fail(400, 'avatar_invalid', 'The file is not a usable image');
  }
  await fs.promises.mkdir(avatarsDir(), { recursive: true });
  const temp = `${avatarFile(userId)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.promises.writeFile(temp, square);
  await fs.promises.rename(temp, avatarFile(userId));
  const version = crypto.createHash('sha1').update(square).digest('hex').slice(0, 12);
  await run(db.update(users).set({ avatarVersion: version }).where(eq(users.id, userId)));
  return version;
}

/** Removes a user's avatar; nothing when there is none. */
export async function removeAvatar(userId: string): Promise<void> {
  await run(db.update(users).set({ avatarVersion: null }).where(eq(users.id, userId)));
  await fs.promises.rm(avatarFile(userId), { force: true });
}
