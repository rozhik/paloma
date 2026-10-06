import React, { useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Check, UserCheck, UserX } from 'lucide-react';
import type { DetectedFaceInfo, Photo, SimilarFaces as SimilarFacesData } from '../../../shared/types.js';
import { apiRequest, describeError } from '../api/http.js';
import { assignFaces, dismissFaces, faceCropUrl, fetchSimilarFaces } from '../api/people.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useFaceDetection } from './detectionRunner.js';

interface SimilarFacesContentProps {
  /** The person's shown name */
  name: string;
  data: SimilarFacesData;
  selected: ReadonlySet<number>;
  busy: boolean;
  onToggle: (faceId: number) => void;
  onSelectAll: (select: boolean) => void;
  onAssign: () => void;
  onDismiss: () => void;
  onOpen: (photoId: number) => void;
}

/** Crops of faces that look like the person, to select and mark as them or as not them. */
export const SimilarFacesContent: React.FC<SimilarFacesContentProps> = ({
  name, data, selected, busy, onToggle, onSelectAll, onAssign, onDismiss, onOpen,
}) => {
  const { t } = useTranslation();
  if (data.noReference) {
    return (
      <div className="text-center p-5">
        <div className="fs-1 mb-3" aria-hidden="true">🙂</div>
        <h4 className="fw-bold">{t('faces.noReferenceTitle', { name })}</h4>
        <p className="text-muted fs-5">{t('faces.noReferenceHint', { name })}</p>
      </div>
    );
  }
  if (data.faces.length === 0) {
    return (
      <div className="text-center p-5">
        <h4 className="fw-bold">{t('faces.noSimilarTitle')}</h4>
        <p className="text-muted fs-5">{t('faces.noSimilarHint', { name })}</p>
      </div>
    );
  }
  return (
    <FaceCropGrid faces={data.faces} selected={selected} onToggle={onToggle} onSelectAll={onSelectAll} onOpen={onOpen}>
      <button type="button" className="btn btn-primary" disabled={busy || selected.size === 0} onClick={onAssign}>
        <UserCheck size={18} aria-hidden="true" /> <span dir="auto">{t('faces.assignTo', { name })}</span>
      </button>
      <button type="button" className="btn btn-outline-danger" disabled={busy || selected.size === 0} onClick={onDismiss}>
        <UserX size={18} aria-hidden="true" /> <span dir="auto">{t('faces.notPerson', { name })}</span>
      </button>
    </FaceCropGrid>
  );
};

interface FaceCropGridProps {
  faces: readonly DetectedFaceInfo[];
  selected: ReadonlySet<number>;
  onToggle: (faceId: number) => void;
  onSelectAll: (select: boolean) => void;
  onOpen: (photoId: number) => void;
  /** The actions for the selected faces */
  children: React.ReactNode;
}

/** Crops of detected faces to select, with Select all, the number selected and the actions; a face opens its photo. */
export const FaceCropGrid: React.FC<FaceCropGridProps> = ({ faces, selected, onToggle, onSelectAll, onOpen, children }) => {
  const { t } = useTranslation();
  const all = faces.length > 0 && selected.size === faces.length;
  return (
    <div className="similar-faces d-flex flex-column h-100">
      <div className="similar-faces-actions pal-surface border-bottom px-4 py-2 d-flex flex-wrap align-items-center gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={() => onSelectAll(!all)}>
          {all ? t('faces.selectNone') : t('faces.selectAll')}
        </button>
        <span className="opacity-75 me-auto">{t('faces.selected', { count: selected.size })}</span>
        {children}
      </div>
      <ul className="similar-faces-grid list-unstyled m-0 p-3 flex-grow-1 overflow-auto">
        {faces.map((face, index) => {
          const isSelected = selected.has(face.id);
          return (
            <li key={face.id}>
              <button
                type="button"
                className={`similar-face ${isSelected ? 'selected' : ''}`}
                aria-pressed={isSelected}
                aria-label={t('faces.face', { index: index + 1 })}
                title={t('faces.faceHint')}
                onClick={() => onToggle(face.id)}
                onDoubleClick={() => onOpen(face.photoId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onOpen(face.photoId);
                  }
                }}
              >
                <img src={faceCropUrl(face.photoId, face.rect, 160)} alt="" loading="lazy" draggable={false} />
                {isSelected && <span className="similar-face-check" aria-hidden="true"><Check size={18} /></span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Toggles a face in a selection. */
export const toggled = (selection: ReadonlySet<number>, id: number): Set<number> => {
  const next = new Set(selection);
  if (!next.delete(id)) next.add(id);
  return next;
};

/** Opens the viewer on one photo, by id. */
export async function openPhoto(photoId: number, openViewer: (photos: Photo[], index: number) => void): Promise<void> {
  const photos = await apiRequest<Photo[]>('GET', `/api/photos?ids=${photoId}&includeHidden=true`);
  openViewer(photos, 0);
}

/** Similar faces of a person: loads them, and assigns or dismisses the selected faces. */
export const SimilarFaces: React.FC<{ personId: string; name: string }> = ({ personId, name }) => {
  const { t } = useTranslation();
  const { libraryVersion, bumpLibrary, openViewer } = usePalomaStore();
  const finished = useFaceDetection((state) => state.finished);
  const [data, setData] = useState<SimilarFacesData | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => fetchSimilarFaces(personId).then((next) => {
    setData(next);
    // Faces that left the list leave the selection
    setSelected((current) => new Set([...current].filter((id) => next.faces.some((face) => face.id === id))));
  }).catch(setError);

  useEffect(() => {
    setData(null);
    setSelected(new Set());
    setNotice(null);
  }, [personId]);
  useEffect(() => { load(); }, [personId, libraryVersion, finished]);

  const act = async (action: (ids: number[]) => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action([...selected]));
      setSelected(new Set());
      bumpLibrary();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const open = (photoId: number) => openPhoto(photoId, openViewer).catch(setError);

  if (data === null) {
    return error != null
      ? <Alert variant="danger" className="m-4">{describeError(error, t)}</Alert>
      : <div className="p-5 text-center"><Spinner animation="border" role="status" aria-label={t('info.loading')} /></div>;
  }
  return (
    <div className="d-flex flex-column h-100">
      {error != null && <Alert variant="danger" className="m-3 mb-0" dismissible onClose={() => setError(null)}>{describeError(error, t)}</Alert>}
      {notice && <Alert variant="warning" className="m-3 mb-0" dismissible onClose={() => setNotice(null)}>{notice}</Alert>}
      <SimilarFacesContent
        name={name}
        data={data}
        selected={selected}
        busy={busy}
        onToggle={(id) => setSelected((current) => toggled(current, id))}
        onSelectAll={(select) => setSelected(select ? new Set(data.faces.map((face) => face.id)) : new Set())}
        onAssign={() => act(async (ids) => {
          const result = await assignFaces(personId, ids);
          return result.failed.length > 0 ? t('faces.assignFailed', { failed: result.failed.length }) : null;
        })}
        onDismiss={() => act(async (ids) => { await dismissFaces(personId, ids); return null; })}
        onOpen={open}
      />
    </div>
  );
};
