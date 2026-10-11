/** Failed logins for one key allowed within the window before logins for that key are refused */
export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

/**
 * Slows down guessing: after `MAX_FAILURES` failed logins for the same key (a lowercase username) within
 * `WINDOW_MS`, logins for it are refused for `WINDOW_MS`, even with the right password. Kept in memory, so a
 * restart resets it.
 */
export class LoginThrottle {
  private failures = new Map<string, number[]>();
  private blockedUntil = new Map<string, number>();

  /** Seconds to wait before the key may log in again, or 0. */
  retryAfter(key: string, now = Date.now()): number {
    const until = this.blockedUntil.get(key);
    if (until === undefined) return 0;
    if (until <= now) {
      this.blockedUntil.delete(key);
      return 0;
    }
    return Math.ceil((until - now) / 1000);
  }

  recordFailure(key: string, now = Date.now()): void {
    const recent = (this.failures.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
    recent.push(now);
    if (recent.length >= MAX_FAILURES) {
      this.blockedUntil.set(key, now + WINDOW_MS);
      this.failures.delete(key);
    } else {
      this.failures.set(key, recent);
    }
  }

  recordSuccess(key: string): void {
    this.failures.delete(key);
    this.blockedUntil.delete(key);
  }
}

export const loginThrottle = new LoginThrottle();
