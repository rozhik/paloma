import { fail } from '../services/apiError.js';

export const MIN_PASSWORD_LENGTH = 8;

/** Throws 400 `password_too_short` for a password the rules do not allow. */
export function checkPassword(password: unknown, field = 'password'): string {
  if (typeof password !== 'string') fail(400, 'invalid_field', `${field} must be text`, { field });
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    fail(400, 'password_too_short', `Passwords need at least ${MIN_PASSWORD_LENGTH} characters`, { min: MIN_PASSWORD_LENGTH });
  }
  return password;
}

/** Sets or checks passwords for core; implemented by the auth provider registry once plugins are loaded. */
export interface PasswordBackend {
  /** Stores a new password; throws when no enabled login provider supports passwords */
  set(userId: string, password: string): Promise<void>;
  /** Whether `password` is the user's current one */
  verify(userId: string, password: string): Promise<boolean>;
}

let backend: PasswordBackend | null = null;

export function setPasswordBackend(next: PasswordBackend | null): void {
  backend = next;
}

function current(): PasswordBackend {
  if (!backend) fail(409, 'password_unsupported', 'No enabled login provider supports passwords');
  return backend;
}

/** Checks the rules and stores the password through the enabled login provider. */
export async function setPassword(userId: string, password: unknown): Promise<void> {
  await current().set(userId, checkPassword(password));
}

export async function verifyPassword(userId: string, password: unknown): Promise<boolean> {
  return typeof password === 'string' && current().verify(userId, password);
}
