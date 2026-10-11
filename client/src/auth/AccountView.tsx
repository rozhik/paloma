import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, Form, InputGroup } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Copy, ImageUp, KeyRound, LogOut, Plus, Trash2, UserRound } from 'lucide-react';
import type { ApiTokenInfo, CreatedApiToken, MeResponse, Permission, QuotaInfo, SessionInfo } from '../../../shared/types.js';
import { createToken, fetchSessions, fetchTokens, removeAvatar, revokeSession, revokeToken, updateProfile, uploadAvatar } from '../api/auth.js';
import { initialsOf } from '../shell/userMenu.js';
import { describeError } from '../api/http.js';
import { fileSizeText } from '../components/viewer/infoFormat.js';
import { currentLanguage } from '../i18n/index.js';
import { useFormat } from '../i18n/format.js';
import { useAllows } from '../levels/controls.js';
import { PasswordForm } from './AuthPages.js';
import { useAuthStore } from './authStore.js';

/** How full a quota is: `full` at the limit, `nearly` from 90 %, else `ok`; `ok` without a limit. */
export function usageState(quota: Pick<QuotaInfo, 'effectiveLimit' | 'used'>): 'ok' | 'nearly' | 'full' {
  const { effectiveLimit, used = 0 } = quota;
  if (effectiveLimit === null) return 'ok';
  if (used >= effectiveLimit) return 'full';
  return used >= effectiveLimit * 0.9 ? 'nearly' : 'ok';
}

/** The export space line: `450 MB of 500 MB`, or how much is used without a limit. */
export const ExportUsage: React.FC<{ quota: QuotaInfo | undefined }> = ({ quota }) => {
  const { t, i18n } = useTranslation();
  if (!quota) return null;
  const used = fileSizeText(quota.used ?? 0, i18n.language);
  const state = usageState(quota);
  return (
    <span className="d-inline-flex align-items-center gap-2">
      <span>
        {quota.effectiveLimit === null
          ? t('account.exportUsageUnlimited', { used })
          : t('account.exportUsage', { used, limit: fileSizeText(quota.effectiveLimit, i18n.language) })}
      </span>
      {state !== 'ok' && (
        <Badge bg={state === 'full' ? 'danger' : 'warning'} text={state === 'full' ? undefined : 'dark'}>
          {t(state === 'full' ? 'account.full' : 'account.nearlyFull')}
        </Badge>
      )}
    </span>
  );
};

/** The permissions a new token may have: the user's own, in the server's order. */
export const tokenPermissionChoices = (me: Pick<MeResponse, 'permissions'>): Permission[] => me.permissions;

/** The user's picture with Upload and Remove; the linked person's face or the initials stand in for none. */
export const AvatarSection: React.FC<{ me: MeResponse }> = ({ me }) => {
  const { t } = useTranslation();
  const enter = useAuthStore((state) => state.enter);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const user = me.user!;
  const uploaded = user.avatarUrl?.startsWith('/api/users/') ?? false;

  const run = async (action: () => Promise<MeResponse>, done?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      enter(await action());
      if (done) setMessage({ ok: true, text: done });
    } catch (err) {
      setMessage({ ok: false, text: describeError(err, t) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-4" aria-labelledby="account-avatar">
      <h3 id="account-avatar" className="fs-4 fw-semibold mb-1">{t('account.avatar')}</h3>
      <p className="fs-5 text-secondary mb-2">{t('account.avatarHint')}</p>
      <div className="d-flex align-items-center gap-3 flex-wrap">
        <span className="user-menu-btn account-avatar" style={{ width: 96, height: 96, fontSize: '2rem' }} aria-hidden="true">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="user-menu-avatar" /> : initialsOf(user.displayName)}
        </span>
        <label className={`btn btn-primary btn-lg d-flex align-items-center gap-2 mb-0 ${busy ? 'disabled' : ''}`}>
          <ImageUp size={22} />
          <span>{t('account.uploadAvatar')}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="visually-hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void run(() => uploadAvatar(file, currentLanguage()), t('account.avatarSaved'));
            }}
          />
        </label>
        {uploaded && (
          <Button size="lg" variant="outline-danger" className="d-flex align-items-center gap-2" disabled={busy}
            onClick={() => void run(() => removeAvatar(currentLanguage()))}>
            <Trash2 size={22} />
            <span>{t('account.removeAvatar')}</span>
          </Button>
        )}
      </div>
      {message && <Alert variant={message.ok ? 'success' : 'danger'} className="fs-5 mt-2 mb-0" role={message.ok ? 'status' : 'alert'}>{message.text}</Alert>}
      <p className="fs-5 mt-3 mb-0">
        {user.personId ? t('account.person', { name: user.personName ?? t('people.unknown') }) : t('account.noPerson')}
      </p>
    </section>
  );
};

