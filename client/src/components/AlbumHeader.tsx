import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookImage, MapPin, Pencil, Trash2 } from 'lucide-react';
import type { Album, Photo } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { fetchAlbums } from '../api/albums.js';
import { useFormat } from '../i18n/format.js';
import { AlbumDialogs, type AlbumDialog } from './AlbumDialogs.js';
import { useAllows } from '../levels/controls.js';
import { SlideshowButton } from './slideshow/SlideshowButton.js';
import { FaceDetectionButton } from '../faces/FaceDetectionButton.js';
import { AiMenu } from '../ai/AiMenu.js';

interface AlbumHeaderProps {
  token: string;
  /** The album's photos as the grid shows them, for the slideshow */
  photos: Photo[];
}

export const AlbumHeader: React.FC<AlbumHeaderProps> = ({ token, photos }) => {
  const { libraryVersion, setSelectedFilter } = usePalomaStore();
  const [album, setAlbum] = useState<Album | null>(null);
  const [dialog, setDialog] = useState<AlbumDialog | null>(null);
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const canEdit = useAllows('album.editProperties');
  const canDelete = useAllows('album.delete');

  useEffect(() => {
    let cancelled = false;
    fetchAlbums()
      .then((albums) => {
        if (cancelled) return;
        const found = albums.find((a) => a.token === token);
        // The album is gone (deleted, or its last photo removed): go back to all photos
        if (!found) setSelectedFilter('all');
        else setAlbum(found);
      })
      .catch((err) => console.error('Failed to fetch albums:', err));
    return () => { cancelled = true; };
  }, [token, libraryVersion]);

  if (!album) return null;

  return (
    <div className="album-header pal-surface border-bottom px-4 py-3">
      <div className="d-flex align-items-start justify-content-between gap-3">
        <div className="text-truncate">
          <h4 className="fw-bold mb-1 d-flex align-items-center gap-2">
            <BookImage size={24} className="text-primary flex-shrink-0" />
            <span dir="auto" className={`text-truncate ${album.name === null ? 'fst-italic' : ''}`}>{album.name ?? t('common.untitled')}</span>
            <span className="badge pal-badge fs-6">{formatNumber(album.photoCount)}</span>
          </h4>
          {album.description && <p dir="auto" className="mb-1 fs-5 text-body-secondary" style={{ whiteSpace: 'pre-line' }}>{album.description}</p>}
          {album.location && (
            <p className="mb-0 text-muted d-flex align-items-center gap-1"><MapPin size={16} /> <span dir="auto">{album.location}</span></p>
          )}
        </div>
        <div className="d-flex gap-2 flex-shrink-0 flex-wrap">
          <FaceDetectionButton photos={photos} />
          <AiMenu photos={photos} />
          <SlideshowButton photos={photos} />
          {canEdit && (
            <button className="btn btn-outline-primary btn-lg-custom" onClick={() => setDialog('properties')}>
              <Pencil size={18} />
              <span>{t('album.properties')}</span>
            </button>
          )}
          {canDelete && (
            <button className="btn btn-outline-danger btn-lg-custom" onClick={() => setDialog('delete')}>
              <Trash2 size={18} />
              <span>{t('album.delete')}</span>
            </button>
          )}
        </div>
      </div>
      <AlbumDialogs album={album} open={dialog} onClose={() => setDialog(null)} />
    </div>
  );
};
