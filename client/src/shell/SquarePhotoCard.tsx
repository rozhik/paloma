import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Circle, MapPin, Sliders, Star } from 'lucide-react';
import type { Photo } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { usePlaceLabel } from '../components/placeLabel.js';

interface SquarePhotoCardProps {
  photo: Photo;
  onStarToggle: (photoId: number, currentStarred: boolean) => void;
  onOpen: () => void;
  /** The skin's card class */
  className: string;
  iconSize?: number;
}

/**
 * A square thumbnail card without a caption; the name shows on hover and to screen readers. A click (or Enter)
 * opens the viewer; the checkbox, Ctrl/Cmd+click or Space selects it; the star stars it.
 */
export const SquarePhotoCard: React.FC<SquarePhotoCardProps> = ({ photo, onStarToggle, onOpen, className, iconSize = 18 }) => {
  const { t } = useTranslation();
  const { toggleSelectPhoto, isPhotoSelected } = usePalomaStore();
  const placeLabel = usePlaceLabel();
  const selected = isPhotoSelected(photo.id);
  return (
    <div
      className={`photo-card square-card ${className} ${selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={photo.filename}
      title={photo.filename}
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
        {selected ? <CheckCircle size={iconSize + 5} className="select-mark" /> : <Circle size={iconSize + 5} />}
      </button>
      <button
        type="button"
        className={`star-btn ${photo.isStarred ? 'starred' : ''}`}
        aria-label={photo.isStarred ? t('photo.unstar') : t('photo.star')}
        aria-pressed={photo.isStarred}
        title={photo.isStarred ? t('photo.unstar') : t('photo.star')}
        onClick={(e) => {
          e.stopPropagation();
          onStarToggle(photo.id, photo.isStarred);
        }}
      >
        <Star size={iconSize} fill={photo.isStarred ? 'currentColor' : 'none'} />
      </button>
      <div className="photo-card-thumb">
        <img src={photo.thumbnailUrl} alt={photo.filename} loading="lazy" />
      </div>
      {(photo.edits || photo.latitude !== null) && (
        <div className="square-card-badges">
          {photo.edits && <span title={t('photo.edited')}><Sliders size={iconSize - 3} /></span>}
          {photo.latitude !== null && <span title={placeLabel(photo) ?? undefined} aria-label={t('photo.geotagged')}><MapPin size={iconSize - 3} /></span>}
        </div>
      )}
    </div>
  );
};
