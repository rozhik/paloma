import React, { useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { ScanFace, UserCheck } from 'lucide-react';
import type { UnassignedFaces } from '../../../shared/types.js';
import { describeError } from '../api/http.js';
import { assignFaces, fetchUnassignedFaces } from '../api/people.js';
import { useFormat } from '../i18n/format.js';
import { PersonPicker } from '../people/PersonPicker.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useFaceDetection } from './useFaceDetection.js';
import { FaceCropGrid, openPhoto, toggled } from './SimilarFaces.js';

/** Above the Unrecognized view: its title and how many faces it holds. */
export const UnrecognizedHeader: React.FC<{ total: number | null }> = ({ total }) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  return (
    <div className="album-header pal-surface border-bottom px-4 py-3">
      <h4 className="fw-bold mb-0 d-flex align-items-center gap-2">
        <ScanFace size={24} className="text-success flex-shrink-0" aria-hidden="true" />
        <span>{t('faces.unrecognizedTitle')}</span>
        {total !== null && <span className="badge pal-badge fs-6">{formatNumber(total)}</span>}
      </h4>
    </div>
  );
};

/** Detected faces that belong to no one: select some and say who they are. */
export const UnrecognizedFaces: React.FC = () => {
  const { t } = useTranslation();
  const { libraryVersion, bumpLibrary, openViewer } = usePalomaStore();
  const finished = useFaceDetection((state) => state.finished);
  const [data, setData] = useState<UnassignedFaces | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => fetchUnassignedFaces().then((next) => {
    setData(next);
    setSelected((current) => new Set([...current].filter((id) => next.faces.some((face) => face.id === id))));
  }).catch(setError);
  useEffect(() => { load(); }, [libraryVersion, finished]);

  const assign = async (personId: string) => {
    setNotice(null);
    const result = await assignFaces(personId, [...selected]);
    if (result.failed.length > 0) setNotice(t('faces.assignFailed', { failed: result.failed.length }));
    setSelected(new Set());
    bumpLibrary();
    await load();
  };

  return (
    <div className="d-flex flex-column h-100">
      <UnrecognizedHeader total={data?.total ?? null} />
      {error != null && <Alert variant="danger" className="m-3 mb-0" dismissible onClose={() => setError(null)}>{describeError(error, t)}</Alert>}
      {notice && <Alert variant="warning" className="m-3 mb-0" dismissible onClose={() => setNotice(null)}>{notice}</Alert>}
      {data === null ? (
        error == null && <div className="p-5 text-center"><Spinner animation="border" role="status" aria-label={t('info.loading')} /></div>
      ) : data.faces.length === 0 ? (
        <div className="text-center p-5">
          <h4 className="fw-bold">{t('faces.noUnrecognizedTitle')}</h4>
          <p className="text-muted fs-5">{t('faces.noUnrecognizedHint')}</p>
        </div>
      ) : (
        <FaceCropGrid
          faces={data.faces}
          selected={selected}
          onToggle={(id) => setSelected((current) => toggled(current, id))}
          onSelectAll={(select) => setSelected(select ? new Set(data.faces.map((face) => face.id)) : new Set())}
          onOpen={(photoId) => openPhoto(photoId, openViewer).catch(setError)}
        >
          {data.total > data.faces.length && (
            <span className="opacity-75">{t('faces.shownOf', { shown: data.faces.length, total: data.total })}</span>
          )}
          <button type="button" className="btn btn-primary" disabled={selected.size === 0} onClick={() => setPicking(true)}>
            <UserCheck size={18} aria-hidden="true" /> {t('info.whoIsThisTitle')}
          </button>
        </FaceCropGrid>
      )}
      <PersonPicker show={picking} title={t('info.whoIsThisTitle')} onHide={() => setPicking(false)} onPick={assign} />
    </div>
  );
};
