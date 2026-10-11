// @ts-check
/**
 * Bundled plugin: log in with a username and password. The password is kept only as a salted scrypt hash in
 * this provider's identity record; Paloma owns the users and sessions.
 * @typedef {import('../../server/src/plugins/api.js').PluginContributions} PluginContributions
 * @typedef {import('../../server/src/plugins/api.js').AuthContext} AuthContext
 */

const LABELS = {
  provider: {
    en: 'Password', 'zh-Hans': '密码', es: 'Contraseña', ar: 'كلمة المرور', 'pt-BR': 'Senha', fr: 'Mot de passe',
    de: 'Passwort', ja: 'パスワード', ru: 'Пароль', id: 'Kata sandi', uk: 'Пароль',
  },
  username: {
    en: 'Username', 'zh-Hans': '用户名', es: 'Nombre de usuario', ar: 'اسم المستخدم', 'pt-BR': 'Nome de usuário',
    fr: 'Nom d’utilisateur', de: 'Benutzername', ja: 'ユーザー名', ru: 'Имя пользователя', id: 'Nama pengguna', uk: 'Імʼя користувача',
  },
  password: {
    en: 'Password', 'zh-Hans': '密码', es: 'Contraseña', ar: 'كلمة المرور', 'pt-BR': 'Senha', fr: 'Mot de passe',
    de: 'Passwort', ja: 'パスワード', ru: 'Пароль', id: 'Kata sandi', uk: 'Пароль',
  },
};

/**
 * The stored hash of a user's password, if any.
 * @param {AuthContext} ctx
 * @param {string} userId
 * @returns {Promise<string | undefined>}
 */
async function storedHash(ctx, userId) {
  const data = /** @type {{ hash?: unknown } | undefined} */ (await ctx.identities.get(userId));
  return typeof data?.hash === 'string' ? data.hash : undefined;
}

/**
 * @param {AuthContext} ctx
 * @param {string} secret
 * @param {string | undefined} hash
 */
async function matches(ctx, secret, hash) {
  // Without a hash, verify against an invalid one anyway: Paloma then hashes a dummy, so the answer takes as long
  return ctx.verifySecret(secret, hash ?? 'none');
}

/** @returns {PluginContributions} */
export function activate() {
  return {
    authProviders: [{
      id: 'password',
      kind: 'credentials',
      label: LABELS.provider,
      fields: [
        { name: 'username', label: LABELS.username, type: 'text' },
        { name: 'password', label: LABELS.password, type: 'password' },
      ],
      async login(input, ctx) {
        const username = typeof input.username === 'string' ? input.username : '';
        const password = typeof input.password === 'string' ? input.password : '';
        const user = username ? await ctx.findUserByUsername(username) : undefined;
        const ok = await matches(ctx, password, user && await storedHash(ctx, user.id));
        // Paloma checks again that the user exists and is enabled, and answers the same either way
        return ok && user ? { userId: user.id } : null;
      },
      async setSecret(userId, secret, ctx) {
        await ctx.identities.set(userId, { hash: await ctx.hashSecret(secret) });
      },
      async checkSecret(userId, secret, ctx) {
        return matches(ctx, secret, await storedHash(ctx, userId));
      },
    }],
  };
}
