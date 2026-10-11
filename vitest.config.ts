import { defineConfig } from 'vitest/config';

// Tests do not depend on the developer's .env: dotenv never overrides variables that are already set, so these
// keep the defaults (users off) unless a test sets them itself with vi.stubEnv
export default defineConfig({
  test: {
    env: {
      PALOMA_AUTH: 'off',
      PALOMA_CLIENT_ORIGIN: '',
      PALOMA_SESSION_DAYS: '',
      PALOMA_RATE_LIMIT: '',
    },
  },
});