const ProfileForm: React.FC<{ me: MeResponse }> = ({ me }) => {
  const { t } = useTranslation();
  const enter = useAuthStore((state) => state.enter);
  const [name, setName] = useState(me.user?.displayName ?? '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      enter(await updateProfile(name, currentLanguage()));
      setMessage({ ok: true, text: t('account.nameSaved') });
    } catch (err) {
      setMessage({ ok: false, text: describeError(err, t) });
    }
  };

  return (
    <Form onSubmit={save} className="mb-3">
      <Form.Label htmlFor="account-name" className="fs-5">{t('account.displayName')}</Form.Label>
      <InputGroup size="lg" style={{ maxWidth: '520px' }}>
        <Form.Control id="account-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
        <Button type="submit" variant="outline-primary">{t('account.saveName')}</Button>
      </InputGroup>
      {message && <Alert variant={message.ok ? 'success' : 'danger'} className="fs-5 mt-2 mb-0" role="status">{message.text}</Alert>}
    </Form>
  );
};

const SessionsList: React.FC = () => {
  const { t } = useTranslation();
  const { formatDateTime } = useFormat();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetchSessions().then(setSessions, (err) => setError(describeError(err, t)));
  useEffect(() => { void load(); }, []);

  const revoke = async (session: SessionInfo) => {
    try {
      await revokeSession(session.id);
      if (session.current) await useAuthStore.getState().logout();
      else await load();
    } catch (err) {
      setError(describeError(err, t));
    }
  };

  return (
    <section className="mb-3" aria-labelledby="account-sessions">
      <h3 id="account-sessions" className="fs-4 fw-semibold mb-1">{t('account.sessions')}</h3>
      <p className="fs-5 text-secondary mb-2">{t('account.sessionsHint')}</p>
      {error && <Alert variant="danger" className="fs-5" dismissible onClose={() => setError(null)}>{error}</Alert>}
      <ul className="list-group mb-2">
        {sessions.map((session) => (
          <li key={session.id} className="list-group-item d-flex align-items-center gap-3 flex-wrap">
            <div className="flex-grow-1">
              <div className="fs-5 text-break">{session.userAgent ?? t('account.unknownDevice')}</div>
              <div className="text-secondary">
                {t('account.lastUsed', { date: formatDateTime(session.lastUsedAt) })}{session.ip ? ` · ${session.ip}` : ''}
              </div>
            </div>
            {session.current && <Badge bg="success" className="fs-6">{t('account.thisDevice')}</Badge>}
            <Button variant="outline-danger" onClick={() => void revoke(session)}>{t('account.logoutDevice')}</Button>
          </li>
        ))}
      </ul>
    </section>
  );
};

