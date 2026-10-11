import { and, eq } from 'drizzle-orm';
import type { AuthProviderInfo, Permission } from '../../../shared/types.js';
import { db } from '../db/index.js';
import { get, run } from '../db/query.js';
import { userIdentities } from '../db/schema.js';
import type { AuthContext, CredentialsProviderDefinition } from '../plugins/api.js';
import { pluginRegistry } from '../plugins/index.js';
import { authProviderInfo, type RegisteredAuthProvider } from '../plugins/registry.js';
import { fail } from '../services/apiError.js';
import { setPasswordBackend, type PasswordBackend } from './credentials.js';
import { hashSecret, verifySecret } from './secrets.js';
import { verifyApiToken } from './tokens.js';
import { findUserById, findUserByUsername } from './users.js';

/** The context Paloma gives a provider on each call; its identity store is namespaced by the provider id. */
export function authContextFor(providerId: string): AuthContext {
  return {
    findUserByUsername: async (username) => {
      const user = typeof username === 'string' ? await findUserByUsername(username) : undefined;
      return user && { id: user.id, username: user.username, enabled: user.enabled };
    },
    identities: {
      get: async (userId) => {
        const row = await get(db.select().from(userIdentities)
          .where(and(eq(userIdentities.providerId, providerId), eq(userIdentities.userId, userId))));
        return row ? JSON.parse(row.data) as unknown : undefined;
      },
      set: async (userId, data) => {
        const json = JSON.stringify(data);
        await run(db.insert(userIdentities).values({ providerId, userId, data: json })
          .onConflictDoUpdate({ target: [userIdentities.providerId, userIdentities.userId], set: { data: json } }));
      },
    },
    verifyApiToken: (value) => verifyApiToken(value),
    hashSecret,
    verifySecret,
  };
}

/** The `credentials` providers of active plugins, as the login page offers them. */
export async function loginProviders(): Promise<RegisteredAuthProvider[]> {
  await pluginRegistry.init();
  return pluginRegistry.getAuthProviders().filter((provider) => provider.definition.kind === 'credentials');
}

export async function loginProviderInfos(lang: string): Promise<AuthProviderInfo[]> {
  return (await loginProviders()).map((provider) => authProviderInfo(provider.definition, lang));
}

/** Whether a user exists and may log in. */
async function enabledUser(userId: unknown): Promise<string | null> {
  if (typeof userId !== 'string') return null;
  const user = await findUserById(userId);
  return user?.enabled ? user.id : null;
}

/**
 * Logs in with a `credentials` provider: the id of the enabled user the provider names, or null. A provider
 * that throws counts as a failed login. Throws 404 for an unknown or inactive provider.
 */
export async function loginWith(providerId: string, input: Record<string, string>): Promise<string | null> {
  await pluginRegistry.init();
  const provider = pluginRegistry.getAuthProvider(providerId);
  if (!provider || provider.definition.kind !== 'credentials') {
    fail(404, 'provider_not_found', `Login provider ${providerId} not found`, { id: providerId });
  }
  try {
    const result = await provider.definition.login(input, authContextFor(providerId));
    return enabledUser(result?.userId);
  } catch (err) {
    console.error(`Auth provider ${providerId} failed:`, err);
    return null;
  }
}

/** The user a bearer credential belongs to, asking each active `bearer` provider in turn. */
export async function authenticateBearer(credential: string): Promise<{ userId: string; tokenId?: string; permissions?: Permission[] } | null> {
  await pluginRegistry.init();
  for (const provider of pluginRegistry.getAuthProviders()) {
    if (provider.definition.kind !== 'bearer') continue;
    try {
      const result = await provider.definition.authenticate(credential, authContextFor(provider.definition.id));
      if (!result) continue;
      const userId = await enabledUser(result.userId);
      if (!userId) return null;
      return {
        userId,
        ...(typeof result.tokenId === 'string' ? { tokenId: result.tokenId } : {}),
        ...(Array.isArray(result.permissions) ? { permissions: result.permissions } : {}),
      };
    } catch (err) {
      console.error(`Auth provider ${provider.definition.id} failed:`, err);
    }
  }
  return null;
}

type PasswordProvider = RegisteredAuthProvider & { definition: CredentialsProviderDefinition & Required<Pick<CredentialsProviderDefinition, 'setSecret' | 'checkSecret'>> };

/** The active provider that stores passwords: `password` when it is active, else the first one that can. */
async function passwordProvider(): Promise<PasswordProvider> {
  const candidates = (await loginProviders()).filter((provider): provider is PasswordProvider =>
    provider.definition.kind === 'credentials' && typeof provider.definition.setSecret === 'function');
  const provider = candidates.find((candidate) => candidate.definition.id === 'password') ?? candidates[0];
  if (!provider) fail(409, 'password_unsupported', 'No enabled login provider supports passwords');
  return provider;
}

/** Passwords through the plugins' providers; installed when this module is loaded. */
export const providerPasswordBackend: PasswordBackend = {
  async set(userId, password) {
    const provider = await passwordProvider();
    await provider.definition.setSecret(userId, password, authContextFor(provider.definition.id));
  },
  async verify(userId, password) {
    const provider = await passwordProvider();
    return provider.definition.checkSecret(userId, password, authContextFor(provider.definition.id));
  },
};

setPasswordBackend(providerPasswordBackend);
