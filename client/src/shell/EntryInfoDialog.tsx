import React, { useEffect, useState } from 'react';
import { Alert, Modal, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { PhotoStats } from '../../../shared/types.js';
import { fetchPhotoStats } from '../api/library.js';
import { describeError } from '../api/http.js';
import { currentLanguage } from '../i18n/index.js';
import { useFormat } from '../i18n/format.js';
import { fileSizeText } from '../components/viewer/infoFormat.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { EntryLink } from './EntryLink.js';
import { entryIcon, entrySelection, type LibraryEntry } from './entries.js';

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="d-flex justify-content-between gap-3 py-1 border-bottom">
    <dt className="fw-normal text-body-secondary">{label}</dt>
    <dd className="mb-0 fw-semibold text-end">{children}</dd>
  </div>
);

/** One list of related entries, each with its number of the entry's photos. */
const Related: React.FC<{ title: string; items: { key: string; link: React.ReactNode; count: number }[] }> = ({ title, items }) => {
  const { formatNumber } = useFormat();
  return (
    <section className="mt-3">
      <h3 className="fs-6 fw-bold text-uppercase mb-2">{title}</h3>
      <ul className="list-unstyled mb-0 entry-info-list">
        {items.map(({ key, link, count }) => (
          <li key={key} className="d-flex justify-content-between align-items-center gap-2 py-1">
            <span className="text-truncate">{link}</span>
            <span className="badge pal-badge">{formatNumber(count)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * The statistics of an entry's photos, and the folders, albums and people they belong to as links. A list is left
 * out when it is empty, and so is the list of the entry's own kind when it holds only the entry.
 */
export const EntryStats: React.FC<{ entry: LibraryEntry; stats: PhotoStats; onNavigate?: () => void }> = ({ entry, stats, onNavigate }) => {
  const { t, i18n } = useTranslation();
  const { formatNumber, formatDayRange } = useFormat();
  const ownOnly = (kind: LibraryEntry['kind'], length: number) => entry.kind === kind && length <= 1;
  const folders = ownOnly('folder', stats.folders.length) ? [] : stats.folders;
  const albums = ownOnly('album', stats.albums.length) ? [] : stats.albums;
  const people = ownOnly('person', stats.people.length) ? [] : stats.people;
  return (
    <>
      <dl className="mb-0">
        <Fact label={t('entryInfo.photos')}>{formatNumber(stats.photoCount)}</Fact>
        <Fact label={t('entryInfo.size')}>{fileSizeText(stats.totalSize, i18n.language)}</Fact>
        {stats.takenFrom && stats.takenTo && (
          <Fact label={t('entryInfo.taken')}>{formatDayRange(stats.takenFrom.slice(0, 10), stats.takenTo.slice(0, 10))}</Fact>
        )}
        {stats.undatedCount > 0 && <Fact label={t('entryInfo.undated')}>{formatNumber(stats.undatedCount)}</Fact>}
        <Fact label={t('entryInfo.starred')}>{formatNumber(stats.starredCount)}</Fact>
        <Fact label={t('entryInfo.geotagged')}>{formatNumber(stats.geotaggedCount)}</Fact>
        <Fact label={t('entryInfo.modified')}>{formatNumber(stats.modifiedCount)}</Fact>
      </dl>
      {folders.length > 0 && (
        <Related
          title={t('entryInfo.folders')}
          items={folders.map((folder) => ({
            key: String(folder.id),
            count: folder.photoCount,
            link: <EntryLink entry={{ kind: 'folder', id: folder.id }} label={folder.name} onNavigate={onNavigate} />,
          }))}
        />
      )}
      {albums.length > 0 && (
        <Related
          title={t('entryInfo.albums')}
          items={albums.map((album) => ({
            key: album.token,
            count: album.photoCount,
            link: (
              <EntryLink
                entry={{ kind: 'album', token: album.token }}
                label={album.name ?? t('common.untitled')}
                placeholder={album.name === null}
                onNavigate={onNavigate}
              />
            ),
          }))}
        />
      )}
      {people.length > 0 && (
        <Related
          title={t('entryInfo.people')}
          items={people.map((person) => ({
            key: person.id,
            count: person.photoCount,
            link: (
              <EntryLink
                entry={{ kind: 'person', id: person.id }}
                label={person.name ?? t('people.unknown')}
                placeholder={person.name === null}
                onNavigate={onNavigate}
              />
            ),
          }))}
        />
      )}
    </>
  );
};

interface EntryInfoDialogProps {
  /** The entry shown; null when the dialog is closed */
  entry: LibraryEntry | null;
  /** The entry's shown name */
  name: string;
  onHide: () => void;
}

/** An entry's Information: statistics over all of its photos that are not hidden, fetched when it opens. */
export const EntryInfoDialog: React.FC<EntryInfoDialogProps> = ({ entry, name, onHide }) => {
  const { t } = useTranslation();
  const libraryVersion = usePalomaStore((state) => state.libraryVersion);
  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setStats(null);
    setError(null);
    fetchPhotoStats(entrySelection(entry), currentLanguage())
      .then((result) => { if (!cancelled) setStats(result); })
      .catch((err) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, [entry, libraryVersion]);

  const Icon = entry ? entryIcon(entry).icon : null;
  return (
    <Modal show={entry !== null} onHide={onHide} centered scrollable>
      <Modal.Header closeButton closeLabel={t('common.close')}>
        <Modal.Title className="d-flex align-items-center gap-2 text-truncate">
          {Icon && entry && <Icon size={24} className={`flex-shrink-0 ${entryIcon(entry).iconClass}`} aria-hidden="true" />}
          <span dir="auto" className="text-truncate">{name}</span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="fs-5">
        {error != null && <Alert variant="danger" className="mb-0">{describeError(error, t)}</Alert>}
        {error == null && stats === null && (
          <div className="d-flex align-items-center gap-2 text-secondary">
            <Spinner animation="border" size="sm" />
            <span>{t('entryInfo.loading')}</span>
          </div>
        )}
        {entry && stats && <EntryStats entry={entry} stats={stats} onNavigate={onHide} />}
      </Modal.Body>
    </Modal>
  );
};
