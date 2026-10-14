import React, { useEffect, useState } from 'react';
import { Alert, Badge, Spinner, Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { AiCatalogModel, AiUsageList } from '../../../shared/types.js';
import { fetchAiUsage, fetchCatalogModels } from '../api/ai.js';
import { describeError } from '../api/http.js';
import { ModelView } from './ModelsPanel.js';

/** The model calls of the user (everyone's for users.manage) with the totals of tokens and credits. */
export const AiUsagePanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [usage, setUsage] = useState<AiUsageList | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchAiUsage({ limit: 100 }).then(setUsage).catch((err) => setError(describeError(err, t)));
  }, []);
  const credits = (n: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 6 }).format(n);
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!usage) return <Spinner animation="border" size="sm" />;
  return (
    <div>
      <p className="mb-2">
        {t('ai.usage.totals', {
          calls: usage.totals.calls,
          prompt: usage.totals.tokens.prompt_tokens ?? 0,
          completion: usage.totals.tokens.completion_tokens ?? 0,
          credits: credits(usage.totals.credits),
        })}
      </p>
      {usage.records.length === 0 ? <p className="text-secondary">{t('ai.usage.empty')}</p> : (
        <Table responsive size="sm" className="align-middle">
          <thead>
            <tr>
              <th>{t('ai.usage.time')}</th><th>{t('ai.usage.task')}</th><th>{t('ai.usage.model')}</th>
              <th className="text-end">{t('ai.usage.tokens')}</th><th className="text-end">{t('ai.usage.credits')}</th>
            </tr>
          </thead>
          <tbody>
            {usage.records.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString(i18n.language)}</td>
                <td>{r.aiTaskId}</td>
                <td dir="ltr">{r.providerName} · {r.model}</td>
                <td className="text-end">
                  {r.tokens === null
                    ? <span className="text-secondary">{t('ai.usage.unknownTokens')}</span>
                    : t('ai.usage.tokenPair', { prompt: r.tokens.prompt_tokens ?? 0, completion: r.tokens.completion_tokens ?? 0 })}
                  {!r.ok && <Badge bg="danger" className="ms-1" title={r.error ?? undefined}>{t('ai.usage.failed')}</Badge>}
                </td>
                <td className="text-end">{credits(r.credits)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {usage.total > usage.records.length && <p className="text-secondary small">{t('ai.usage.showing', { shown: usage.records.length, total: usage.total })}</p>}
    </div>
  );
};

/** The enabled models of every provider, read-only, for anyone who can view the library. */
export const ModelCatalogView: React.FC = () => {
  const { t } = useTranslation();
  const [models, setModels] = useState<AiCatalogModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchCatalogModels().then(setModels).catch((err) => setError(describeError(err, t)));
  }, []);
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!models) return <Spinner animation="border" size="sm" />;
  if (models.length === 0) return <p className="text-secondary">{t('ai.models.noneEnabled')}</p>;
  const names = [...new Set(models.map((m) => m.providerName))];
  return (
    <div className="d-flex flex-column gap-3">
      {names.map((name) => (
        <section key={name} aria-label={name}>
          <h5 className="fw-bold">{name}</h5>
          <div className="d-flex flex-column gap-2">
            {models.filter((m) => m.providerName === name).map((m) => <ModelView key={`${m.providerId}/${m.id}`} model={m} />)}
          </div>
        </section>
      ))}
    </div>
  );
};
