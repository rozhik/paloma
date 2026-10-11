// @ts-check
/**
 * Bundled plugin: personal API tokens sent as `Authorization: Bearer pal_…`. Paloma stores the tokens and lets
 * users create and revoke them; this provider only accepts them, so switching it off stops every token
 * without deleting any.
 * @typedef {import('../../server/src/plugins/api.js').PluginContributions} PluginContributions
 */

const LABEL = {
  en: 'API token', 'zh-Hans': 'API 令牌', es: 'Token de API', ar: 'رمز API', 'pt-BR': 'Token de API', fr: 'Jeton d’API',
  de: 'API-Token', ja: 'API トークン', ru: 'API-токен', id: 'Token API', uk: 'API-токен',
};

/** @returns {PluginContributions} */
export function activate() {
  return {
    authProviders: [{
      id: 'token',
      kind: 'bearer',
      label: LABEL,
      async authenticate(credential, ctx) {
        if (!credential.startsWith('pal_')) return null;
        const token = await ctx.verifyApiToken(credential);
        return token && { userId: token.userId, tokenId: token.tokenId, permissions: token.permissions };
      },
    }],
  };
}
