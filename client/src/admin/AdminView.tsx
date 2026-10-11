import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Tab, Tabs } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import type {
  ApiTokenInfo, Permission, PermissionInfo, PluginInfo, RoleInfo, SessionInfo, UserInfo,
} from '../../../shared/types.js';
import {
  createRole, createUser, deleteRole, deleteUser, fetchAllSessions, fetchAllTokens, fetchPermissions, fetchRoles, fetchUsers,
  removeUserAvatar, resetUserPassword, revokeAnySession, revokeAnyToken, updateRole, updateUser,
} from '../api/auth.js';
import { fetchPlugins } from '../api/plugins.js';
import { describeError } from '../api/http.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { currentLanguage } from '../i18n/index.js';
import { useFormat } from '../i18n/format.js';
import { useFolderTree } from '../shell/useFolderTree.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useAuthStore } from '../auth/authStore.js';
import { ExportUsage } from '../auth/AccountView.js';
import { PersonPicker } from '../people/PersonPicker.js';
import { initialsOf } from '../shell/userMenu.js';
import { emptyUserForm, formFromUser, toggled, userInputFromForm, type UserForm } from './userForm.js';

type Feedback = { ok: boolean; text: string } | null;

const FeedbackAlert: React.FC<{ feedback: Feedback; onClose: () => void }> = ({ feedback, onClose }) =>
  feedback && (
    <Alert variant={feedback.ok ? 'success' : 'danger'} className="fs-5" dismissible onClose={onClose} role={feedback.ok ? 'status' : 'alert'}>
      {feedback.text}
    </Alert>
  );

/** Whole library, or folders and albums to tick. */
const AccessEditor: React.FC<{ form: UserForm; setForm: (form: UserForm) => void; adminRole: boolean }> = ({ form, setForm, adminRole }) => {
  const { t } = useTranslation();
  const { folders, albums } = useFolderTree();
  if (adminRole) return <p className="fs-5 text-secondary">{t('admin.access.adminAll')}</p>;
  return (
    <>
      <Form.Check type="radio" id="access-all" name="access" className="fs-5" label={t('admin.access.all')}
        checked={form.accessAll} onChange={() => setForm({ ...form, accessAll: true })} />
      <Form.Check type="radio" id="access-limited" name="access" className="fs-5 mb-2" label={t('admin.access.limited')}
        checked={!form.accessAll} onChange={() => setForm({ ...form, accessAll: false })} />
      {!form.accessAll && (
        <div className="ms-4">
          {form.folders.length === 0 && form.albums.length === 0 && <Alert variant="warning" className="fs-6">{t('admin.access.noneChosen')}</Alert>}
          <div className="fw-semibold fs-5">{t('admin.access.folders')}</div>
          <div className="mb-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {folders.map((folder) => (
              <Form.Check key={folder.id} id={`access-folder-${folder.id}`} type="checkbox" label={folder.path}
                checked={form.folders.includes(folder.path)} onChange={() => setForm({ ...form, folders: toggled(form.folders, folder.path) })} />
            ))}
          </div>
          <div className="fw-semibold fs-5">{t('admin.access.albums')}</div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {albums.map((album) => (
              <Form.Check key={album.token} id={`access-album-${album.token}`} type="checkbox" label={album.name ?? t('common.untitled')}
                checked={form.albums.includes(album.token)} onChange={() => setForm({ ...form, albums: toggled(form.albums, album.token) })} />
            ))}
          </div>
        </div>
      )}
    </>
  );
};

