import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Circle, MapPin, Star } from 'lucide-react';
import type { Photo } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { usePlaceLabel } from '../components/placeLabel.js';
import { useAllows } from '../levels/controls.js';
import { ModifiedMark } from './ModifiedMark.js';

interface SquarePhotoCardProps {
  photo: Photo;
  onStarToggle: (photoId: number, currentStarred: boolean) => void;
  onOpen: () => void;
  /** The skin's card class */
  className: string;
  iconSize?: number;
}

/**
 * A square thumbnail card without a caption; the name shows on hover and to screen readers. A click opens the viewer;
 * the checkbox or Ctrl/Cmd+click selects it; the star stars it. Its keys are Library actions of the grid (VirtualGrid).
 */
export const SquarePhotoCard: React.FC<SquarePhotoCardProps> = ({ photo, onStarToggle, onOpen, className, iconSize = 18 }) => {
  const { t } = useTranslation();
  const { toggleSelectPhoto, isPhotoSelected } = usePalomaStore();
  const placeLabel = usePlaceLabel();
  // Below their levels (at Child) a card only opens the viewer
  const canSelect = useAllows('photo.select');
  const canStar = useAllows('photo.star');
  const selected = canSelect && isPhotoSelected(photo.id);
  return (
    <div
      className={`photo-card square-card ${className} ${selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={photo.filename}
      title={photo.filename}
      onClick={(event) => (canSelect && (event.ctrlKey || event.metaKey) ? toggleSelectPhoto(photo) : onOpen())}
    >
      {canSelect && (
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
      )}
      {canStar && (
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
      )}
      <div className="photo-card-thumb">
        <img src={photo.thumbnailUrl} alt={photo.filename} loading="lazy" />
        <ModifiedMark photo={photo} size={iconSize - 3} />
      </div>
      {photo.latitude !== null && (
        <div className="square-card-badges">
          <span title={placeLabel(photo) ?? undefined} aria-label={t('photo.geotagged')}><MapPin size={iconSize - 3} /></span>
        </div>
      )}
    </div>
  );
};
