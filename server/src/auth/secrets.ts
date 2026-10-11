import crypto from 'node:crypto';

// scrypt with N = 2^15, r = 8, p = 1: about 32 MB and tens of milliseconds per hash
const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MAX_MEMORY = 64 * 1024 * 1024;

function scrypt(secret: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret.normalize('NFC'), salt, length, { N: n, r, p, maxmem: MAX_MEMORY }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** A salted scrypt hash of a secret: `scrypt$N$r$p$salt$hash` with base64url salt and hash. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(secret, salt, N, R, P, KEY_LENGTH);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** A hash of a random secret, to verify against when there is no real one, so both take as long. */
let dummyHash: Promise<string> | null = null;
export const dummySecretHash = (): Promise<string> => (dummyHash ??= hashSecret(crypto.randomBytes(16).toString('hex')));

/** Whether `secret` matches a `hashSecret` hash; false for a malformed hash. Compares in constant time. */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  const [scheme, n, r, p, salt, hash] = parts;
  const numbers = [n, r, p].map(Number);
  if (parts.length !== 6 || scheme !== 'scrypt' || !numbers.every((x) => Number.isInteger(x) && x > 0) || numbers[0] > 1 << 20) {
    await verifySecret(secret, await dummySecretHash());
    return false;
  }
  const expected = Buffer.from(hash, 'base64url');
  if (expected.length === 0) return false;
  const key = await scrypt(secret, Buffer.from(salt, 'base64url'), numbers[0], numbers[1], numbers[2], expected.length);
  return crypto.timingSafeEqual(key, expected);
}
