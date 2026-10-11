import React, { useEffect, useRef, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { UserPlus, X } from 'lucide-react';
import type { ExifValue, Photo, PhotoInfo, PhotoPeople } from '../../../../shared/types.js';
import { describeError } from '../../api/http.js';
import { fetchPhotoInfo, fetchTags, updatePhotoText } from '../../api/tags.js';
import { addPersonToPhoto, faceCropUrl, fetchPhotoPeople, removePersonFromPhoto } from '../../api/people.js';
import { PersonAvatar } from '../../people/PersonAvatar.js';
import { PersonPicker } from '../../people/PersonPicker.js';
import { useFormat } from '../../i18n/format.js';
import { useAllows } from '../../levels/controls.js';
import { usePalomaStore } from '../../store/usePalomaStore.js';
import { TagChips } from '../tags/TagChips.js';
import { EntryLink } from '../../shell/EntryLink.js';
import { coordinatesText, entryJson, fileSizeText } from './infoFormat.js';

interface InfoPanelProps {
  photo: Photo;
  style: React.CSSProperties;
  /** Extra class from the skin */
  className?: string;
  onClose: () => void;
}

/** The name of the folder a file is in: the last part of its folder's path. */
export const folderName = (filePath: string): string => filePath.split(/[\\/]/).filter(Boolean).slice(-2, -1)[0] ?? filePath;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="info-section mb-3">
    <h3 className="info-section-title fs-6 fw-bold text-uppercase mb-2">{title}</h3>
    {children}
  </section>
);

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <dt className="fw-normal opacity-75">{label}</dt>
    <dd className="mb-2 text-break">{children}</dd>
  </>
);

interface PeopleSectionProps {
  people: PhotoPeople;
  photoId: number;
  saving: boolean;
  /** Adds a person to the photo; without these, the section only lists people */
  onAdd?: () => void;
  onRemove?: (personId: string) => void;
  onAssign?: (faceId: number) => void;
}

