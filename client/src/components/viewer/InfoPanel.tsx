import React, { useEffect, useRef, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { ExifValue, Photo, PhotoInfo } from '../../../../shared/types.js';
import { describeError } from '../../api/http.js';
import { fetchPhotoInfo, fetchTags, updatePhotoText } from '../../api/tags.js';
import { useFormat } from '../../i18n/format.js';
import { useAllows } from '../../levels/controls.js';
import { usePalomaStore } from '../../store/usePalomaStore.js';
import { TagChips } from '../tags/TagChips.js';
import { coordinatesText, entryJson, fileSizeText } from './infoFormat.js';

interface InfoPanelProps {
  photo: Photo;
  style: React.CSSProperties;
  /** Extra class from the skin */
  className?: string;
  onClose: () => void;
}

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

/** The Info panel's content for a loaded photo; the same in every skin. */
export const InfoContent: React.FC<{
  info: PhotoInfo;
  knownTags: string[];
  saving: boolean;
  onCaption: (caption: string) => void;
  onKeywords: (keywords: string[]) => void;
}> = ({ info, knownTags, saving, onCaption, onKeywords }) => {
  const { t, i18n } = useTranslation();
  const { formatDateTime } = useFormat();
  const showExif = useAllows('info.exif');
  const showJson = useAllows('info.json');
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
        <input
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
        />
      </Section>

      <Section title={t('info.tags')}>
        <TagChips tags={photo.keywords} onChange={onKeywords} suggestions={knownTags} disabled={saving} />
      </Section>

      <Section title={t('info.albums')}>
        {info.albums.length === 0 ? <p className="mb-0 opacity-75">{t('info.noAlbums')}</p> : (
          <ul className="list-unstyled mb-0">
            {info.albums.map((album) => (
              <li key={album.token} dir="auto" className={album.name === null ? 'fst-italic' : ''}>{album.name ?? t('common.untitled')}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('info.people')}>
        {info.people.length === 0 ? <p className="mb-0 opacity-75">{t('info.noPeople')}</p> : (
          <ul className="list-unstyled mb-0">
            {info.people.map((person) => (
              <li key={person.id} dir="auto" className={person.name === null ? 'fst-italic' : ''}>{person.name ?? t('info.unknownPerson')}</li>
            ))}
          </ul>
        )}
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
  const { replaceViewerPhoto, bumpLibrary } = usePalomaStore();
  const [info, setInfo] = useState<PhotoInfo | null>(null);
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
          />
        )}
    </aside>
  );
};