const TokensList: React.FC<{ me: MeResponse }> = ({ me }) => {
  const { t } = useTranslation();
  const { formatDate, formatDateTime } = useFormat();
  const [tokens, setTokens] = useState<ApiTokenInfo[]>([]);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<Permission[]>(['library.view']);
  const [expires, setExpires] = useState('');

  const load = () => fetchTokens().then(setTokens, (err) => setError(describeError(err, t)));
  useEffect(() => { void load(); }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const token = await createToken({ name, permissions, expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null });
      setCreated(token);
      setCopied(false);
      setName('');
      await load();
    } catch (err) {
      setError(describeError(err, t));
    }
  };

  const toggle = (permission: Permission) =>
    setPermissions((current) => (current.includes(permission) ? current.filter((p) => p !== permission) : [...current, permission]));

  return (
    <section className="mb-3" aria-labelledby="account-tokens">
      <h3 id="account-tokens" className="fs-4 fw-semibold mb-1">{t('account.tokens')}</h3>
      <p className="fs-5 text-secondary mb-2">{t('account.tokensHint')}</p>
      {error && <Alert variant="danger" className="fs-5" dismissible onClose={() => setError(null)}>{error}</Alert>}
      {created && (
        <Alert variant="success" className="fs-5" dismissible onClose={() => setCreated(null)}>
          <div className="mb-2">{t('account.tokenCreated')}</div>
          <InputGroup>
            <Form.Control readOnly value={created.value} className="font-monospace" aria-label={t('account.tokenName')} onFocus={(e) => e.target.select()} />
            <Button
              variant="outline-success"
              onClick={() => navigator.clipboard?.writeText(created.value).then(() => setCopied(true), () => setCopied(false))}
            >
              <Copy size={18} /> {copied ? t('account.copied') : t('account.copy')}
            </Button>
          </InputGroup>
        </Alert>
      )}
      {tokens.length === 0 && <p className="fs-5">{t('account.noTokens')}</p>}
      <ul className="list-group mb-3">
        {tokens.map((token) => (
          <li key={token.id} className="list-group-item d-flex align-items-center gap-3 flex-wrap">
            <div className="flex-grow-1">
              <div className="fs-5 fw-semibold">{token.name}</div>
              <div className="text-secondary">{token.permissions.join(', ')}</div>
              <div className="text-secondary">
                {token.lastUsedAt ? t('account.lastUsed', { date: formatDateTime(token.lastUsedAt) }) : t('account.tokenNeverUsed')}
                {' · '}
                {token.expiresAt ? t('account.tokenExpiresOn', { date: formatDate(token.expiresAt) }) : t('account.tokenNoExpiry')}
              </div>
            </div>
            <Button variant="outline-danger" onClick={() => revokeToken(token.id).then(load, (err) => setError(describeError(err, t)))}>
              {t('account.revokeToken')}
            </Button>
          </li>
        ))}
      </ul>
      <Form onSubmit={create} className="card card-body">
        <Form.Group className="mb-2" controlId="token-name">
          <Form.Label className="fs-5">{t('account.tokenName')}</Form.Label>
          <Form.Control size="lg" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
        </Form.Group>
        <fieldset className="mb-2">
          <legend className="fs-5">{t('account.tokenPermissions')}</legend>
          {tokenPermissionChoices(me).map((permission) => (
            <Form.Check
              key={permission}
              id={`token-permission-${permission}`}
              type="checkbox"
              className="fs-5"
              label={permission}
              checked={permissions.includes(permission)}
              onChange={() => toggle(permission)}
            />
          ))}
        </fieldset>
        <Form.Group className="mb-3" controlId="token-expires">
          <Form.Label className="fs-5">{t('account.tokenExpires')}</Form.Label>
          <Form.Control size="lg" type="date" value={expires} onChange={(event) => setExpires(event.target.value)} style={{ maxWidth: '260px' }} />
          <Form.Text className="fs-6">{t('account.tokenExpiresHint')}</Form.Text>
        </Form.Group>
        <Button type="submit" size="lg" className="align-self-start d-flex align-items-center gap-2" disabled={permissions.length === 0}>
          <Plus size={20} />
          <span>{t('account.createToken')}</span>
        </Button>
      </Form>
    </section>
  );
};

/** The Account view, opened from the user menu when users are on: who is logged in, password, devices, tokens, Log out. */
export const AccountView: React.FC = () => {
  const { t } = useTranslation();
  const me = useAuthStore((state) => state.me);
  const logout = useAuthStore((state) => state.logout);
  const showTokens = useAllows('account.tokens');
  const [passwordChanged, setPasswordChanged] = useState(false);
  if (!me?.user) return null;
  const { user } = me;

  return (
    <main className="flex-grow-1 pal-page overflow-auto p-4">
      <div className="mx-auto" style={{ maxWidth: '900px' }}>
        <h2 className="fw-bold d-flex align-items-center gap-2 mb-2">
          <UserRound size={30} aria-hidden="true" />
          <span>{t('account.title')}</span>
        </h2>
        <p className="fs-5 mb-3">{t('account.loggedInAs', { name: user.displayName, username: user.username, role: user.roleName })}</p>
        <Button size="lg" variant="outline-secondary" className="d-flex align-items-center gap-2 mb-4" onClick={() => void logout()}>
          <LogOut size={22} />
          <span>{t('auth.logout')}</span>
        </Button>

        <AvatarSection me={me} />
        <ProfileForm me={me} />

        <h3 className="fs-4 fw-semibold mb-2 d-flex align-items-center gap-2"><KeyRound size={22} />{t('account.changePassword')}</h3>
        {passwordChanged && <Alert variant="success" className="fs-5" role="status">{t('account.passwordChanged')}</Alert>}
        <div className="mb-4" style={{ maxWidth: '520px' }}>
          <PasswordForm onDone={() => setPasswordChanged(true)} />
        </div>

        <p className="fs-5 mb-4">
          <span className="fw-semibold">{t('account.exportSpace')}: </span>
          <ExportUsage quota={me.quotas.find((quota) => quota.kind === 'export_bytes')} />
        </p>

        <SessionsList />
        {showTokens && <TokensList me={me} />}
      </div>
    </main>
  );
};
