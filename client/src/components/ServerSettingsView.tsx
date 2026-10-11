import React, { useEffect, useState } from 'react';
import { Alert, Badge } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Server } from 'lucide-react';
import type { ServerInfo } from '../../../shared/types.js';
import { fetchServerInfo } from '../api/server.js';
import { describeError } from '../api/http.js';
import { PluginsList } from './PluginsList.js';

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="row py-2 border-bottom">
    <dt className="col-sm-4 fw-semibold">{label}</dt>
    <dd className="col-sm-8 mb-0">{children}</dd>
  </div>
);

/** Paths one per line, or a dash when there are none. */
const Paths: React.FC<{ paths: string[]; none: string }> = ({ paths, none }) =>
  paths.length === 0 ? <span className="text-secondary">{none}</span> : (
    <ul className="list-unstyled mb-0">{paths.map((p) => <li key={p} dir="ltr" className="text-break font-monospace">{p}</li>)}</ul>
  );

/** The read-only Server section: what the server was started with. */
export const ServerSection: React.FC<{ info: ServerInfo }> = ({ info }) => {
  const { t } = useTranslation();
  const path = (value: string) => <span dir="ltr" className="text-break font-monospace">{value}</span>;
  return (
    <section className="mb-4" aria-labelledby="server-section">
      <h3 id="server-section" className="fs-3 fw-bold mb-1">{t('server.section')}</h3>
      <p className="fs-5 text-secondary">{t('server.envHint')}</p>
      <dl className="fs-5 mb-0">
        <Fact label={t('server.version')}>{info.version}</Fact>
        <Fact label={t('server.users')}>
          <Badge bg={info.authMode === 'on' ? 'success' : 'secondary'} className="fs-6">
            {info.authMode === 'on' ? t('server.usersOn') : t('server.usersOff')}
          </Badge>
        </Fact>
        <Fact label={t('server.photosDirs')}><Paths paths={info.photosDirs} none={t('server.none')} /></Fact>
        <Fact label={t('server.excludeDirs')}><Paths paths={info.excludeDirs} none={t('server.none')} /></Fact>
        <Fact label={t('server.exportDir')}>{path(info.exportDir)}</Fact>
        <Fact label={t('server.dataDir')}>{path(info.dataDir)}</Fact>
        <Fact label={t('server.pluginsDir')}>{path(info.pluginsDir)}</Fact>
        <Fact label={t('server.sessionDays')}>{info.sessionDays}</Fact>
        <Fact label={t('server.rateLimit')}>{info.rateLimit ?? t('server.unlimited')}</Fact>
      </dl>
    </section>
  );
};

/** Server settings, from the user menu: the server's configuration and the plugins. They apply to everyone. */
export const ServerSettingsView: React.FC = () => {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchServerInfo().then(setInfo, (err) => setError(describeError(err, t)));
  }, []);

  return (
    <main className="flex-grow-1 pal-page overflow-auto p-4">
      <div className="mx-auto" style={{ maxWidth: '900px' }}>
        <h2 className="fw-bold d-flex align-items-center gap-2 mb-2">
          <Server size={30} aria-hidden="true" />
          <span>{t('server.title')}</span>
        </h2>
        <p className="fs-5 text-secondary">{t('server.intro')}</p>
        {error && <Alert variant="danger" className="fs-5">{error}</Alert>}
        {info && <ServerSection info={info} />}
        <PluginsList />
      </div>
    </main>
  );
};