/** Creating or changing a user: name, role, password (new users), access and quotas. */
const UserEditor: React.FC<{
  user: UserInfo | 'new'; roles: RoleInfo[]; onSaved: () => void; onCancel: () => void;
}> = ({ user, roles, onSaved, onCancel }) => {
  const { t } = useTranslation();
  const isNew = user === 'new';
  const [form, setForm] = useState<UserForm>(isNew ? emptyUserForm() : formFromUser(user));
  const [error, setError] = useState<string | null>(null);
  const [pickingPerson, setPickingPerson] = useState(false);
  const adminRole = roles.find((role) => role.id === form.roleId)?.permissions.includes('users.manage') ?? false;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = userInputFromForm(form, isNew);
    if ('invalid' in result) return setError(t('errors.invalid_field', { field: t(result.invalid === 'rate' ? 'admin.quotas.rate' : 'admin.quotas.exportSpace') }));
    try {
      if (isNew) await createUser(result.input);
      else await updateUser(user.id, result.input);
      onSaved();
    } catch (err) {
      setError(describeError(err, t));
    }
  };

  return (
    <Modal show onHide={onCancel} size="lg" centered>
      <Form onSubmit={save}>
        <Modal.Header closeButton>
          <Modal.Title>{isNew ? t('admin.users.newUser') : t('admin.users.editUser', { username: user.username })}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="fs-5">
          {isNew && (
            <Form.Group className="mb-3" controlId="user-username">
              <Form.Label>{t('admin.users.username')}</Form.Label>
              <Form.Control size="lg" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required autoComplete="off" />
              <Form.Text>{t('auth.usernameHint')}</Form.Text>
            </Form.Group>
          )}
          <Form.Group className="mb-3" controlId="user-name">
            <Form.Label>{t('admin.users.displayName')}</Form.Label>
            <Form.Control size="lg" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </Form.Group>
          <Form.Group className="mb-3" controlId="user-role">
            <Form.Label>{t('admin.users.role')}</Form.Label>
            <Form.Select size="lg" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </Form.Select>
          </Form.Group>
          <div className="mb-3">
            <div className="form-label">{t('admin.users.person')}</div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="fs-5 me-2">{form.personId ? form.personName ?? t('people.unknown') : t('admin.users.noPerson')}</span>
              <Button variant="outline-primary" onClick={() => setPickingPerson(true)}>{t('admin.users.choosePerson')}</Button>
              {form.personId && (
                <Button variant="outline-secondary" onClick={() => setForm({ ...form, personId: null, personName: null })}>{t('admin.users.unlinkPerson')}</Button>
              )}
            </div>
            <PersonPicker
              show={pickingPerson}
              title={t('admin.users.choosePerson')}
              onHide={() => setPickingPerson(false)}
              onPick={(personId, name) => setForm({ ...form, personId, personName: name })}
            />
          </div>
          {isNew && (
            <Form.Group className="mb-3" controlId="user-password">
              <Form.Label>{t('admin.users.initialPassword')}</Form.Label>
              <Form.Control size="lg" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="off" />
              <Form.Text>{t('admin.users.initialPasswordHint')}</Form.Text>
            </Form.Group>
          )}
          <fieldset className="mb-3">
            <legend className="fs-4 fw-semibold">{t('admin.access.title')}</legend>
            <AccessEditor form={form} setForm={setForm} adminRole={adminRole} />
          </fieldset>
          <fieldset>
            <legend className="fs-4 fw-semibold">{t('admin.quotas.title')}</legend>
            <Form.Group className="mb-2" controlId="user-export">
              <Form.Label>{t('admin.quotas.exportSpace')} ({t('admin.quotas.megabytes')})</Form.Label>
              <Form.Control size="lg" inputMode="decimal" value={form.exportMb} onChange={(e) => setForm({ ...form, exportMb: e.target.value })} style={{ maxWidth: '220px' }} />
              <Form.Text>{t('admin.quotas.exportHint')}</Form.Text>
            </Form.Group>
            <Form.Group controlId="user-rate">
              <Form.Label>{t('admin.quotas.rate')}</Form.Label>
              <Form.Control size="lg" inputMode="numeric" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} style={{ maxWidth: '220px' }} />
              <Form.Text>{t('admin.quotas.rateHint')}</Form.Text>
            </Form.Group>
          </fieldset>
          {error && <Alert variant="danger" className="mt-3 mb-0" role="alert">{error}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="submit">{t('common.save')}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

const ResetPasswordDialog: React.FC<{ user: UserInfo; onDone: (message: string) => void; onCancel: () => void }> = ({ user, onDone, onCancel }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await resetUserPassword(user.id, password);
      onDone(t('admin.users.passwordReset', { username: user.username }));
    } catch (err) {
      setError(describeError(err, t));
    }
  };
  return (
    <Modal show onHide={onCancel} centered>
      <Form onSubmit={save}>
        <Modal.Header closeButton><Modal.Title>{t('admin.users.resetPassword')}</Modal.Title></Modal.Header>
        <Modal.Body className="fs-5">
          <p>{t('admin.users.resetHint', { username: user.username })}</p>
          <Form.Group controlId="reset-password">
            <Form.Label>{t('admin.users.newPassword')}</Form.Label>
            <Form.Control size="lg" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" />
            <Form.Text>{t('auth.passwordHint')}</Form.Text>
          </Form.Group>
          {error && <Alert variant="danger" className="mt-3 mb-0" role="alert">{error}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="submit">{t('admin.users.resetPassword')}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

const UsersSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { formatDateTime } = useFormat();
  const me = useAuthStore((state) => state.me);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [editing, setEditing] = useState<UserInfo | 'new' | null>(null);
  const [resetting, setResetting] = useState<UserInfo | null>(null);
  const [deleting, setDeleting] = useState<UserInfo | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const fail = (err: unknown) => setFeedback({ ok: false, text: describeError(err, t) });

  const load = async () => {
    try {
      const [userList, roleList] = await Promise.all([fetchUsers(), fetchRoles(currentLanguage())]);
      setUsers(userList);
      setRoles(roleList);
    } catch (err) {
      fail(err);
    }
  };
  useEffect(() => { void load(); }, [i18n.language]);

  const roleName = (id: string) => roles.find((role) => role.id === id)?.name ?? id;

  // The server refuses what it must (e.g. the last administrator); the list keeps showing what is stored
  const setEnabled = (user: UserInfo, enabled: boolean) => updateUser(user.id, { enabled }).then(load, fail);

  return (
    <>
      <FeedbackAlert feedback={feedback} onClose={() => setFeedback(null)} />
      <Button size="lg" className="d-flex align-items-center gap-2 mb-3" onClick={() => { setFeedback(null); setEditing('new'); }}>
        <UserPlus size={22} /><span>{t('admin.users.add')}</span>
      </Button>
      <div className="d-flex flex-column gap-3">
        {users.map((user) => {
          const self = user.id === me?.user?.id;
          return (
            <div key={user.id} className="card shadow-sm">
              <div className="card-body d-flex flex-wrap align-items-start gap-3">
                <span className="user-menu-btn flex-shrink-0" style={{ width: 56, height: 56 }} aria-hidden="true">
                  {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="user-menu-avatar" /> : initialsOf(user.displayName)}
                </span>
                <div className="flex-grow-1">
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <h4 className="fw-bold mb-0">{user.displayName}</h4>
                    <span className="text-secondary fs-5">{user.username}{self ? ` (${t('admin.users.you')})` : ''}</span>
                    <Badge bg="secondary" className="fs-6">{roleName(user.roleId)}</Badge>
                    <Badge bg={user.enabled ? 'success' : 'danger'} className="fs-6">
                      {user.enabled ? t('admin.users.enabled') : t('admin.users.disabled')}
                    </Badge>
                    {user.mustChangePassword && <Badge bg="warning" text="dark" className="fs-6">{t('admin.users.mustChangePassword')}</Badge>}
                  </div>
                  {user.personId && <div className="fs-5">{t('admin.users.linkedWith', { name: user.personName ?? t('people.unknown') })}</div>}
                  <div className="text-secondary fs-5">
                    {t('admin.users.lastLogin')}: {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t('admin.users.neverLoggedIn')}
                  </div>
                  <div className="fs-5">
                    {t('admin.users.exportSpace')}: <ExportUsage quota={user.quotas.find((q) => q.kind === 'export_bytes')} />
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <Button variant="outline-primary" onClick={() => { setFeedback(null); setEditing(user); }}><Pencil size={18} /> {t('admin.users.edit')}</Button>
                  <Button variant="outline-primary" onClick={() => setResetting(user)}><KeyRound size={18} /> {t('admin.users.resetPassword')}</Button>
                  {user.avatarUrl?.startsWith('/api/users/') && (
                    <Button variant="outline-secondary" onClick={() => removeUserAvatar(user.id).then(load, fail)}>{t('admin.users.removeAvatar')}</Button>
                  )}
                  <Button variant="outline-secondary" onClick={() => void setEnabled(user, !user.enabled)}>
                    {user.enabled ? t('admin.users.disable') : t('admin.users.enable')}
                  </Button>
                  <Button variant="outline-danger" onClick={() => setDeleting(user)}><Trash2 size={18} /> {t('admin.users.delete')}</Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {editing && (
        <UserEditor user={editing} roles={roles}
          onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      )}
      {resetting && (
        <ResetPasswordDialog user={resetting} onCancel={() => setResetting(null)}
          onDone={(text) => { setResetting(null); setFeedback({ ok: true, text }); void load(); }} />
      )}
      <ConfirmModal
        show={deleting !== null}
        title={t('admin.users.delete')}
        body={deleting ? t('admin.users.deleteConfirm', { username: deleting.username }) : ''}
        confirmLabel={t('admin.users.delete')}
        variant="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => { const user = deleting!; setDeleting(null); deleteUser(user.id).then(load, fail); }}
      />
    </>
  );
};

const RoleEditor: React.FC<{ role: RoleInfo | 'new'; permissions: PermissionInfo[]; onSaved: () => void; onCancel: () => void }> = ({
  role, permissions, onSaved, onCancel,
}) => {
  const { t } = useTranslation();
  const isNew = role === 'new';
  const [name, setName] = useState(isNew ? '' : role.name);
  const [description, setDescription] = useState(isNew ? '' : role.description);
  const [granted, setGranted] = useState<Permission[]>(isNew ? ['library.view'] : role.permissions);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const body = { name, description, permissions: granted };
      if (isNew) await createRole(body, currentLanguage());
      else await updateRole(role.id, body, currentLanguage());
      onSaved();
    } catch (err) {
      setError(describeError(err, t));
    }
  };
  return (
    <Modal show onHide={onCancel} centered size="lg">
      <Form onSubmit={save}>
        <Modal.Header closeButton>
          <Modal.Title>{isNew ? t('admin.roles.newRole') : t('admin.roles.editRole', { name: role.name })}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="fs-5">
          <Form.Group className="mb-3" controlId="role-name">
            <Form.Label>{t('admin.roles.name')}</Form.Label>
            <Form.Control size="lg" value={name} onChange={(e) => setName(e.target.value)} required maxLength={64} />
          </Form.Group>
          <Form.Group className="mb-3" controlId="role-description">
            <Form.Label>{t('admin.roles.description')}</Form.Label>
            <Form.Control as="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </Form.Group>
          <fieldset>
            <legend className="fs-4 fw-semibold">{t('admin.roles.permissions')}</legend>
            {permissions.map((permission) => (
              <Form.Check key={permission.id} id={`role-permission-${permission.id}`} type="checkbox" className="mb-2"
                checked={granted.includes(permission.id)} onChange={() => setGranted(toggled(granted, permission.id))}
                label={<><span className="fw-semibold">{permission.label}</span><span className="d-block text-secondary fs-6">{permission.description}</span></>}
              />
            ))}
          </fieldset>
          {error && <Alert variant="danger" className="mt-3 mb-0" role="alert">{error}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="submit">{t('common.save')}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

const RolesSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);
  const [editing, setEditing] = useState<RoleInfo | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoleInfo | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const fail = (err: unknown) => setFeedback({ ok: false, text: describeError(err, t) });

  const load = async () => {
    try {
      const [roleList, permissionList] = await Promise.all([fetchRoles(currentLanguage()), fetchPermissions(currentLanguage())]);
      setRoles(roleList);
      setPermissions(permissionList);
    } catch (err) {
      fail(err);
    }
  };
  useEffect(() => { void load(); }, [i18n.language]);
  const label = (id: Permission) => permissions.find((p) => p.id === id)?.label ?? id;

  return (
    <>
      <FeedbackAlert feedback={feedback} onClose={() => setFeedback(null)} />
      <Button size="lg" className="d-flex align-items-center gap-2 mb-3" onClick={() => { setFeedback(null); setEditing('new'); }}>
        <Plus size={22} /><span>{t('admin.roles.add')}</span>
      </Button>
      <div className="d-flex flex-column gap-3">
        {roles.map((role) => (
          <div key={role.id} className="card shadow-sm">
            <div className="card-body d-flex flex-wrap align-items-start gap-3">
              <div className="flex-grow-1">
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <h4 className="fw-bold mb-0">{role.name}</h4>
                  {role.builtIn && <Badge bg="secondary" className="fs-6">{t('admin.roles.builtIn')}</Badge>}
                  <span className="text-secondary fs-5">{t('admin.roles.userCount', { users: role.userCount ?? 0 })}</span>
                </div>
                {role.description && <p className="fs-5 mb-1">{role.description}</p>}
                <div className="d-flex flex-wrap gap-1">
                  {role.permissions.map((permission) => <Badge key={permission} bg="light" text="dark" className="fs-6 border">{label(permission)}</Badge>)}
                </div>
              </div>
              {!role.builtIn && (
                <div className="d-flex gap-2">
                  <Button variant="outline-primary" onClick={() => { setFeedback(null); setEditing(role); }}><Pencil size={18} /> {t('admin.roles.edit')}</Button>
                  <Button variant="outline-danger" onClick={() => setDeleting(role)}><Trash2 size={18} /> {t('admin.roles.delete')}</Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <RoleEditor role={editing} permissions={permissions} onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }} />
      )}
      <ConfirmModal
        show={deleting !== null}
        title={t('admin.roles.delete')}
        body={deleting ? t('admin.roles.deleteConfirm', { name: deleting.name }) : ''}
        confirmLabel={t('admin.roles.delete')}
        variant="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => { const role = deleting!; setDeleting(null); deleteRole(role.id).then(load, fail); }}
      />
    </>
  );
};

const SessionsTokensSection: React.FC = () => {
  const { t } = useTranslation();
  const { formatDate, formatDateTime } = useFormat();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [tokens, setTokens] = useState<ApiTokenInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fail = (err: unknown) => setError(describeError(err, t));
  const load = () => Promise.all([fetchAllSessions(), fetchAllTokens()]).then(([s, k]) => { setSessions(s); setTokens(k); }, fail);
  useEffect(() => { void load(); }, []);

  return (
    <>
      {error && <Alert variant="danger" className="fs-5" dismissible onClose={() => setError(null)}>{error}</Alert>}
      <h4 className="fs-4 fw-semibold">{t('admin.sessions.sessions')}</h4>
      {sessions.length === 0 && <p className="fs-5">{t('admin.sessions.none')}</p>}
      <ul className="list-group mb-4">
        {sessions.map((session) => (
          <li key={session.id} className="list-group-item d-flex flex-wrap align-items-center gap-3">
            <div className="flex-grow-1">
              <div className="fs-5 fw-semibold">{session.username}</div>
              <div className="text-break">{session.userAgent ?? t('account.unknownDevice')}{session.ip ? ` · ${session.ip}` : ''}</div>
              <div className="text-secondary">{t('admin.sessions.lastUsed')}: {formatDateTime(session.lastUsedAt)}</div>
            </div>
            {session.current && <Badge bg="success" className="fs-6">{t('admin.sessions.current')}</Badge>}
            <Button variant="outline-danger" onClick={() => revokeAnySession(session.id).then(load, fail)}>{t('admin.sessions.revoke')}</Button>
          </li>
        ))}
      </ul>
      <h4 className="fs-4 fw-semibold">{t('admin.sessions.tokens')}</h4>
      {tokens.length === 0 && <p className="fs-5">{t('admin.sessions.none')}</p>}
      <ul className="list-group">
        {tokens.map((token) => (
          <li key={token.id} className="list-group-item d-flex flex-wrap align-items-center gap-3">
            <div className="flex-grow-1">
              <div className="fs-5 fw-semibold">{token.name} <span className="text-secondary fw-normal">· {token.username}</span></div>
              <div className="text-secondary">{t('admin.sessions.permissions')}: {token.permissions.join(', ')}</div>
              <div className="text-secondary">
                {t('admin.sessions.created')}: {formatDateTime(token.createdAt)}
                {' · '}{token.lastUsedAt ? t('account.lastUsed', { date: formatDateTime(token.lastUsedAt) }) : t('account.tokenNeverUsed')}
                {' · '}{token.expiresAt ? t('account.tokenExpiresOn', { date: formatDate(token.expiresAt) }) : t('account.tokenNoExpiry')}
              </div>
            </div>
            <Button variant="outline-danger" onClick={() => revokeAnyToken(token.id).then(load, fail)}>{t('admin.sessions.revoke')}</Button>
          </li>
        ))}
      </ul>
    </>
  );
};

/** Every auth provider of active plugins, with the plugin it comes from. */
export const providersOf = (plugins: PluginInfo[]) =>
  plugins.flatMap((plugin) => plugin.authProviders.map((provider) => ({ ...provider, plugin: plugin.name })));

const AuthProvidersSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const setCurrentView = usePalomaStore((state) => state.setCurrentView);
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchPlugins(currentLanguage()).then(setPlugins, (err) => setError(describeError(err, t)));
  }, [i18n.language]);
  const providers = providersOf(plugins ?? []);

  return (
    <>
      <p className="fs-5">{t('admin.auth.intro')}</p>
      {error && <Alert variant="danger" className="fs-5">{error}</Alert>}
      {plugins && providers.length === 0 && <Alert variant="warning" className="fs-5">{t('admin.auth.none')}</Alert>}
      <ul className="list-group mb-3">
        {providers.map((provider) => (
          <li key={provider.id} className="list-group-item d-flex flex-wrap align-items-center gap-3">
            <div className="flex-grow-1">
              <div className="fs-5 fw-semibold">{provider.label}</div>
              <div className="text-secondary">{t(`admin.auth.kinds.${provider.kind}`)} · {t('admin.auth.plugin', { plugin: provider.plugin })}</div>
            </div>
            <Badge bg="success" className="fs-6">{t('admin.auth.available')}</Badge>
          </li>
        ))}
      </ul>
      <Button variant="outline-primary" size="lg" onClick={() => setCurrentView('server')}>{t('admin.auth.openPlugins')}</Button>
    </>
  );
};

/** The Admin view: users, roles, sessions and tokens, and authentication. Only for users who manage users. */
export const AdminView: React.FC = () => {
  const { t } = useTranslation();
  return (
    <main className="flex-grow-1 pal-page overflow-auto p-4">
      <div className="mx-auto" style={{ maxWidth: '1000px' }}>
        <h2 className="fw-bold d-flex align-items-center gap-2 mb-2">
          <ShieldCheck size={30} />
          <span>{t('admin.title')}</span>
        </h2>
        <p className="fs-5 text-secondary">{t('admin.intro')}</p>
        <Tabs defaultActiveKey="users" className="mb-3 fs-5" mountOnEnter unmountOnExit>
          <Tab eventKey="users" title={t('admin.sections.users')}><UsersSection /></Tab>
          <Tab eventKey="roles" title={t('admin.sections.roles')}><RolesSection /></Tab>
          <Tab eventKey="sessions" title={t('admin.sections.sessions')}><SessionsTokensSection /></Tab>
          <Tab eventKey="auth" title={t('admin.sections.auth')}><AuthProvidersSection /></Tab>
        </Tabs>
      </div>
    </main>
  );
};
