import crypto from 'node:crypto';
import { countUsers } from './users.js';

// Letters and digits that are hard to mix up when read from a log
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 10;

let setupCode: string | null = null;

function newCode(): string {
  return Array.from(crypto.randomBytes(LENGTH), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

/**
 * When no user exists, makes a one-time setup code, logs it and returns it; it lives only in memory, so each
 * start logs a new one. Returns null once users exist.
 */
export async function prepareSetup(log: (message: string) => void = console.log): Promise<string | null> {
  if (await countUsers() > 0) {
    setupCode = null;
    return null;
  }
  if (!setupCode) {
    setupCode = newCode();
    log(`🔑 No users yet. Create the first administrator in the browser with the setup code: ${setupCode}`);
  }
  return setupCode;
}

/** Whether `code` is the current setup code; compared in constant time, ignoring case and spaces. */
export function checkSetupCode(code: unknown): boolean {
  if (!setupCode || typeof code !== 'string') return false;
  const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(code.replace(/\s+/g, '').toUpperCase()), digest(setupCode));
}

/** The setup code is used up once the first administrator exists. */
export function finishSetup(): void {
  setupCode = null;
}
