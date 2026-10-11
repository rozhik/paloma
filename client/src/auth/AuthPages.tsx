import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { KeyRound, LogIn, UserPlus } from 'lucide-react';
import type { AuthProviderInfo } from '../../../shared/types.js';
import { changePassword } from '../api/auth.js';
import { describeError } from '../api/http.js';
import { currentLanguage } from '../i18n/index.js';
import { useAuthStore } from './authStore.js';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Why a new password cannot be used yet, as a translation key: too short or the two entries differ; null when
 * it is fine. The server checks again.
 */
export function newPasswordProblem(password: string, again: string): 'auth.passwordHint' | 'auth.passwordsDiffer' | null {
  if ([...password].length < MIN_PASSWORD_LENGTH) return 'auth.passwordHint';
  if (password !== again) return 'auth.passwordsDiffer';
  return null;
}

/** A centered card for pages shown instead of the app. */
const AuthCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  // The app shell keeps <body> from scrolling, so the page scrolls itself; `m-auto` centers the card while it fits
  // and lets its top stay reachable when it does not
  <main className="pal-page auth-page vh-100 overflow-auto d-flex p-3">
    <div className="card shadow-sm w-100 m-auto" style={{ maxWidth: '520px' }}>
      <div className="card-body p-4">
        <h1 className="fs-2 fw-bold d-flex align-items-center gap-2 mb-3">{icon}<span>{title}</span></h1>
        {children}
      </div>
    </div>
  </main>
);

const Field: React.FC<{
  id: string; label: string; value: string; onChange: (value: string) => void; type?: string; hint?: string; autoComplete?: string;
  autoFocus?: boolean;
}> = ({ id, label, value, onChange, type = 'text', hint, autoComplete, autoFocus }) => (
  <Form.Group className="mb-3" controlId={id}>
    <Form.Label className="fs-5">{label}</Form.Label>
    <Form.Control
      size="lg" type={type} value={value} autoComplete={autoComplete} autoFocus={autoFocus} required
      onChange={(event) => onChange(event.target.value)}
    />
    {hint && <Form.Text className="fs-6">{hint}</Form.Text>}
  </Form.Group>
);

/** The form of one `credentials` provider, with its own fields. */
export const LoginForm: React.FC<{ provider: AuthProviderInfo; first: boolean }> = ({ provider, first }) => {
  const { t } = useTranslation();
  const login = useAuthStore((state) => state.login);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(provider.id, values, currentLanguage());
    } catch (err) {
      setError(describeError(err, t));
      setBusy(false);
    }
  };

  return (
    <Form onSubmit={submit} aria-label={provider.label} className="mb-3">
      {!first && <h2 className="fs-4 fw-semibold mt-3">{provider.label}</h2>}
      {provider.fields.map((field, index) => (
        <Field
          key={field.name}
          id={`login-${provider.id}-${field.name}`}
          label={field.label}
          type={field.type}
          value={values[field.name] ?? ''}
          autoComplete={field.type === 'password' ? 'current-password' : 'username'}
          autoFocus={first && index === 0}
          onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
        />
      ))}
      {error && <Alert variant="danger" className="fs-5" role="alert">{error}</Alert>}
      <Button type="submit" size="lg" className="w-100 d-flex align-items-center justify-content-center gap-2" disabled={busy}>
        <LogIn size={22} />
        <span>{t('auth.loginButton')}</span>
      </Button>
    </Form>
  );
};

/** One form per enabled login provider. */
export const LoginPage: React.FC<{ providers: AuthProviderInfo[] }> = ({ providers }) => {
  const { t } = useTranslation();
  return (
    <AuthCard title={t('auth.loginTitle')} icon={<LogIn size={30} />}>
      <p className="fs-5 text-secondary">{t('auth.loginIntro')}</p>
      {providers.length === 0 && <Alert variant="warning" className="fs-5">{t('auth.noProviders')}</Alert>}
      {providers.map((provider, index) => <LoginForm key={provider.id} provider={provider} first={index === 0} />)}
    </AuthCard>
  );
};

