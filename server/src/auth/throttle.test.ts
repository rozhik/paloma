import { describe, it, expect } from 'vitest';
import { LoginThrottle, MAX_FAILURES, WINDOW_MS } from './throttle.js';

describe('LoginThrottle', () => {
  it('refuses a username for 15 minutes after 10 failures within 15 minutes', () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES - 1; i++) throttle.recordFailure('anna', i * 1000);
    expect(throttle.retryAfter('anna', 9000)).toBe(0);
    throttle.recordFailure('anna', 10_000);
    expect(throttle.retryAfter('anna', 10_000)).toBe(WINDOW_MS / 1000);
    expect(throttle.retryAfter('anna', 10_000 + WINDOW_MS - 1500)).toBe(2);
    expect(throttle.retryAfter('anna', 10_000 + WINDOW_MS)).toBe(0);
    // Other usernames are not affected
    expect(throttle.retryAfter('ben', 10_000)).toBe(0);
  });

  it('forgets failures older than the window', () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES - 1; i++) throttle.recordFailure('anna', 0);
    throttle.recordFailure('anna', WINDOW_MS + 1);
    expect(throttle.retryAfter('anna', WINDOW_MS + 1)).toBe(0);
  });

  it('resets the count after a successful login', () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES - 1; i++) throttle.recordFailure('anna', 0);
    throttle.recordSuccess('anna');
    throttle.recordFailure('anna', 1);
    expect(throttle.retryAfter('anna', 1)).toBe(0);
  });
});
