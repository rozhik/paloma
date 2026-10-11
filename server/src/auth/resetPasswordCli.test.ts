import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { openTestDatabase } from './testing.js';

let cleanup: () => void;

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_reset_cli_test_'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('reset-password', () => {
  it('sets a new password that the user must change', async () => {
    const users = await import('./users.js');
    const { resetPasswordOf } = await import('./resetPasswordCli.js');
    const { verifyPassword } = await import('./credentials.js');
    const anna = await users.createUser({ username: 'anna', roleId: 'admin', password: 'forgotten horse battery' });
    await users.clearMustChangePassword(anna.id);

    expect(await resetPasswordOf('ANNA', 'recovered horse battery')).toMatch(/Password of anna reset/);
    expect(await verifyPassword(anna.id, 'recovered horse battery')).toBe(true);
    expect((await users.findUserById(anna.id))!.mustChangePassword).toBe(true);
    await expect(resetPasswordOf('nobody', 'recovered horse battery')).rejects.toThrow('No user named nobody');
    await expect(resetPasswordOf('anna', 'short')).rejects.toMatchObject({ status: 400 });
  });
});