/** The people on the photo and, for editing, its detected faces that belong to no one. */
export const PeopleSection: React.FC<PeopleSectionProps> = ({ people, photoId, saving, onAdd, onRemove, onAssign }) => {
  const { t } = useTranslation();
  return (
    <>
      {people.people.length === 0 ? <p className="mb-2 opacity-75">{t('info.noPeople')}</p> : (
        <ul className="list-unstyled mb-2 info-people">
          {people.people.map((person) => {
            const name = person.name ?? t('info.unknownPerson');
            return (
              <li key={person.id} className="d-flex align-items-center gap-2 mb-1">
                <PersonAvatar id={person.id} version={person.avatarVersion} size={28} />
                <span className="flex-grow-1 text-truncate">
                  <EntryLink entry={{ kind: 'person', id: person.id }} label={name} placeholder={person.name === null} />
                </span>
                {onRemove && (
                  <button
                    type="button"
                    className="btn btn-sm viewer-btn"
                    disabled={saving}
                    aria-label={t('info.removePerson', { name })}
                    title={t('info.removePerson', { name })}
                    onClick={() => onRemove(person.id)}
                  >
                    <X size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {onAssign && people.faces.length > 0 && (
        <>
          <p className="mb-1 small opacity-75">{t('info.unassignedFaces')}</p>
          <ul className="list-unstyled d-flex flex-wrap gap-2 mb-2">
            {people.faces.map((face, index) => (
              <li key={face.id}>
                <button
                  type="button"
                  className="btn p-0 info-face"
                  disabled={saving}
                  aria-label={t('info.whoIsThis', { index: index + 1 })}
                  title={t('info.whoIsThis', { index: index + 1 })}
                  onClick={() => onAssign(face.id)}
                >
                  <img src={faceCropUrl(photoId, face.rect, 96)} alt="" width={48} height={48} className="person-avatar" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {onAdd && (
        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={saving} onClick={onAdd}>
          <UserPlus size={16} aria-hidden="true" /> {t('info.addPerson')}
        </button>
      )}
    </>
  );
};

/** The Info panel's content for a loaded photo; the same in every skin. */
export const InfoContent: React.FC<{
  info: PhotoInfo;
  knownTags: string[];
  saving: boolean;
  onCaption: (caption: string) => void;
  onKeywords: (keywords: string[]) => void;
  onAddPerson?: () => void;
  onRemovePerson?: (personId: string) => void;
  onAssignFace?: (faceId: number) => void;
}> = ({ info, knownTags, saving, onCaption, onKeywords, onAddPerson, onRemovePerson, onAssignFace }) => {
  const { t, i18n } = useTranslation();
  const { formatDateTime } = useFormat();
  const showExif = useAllows('info.exif');
  const showJson = useAllows('info.json');
  const editPeople = useAllows('info.people.edit');
  const editText = useAllows('info.edit');
  const { photo, file } = info;
  const saved = photo.caption ?? '';
  const [caption, setCaption] = useState(saved);
  useEffect(() => setCaption(saved), [saved, photo.id]);

  const saveCaption = () => {
    if (caption !== saved) onCaption(caption);
  };
  const exifText = (value: ExifValue) =>
    typeof value === 'string' ? value : t('info.binary', { size: fileSizeText(value.binary, i18n.language) });

  return (
    <>
      <Section title={t('info.file')}>
        <dl className="mb-0">
          <Fact label={t('info.file')}><span dir="auto">{photo.filename}</span></Fact>
          <Fact label={t('info.folder')}>
            <EntryLink entry={{ kind: 'folder', id: photo.folderId }} label={folderName(file.path)} />
          </Fact>
          <Fact label={t('info.path')}><span dir="ltr">{file.path}</span></Fact>
          <Fact label={t('info.size')}>{fileSizeText(file.size, i18n.language)}</Fact>
          {photo.width > 0 && (
            <Fact label={t('info.dimensions')}>{t('info.dimensionsValue', { width: photo.width, height: photo.height })}</Fact>
          )}
          {photo.dateTaken && <Fact label={t('info.dateTaken')}>{formatDateTime(photo.dateTaken)}</Fact>}
          {file.modifiedAt && <Fact label={t('info.modified')}>{formatDateTime(file.modifiedAt)}</Fact>}
        </dl>
      </Section>

      <Section title={t('info.description')}>
        {!editText ? (
          <p className="mb-0" dir="auto">{saved || <span className="opacity-75">{t('info.descriptionPlaceholder')}</span>}</p>
        ) : <input
          type="text"
          className="form-control"
          dir="auto"
          value={caption}
          placeholder={t('info.descriptionPlaceholder')}
          aria-label={t('info.description')}
          disabled={saving}
          onChange={(event) => setCaption(event.target.value)}
          onBlur={saveCaption}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              saveCaption();
            } else if (event.key === 'Escape') {
              // Restores the saved text; the panel and the viewer stay open
              event.preventDefault();
              event.stopPropagation();
              setCaption(saved);
            }
          }}
        />}
      </Section>

      <Section title={t('info.tags')}>
        {editText
          ? <TagChips tags={photo.keywords} onChange={onKeywords} suggestions={knownTags} disabled={saving} linkTags />
          : (
            <ul className="list-inline mb-0">
              {photo.keywords.map((tag) => (
                <li key={tag} className="list-inline-item"><EntryLink entry={{ kind: 'tag', name: tag }} label={tag} /></li>
              ))}
            </ul>
          )}
      </Section>

      <Section title={t('info.albums')}>
        {info.albums.length === 0 ? <p className="mb-0 opacity-75">{t('info.noAlbums')}</p> : (
          <ul className="list-unstyled mb-0">
            {info.albums.map((album) => (
              <li key={album.token} className="mb-1">
                <EntryLink entry={{ kind: 'album', token: album.token }} label={album.name ?? t('common.untitled')} placeholder={album.name === null} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('info.people')}>
        <PeopleSection
          people={{ people: info.people, faces: info.faces }}
          photoId={photo.id}
          saving={saving}
          onAdd={editPeople ? onAddPerson : undefined}
          onRemove={editPeople ? onRemovePerson : undefined}
          onAssign={editPeople ? onAssignFace : undefined}
        />
      </Section>

      <Section title={t('info.location')}>
        {photo.latitude === null || photo.longitude === null ? <p className="mb-0 opacity-75">{t('info.noLocation')}</p> : (
          <>
            <p className="mb-1" dir="ltr">{coordinatesText(photo.latitude, photo.longitude, i18n.language)}</p>
            <p className="mb-1 opacity-75">{photo.locationSource === 'exif' ? t('info.fromCamera') : t('info.setByUser')}</p>
            {info.place && <p className="mb-0" dir="auto">{info.place}</p>}
          </>
        )}
      </Section>

      <Section title={t('info.other')}>
        <ul className="list-unstyled mb-0">
          <li>{photo.isStarred ? t('info.starred') : t('info.notStarred')}</li>
          <li>{photo.isHidden ? t('info.hidden') : t('info.notHidden')}</li>
          <li>{t('info.edits', { count: photo.edits?.length ?? 0 })}</li>
        </ul>
      </Section>

      {showExif && (
        <Section title={t('info.exif')}>
          {info.exif === null ? <p className="mb-0 opacity-75">{t('info.noExif')}</p> : Object.entries(info.exif).map(([group, fields]) => (
            <div key={group} className="mb-2" dir="ltr">
              <h4 className="fs-6 fw-bold mb-1">{group}</h4>
              <dl className="info-exif mb-0 small">
                {Object.entries(fields).map(([tag, value]) => <Fact key={tag} label={tag}>{exifText(value)}</Fact>)}
              </dl>
            </div>
          ))}
        </Section>
      )}

      {showJson && (
        <Section title={t('info.json')}>
          {info.entry.source === 'unreadable' && <p className="mb-0">{t('info.jsonUnreadable')}</p>}
          {info.entry.source === 'none' && <p className="mb-0 opacity-75">{t('info.jsonNone')}</p>}
          {info.entry.source === 'ini' && <p className="mb-1 opacity-75">{t('info.jsonIni')}</p>}
          {(info.entry.source === 'paloma' || info.entry.source === 'ini') && (
            <pre className="info-json small mb-0" dir="ltr">{entryJson(info.entry.json)}</pre>
          )}
        </Section>
      )}
    </>
  );
};

/**
 * The Info panel along the right edge of the viewer: everything Paloma knows about the photo shown, with its
 * description and tags editable. Follows the viewer from photo to photo.
 */
export const InfoPanel: React.FC<InfoPanelProps> = ({ photo, style, className, onClose }) => {
  const { t, i18n } = useTranslation();
  const { replaceViewerPhoto, bumpLibrary, libraryVersion } = usePalomaStore();
  const [info, setInfo] = useState<PhotoInfo | null>(null);
  /** Choosing a person to add to the photo, or to assign a detected face to */
  const [picking, setPicking] = useState<{ faceId?: number } | null>(null);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  /** The photo whose info is wanted; answers for an earlier photo are dropped */
  const current = useRef(photo.id);
  current.current = photo.id;

  const load = (photoId: number) => fetchPhotoInfo(photoId, i18n.language)
    .then((next) => { if (current.current === photoId) setInfo(next); })
    .catch((err) => { if (current.current === photoId) setError(err); });

  useEffect(() => {
    setInfo(null);
    setError(null);
    load(photo.id);
  }, [photo.id, i18n.language]);

  useEffect(() => {
    fetchTags().then((tags) => setKnownTags(tags.map((tag) => tag.name))).catch(() => setKnownTags([]));
  }, []);

  // People changed elsewhere, e.g. on a face frame: refresh them without reloading the panel
  useEffect(() => {
    const photoId = photo.id;
    fetchPhotoPeople(photoId)
      .then((people) => { if (current.current === photoId) setInfo((shown) => shown && { ...shown, ...people }); })
      .catch(() => {});
  }, [libraryVersion]);

  /** Changes the people on the photo and shows the result */
  const changePeople = async (change: () => Promise<PhotoPeople>) => {
    const photoId = photo.id;
    setSaving(true);
    setError(null);
    try {
      const people = await change();
      if (current.current === photoId) setInfo((shown) => shown && { ...shown, ...people });
      bumpLibrary();
    } catch (err) {
      if (current.current === photoId) setError(err);
    } finally {
      setSaving(false);
    }
  };

  /** Saves a change; shows it at once and puts the saved values back if it fails */
  const save = async (change: { caption?: string; keywords?: string[] }) => {
    if (!info) return;
    const before = info;
    const photoId = info.photo.id;
    setInfo({ ...info, photo: { ...info.photo, ...change } });
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePhotoText(photoId, change);
      replaceViewerPhoto(updated);
      bumpLibrary();
      if (current.current === photoId) setInfo((shown) => shown && { ...shown, photo: { ...updated, place: shown.photo.place } });
      if (change.keywords) setKnownTags((tags) => [...new Set([...tags, ...change.keywords!])]);
    } catch (err) {
      if (current.current === photoId) {
        setInfo(before);
        setError(err);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className={`viewer-info pal-viewer-info ${className ?? ''}`} style={style} aria-label={t('info.title')}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h2 className="fs-5 fw-bold mb-0">{t('info.title')}</h2>
        <button type="button" className="btn viewer-btn" aria-label={t('info.close')} title={t('info.close')} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {error != null && <Alert variant="danger" className="fs-6" dismissible onClose={() => setError(null)}>{describeError(error, t)}</Alert>}
      {info === null
        ? error == null && <Spinner animation="border" size="sm" role="status" aria-label={t('info.loading')} />
        : (
          <InfoContent
            info={info}
            knownTags={knownTags}
            saving={saving}
            onCaption={(caption) => save({ caption })}
            onKeywords={(keywords) => save({ keywords })}
            onAddPerson={() => setPicking({})}
            onRemovePerson={(personId) => changePeople(() => removePersonFromPhoto(photo.id, personId))}
            onAssignFace={(faceId) => setPicking({ faceId })}
          />
        )}
      <PersonPicker
        show={picking !== null}
        title={picking?.faceId !== undefined ? t('info.whoIsThisTitle') : t('info.addPerson')}
        exclude={picking?.faceId === undefined ? info?.people.map((person) => person.id) : undefined}
        onHide={() => setPicking(null)}
        onPick={(personId) => changePeople(() => addPersonToPhoto(photo.id, personId, picking?.faceId))}
      />
    </aside>
  );
};