/** Creating the first administrator with the setup code from the server log. */
export const SetupPage: React.FC = () => {
  const { t } = useTranslation();
  const setup = useAuthStore((state) => state.setup);
  const [form, setForm] = useState({ setupCode: '', username: '', displayName: '', password: '', again: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = newPasswordProblem(form.password, form.again);
    if (problem) return setError(t(problem));
    setBusy(true);
    setError(null);
    try {
      const { again: _again, ...body } = form;
      await setup({ ...body, displayName: body.displayName.trim() || body.username }, currentLanguage());
    } catch (err) {
      setError(describeError(err, t));
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t('auth.setupTitle')} icon={<UserPlus size={30} />}>
      <p className="fs-5 text-secondary">{t('auth.setupIntro')}</p>
      <Form onSubmit={submit}>
        <Field id="setup-code" label={t('auth.setupCode')} value={form.setupCode} onChange={set('setupCode')} autoComplete="one-time-code" autoFocus />
        <Field id="setup-username" label={t('auth.username')} value={form.username} onChange={set('username')} hint={t('auth.usernameHint')} autoComplete="username" />
        <Field id="setup-name" label={t('auth.displayName')} value={form.displayName} onChange={set('displayName')} autoComplete="name" />
        <Field id="setup-password" label={t('auth.password')} type="password" value={form.password} onChange={set('password')} hint={t('auth.passwordHint')} autoComplete="new-password" />
        <Field id="setup-again" label={t('auth.passwordAgain')} type="password" value={form.again} onChange={set('again')} autoComplete="new-password" />
        {error && <Alert variant="danger" className="fs-5" role="alert">{error}</Alert>}
        <Button type="submit" size="lg" className="w-100" disabled={busy}>{t('auth.setupButton')}</Button>
      </Form>
    </AuthCard>
  );
};

/** The form to change one's password: current password and the new one twice. */
export const PasswordForm: React.FC<{ onDone: () => void; autoFocus?: boolean }> = ({ onDone, autoFocus }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({ current: '', password: '', again: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((state) => ({ ...state, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = newPasswordProblem(form.password, form.again);
    if (problem) return setError(t(problem));
    setBusy(true);
    setError(null);
    try {
      await changePassword(form.current, form.password);
      setForm({ current: '', password: '', again: '' });
      onDone();
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form onSubmit={submit}>
      <Field id="password-current" label={t('auth.currentPassword')} type="password" value={form.current} onChange={set('current')} autoComplete="current-password" autoFocus={autoFocus} />
      <Field id="password-new" label={t('auth.newPassword')} type="password" value={form.password} onChange={set('password')} hint={t('auth.passwordHint')} autoComplete="new-password" />
      <Field id="password-again" label={t('auth.newPasswordAgain')} type="password" value={form.again} onChange={set('again')} autoComplete="new-password" />
      {error && <Alert variant="danger" className="fs-5" role="alert">{error}</Alert>}
      <Button type="submit" size="lg" className="d-flex align-items-center gap-2" disabled={busy}>
        <KeyRound size={22} />
        <span>{t('auth.changePasswordButton')}</span>
      </Button>
    </Form>
  );
};

/** After an administrator set the password: the user chooses their own before anything else. */
export const ForcePasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const refreshMe = useAuthStore((state) => state.refreshMe);
  const logout = useAuthStore((state) => state.logout);
  return (
    <AuthCard title={t('auth.changePasswordTitle')} icon={<KeyRound size={30} />}>
      <p className="fs-5 text-secondary">{t('auth.changePasswordIntro')}</p>
      <PasswordForm autoFocus onDone={() => void refreshMe(currentLanguage())} />
      <Button variant="link" className="fs-5 mt-2 px-0" onClick={() => void logout()}>{t('auth.logout')}</Button>
    </AuthCard>
  );
};

/** Shows the app, or the page that must come first: setup, login or a new password. */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t, i18n } = useTranslation();
  const phase = useAuthStore((state) => state.phase);
  const status = useAuthStore((state) => state.status);
  const load = useAuthStore((state) => state.load);

  useEffect(() => {
    void load(currentLanguage());
  }, []);

  // The login form's labels follow the language
  useEffect(() => {
    if (phase === 'login' || phase === 'setup') void load(currentLanguage());
  }, [i18n.language]);

  switch (phase) {
    case 'loading':
      return (
        <main className="pal-page min-vh-100 d-flex align-items-center justify-content-center gap-2 fs-4">
          <Spinner animation="border" />
          <span>{t('auth.loading')}</span>
        </main>
      );
    case 'error':
      return (
        <AuthCard title="Paloma" icon={<LogIn size={30} />}>
          <Alert variant="danger" className="fs-5">{t('auth.serverError')}</Alert>
          <Button size="lg" onClick={() => void load(currentLanguage())}>{t('auth.retry')}</Button>
        </AuthCard>
      );
    case 'setup':
      return <SetupPage />;
    case 'login':
      return <LoginPage providers={status?.providers ?? []} />;
    case 'changePassword':
      return <ForcePasswordPage />;
    case 'ready':
      return <>{children}</>;
  }
};
