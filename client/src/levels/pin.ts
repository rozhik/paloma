import { sha256 } from './sha256.js';

/** A PIN as remembered in this browser: never the digits themselves. */
export interface PinRecord {
  /** Random, as hex */
  salt: string;
  /** SHA-256 of `salt:pin`, as hex */
  hash: string;
}

/** 4 to 8 digits. */
export const isValidPin = (pin: string): boolean => /^[0-9]{4,8}$/.test(pin);

const HEX = /^[0-9a-f]+$/;

/** Whether a stored value is a usable PIN record. */
export function isPinRecord(value: unknown): value is PinRecord {
  if (typeof value !== 'object' || value === null) return false;
  const { salt, hash } = value as Record<string, unknown>;
  return typeof salt === 'string' && salt.length >= 16 && HEX.test(salt)
    && typeof hash === 'string' && hash.length === 64 && HEX.test(hash);
}

export const hashPin = (pin: string, salt: string): string => sha256(`${salt}:${pin}`);

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A record for a new PIN, with a fresh salt. */
export function createPin(pin: string, salt: string = randomSalt()): PinRecord {
  return { salt, hash: hashPin(pin, salt) };
}

export const checkPin = (pin: string, record: PinRecord): boolean => hashPin(pin, record.salt) === record.hash;
