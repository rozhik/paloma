import React from 'react';
import type { Photo } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useTranslation } from 'react-i18next';
import { Star, CheckCircle, Circle, MapPin, Sliders } from 'lucide-react';
import { usePlaceLabel } from './placeLabel.js';

interface PhotoCardProps {
  photo: Photo;
  onStarToggle: (photoId: number, currentStarred: boolean) => void;
  /** Opens the photo viewer on this photo */
  onOpen: () => void;
}

/**
 * A photo in the grid. A click (or Enter) opens the viewer; the top-start checkbox, Ctrl/Cmd+click or Space
 * selects it; the top-end star stars it.
 */
export const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onStarToggle, onOpen }) => {
  const { toggleSelectPhoto, isPhotoSelected } = usePalomaStore();
  const { t } = useTranslation();
  const placeLabel = usePlaceLabel();
  const selected = isPhotoSelected(photo.id);

  return (
    <div
      className={`photo-card ${selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={photo.filename}
      onClick={(event) => (event.ctrlKey || event.metaKey ? toggleSelectPhoto(photo) : onOpen())}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpen();
        } else if (event.key === ' ') {
          event.preventDefault();
          toggleSelectPhoto(photo);
        }
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        className="select-btn"
        aria-label={t('photo.select')}
        title={t('photo.select')}
        onClick={(e) => {
          e.stopPropagation();
          toggleSelectPhoto(photo);
        }}
      >
        {selected ? <CheckCircle size={28} fill="#0284c7" color="#ffffff" /> : <Circle size={28} color="#ffffff" />}
      </button>

      <button
        type="button"
        className={`star-btn ${photo.isStarred ? 'starred' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onStarToggle(photo.id, photo.isStarred);
        }}
        title={photo.isStarred ? t('photo.unstar') : t('photo.star')}
      >
        <Star size={20} fill={photo.isStarred ? '#f59e0b' : 'none'} />
      </button>

      <div style={{ aspectRatio: '1 / 1', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
        <img
          src={photo.thumbnailUrl}
          alt={photo.filename}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      <div className="p-2 d-flex align-items-center justify-content-between bg-white">
        <span dir="auto" className="text-truncate fs-6 fw-semibold" style={{ maxWidth: '70%' }} title={photo.filename}>
          {photo.filename}
        </span>
        <div className="d-flex align-items-center gap-1">
          {photo.edits && <span title={t('photo.edited')}><Sliders size={16} className="text-primary" /></span>}
          {photo.latitude !== null && (
            <span title={placeLabel(photo) ?? undefined} aria-label={t('photo.geotagged')}>
              <MapPin size={16} className="text-danger" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
