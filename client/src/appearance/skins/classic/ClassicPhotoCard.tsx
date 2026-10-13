import React from 'react';
import type { Photo } from '../../../../../shared/types.js';
import { usePalomaStore } from '../../../store/usePalomaStore.js';
import { useTranslation } from 'react-i18next';
import { Star, CheckCircle, Circle, MapPin } from 'lucide-react';
import { usePlaceLabel } from '../../../components/placeLabel.js';
import { useAllows } from '../../../levels/controls.js';
import { ModifiedMark } from '../../../shell/ModifiedMark.js';

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
export const ClassicPhotoCard: React.FC<PhotoCardProps> = ({ photo, onStarToggle, onOpen }) => {
  const { toggleSelectPhoto, isPhotoSelected } = usePalomaStore();
  const { t } = useTranslation();
  const placeLabel = usePlaceLabel();
  // Below their levels (at Child) a card only opens the viewer
  const canSelect = useAllows('photo.select');
  const canStar = useAllows('photo.star');
  const selected = canSelect && isPhotoSelected(photo.id);

  return (
    <div
      className={`photo-card ${selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={photo.filename}
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
          {selected ? <CheckCircle size={28} className="select-mark" /> : <Circle size={28} />}
        </button>
      )}

      {canStar && (
        <button
          type="button"
          className={`star-btn ${photo.isStarred ? 'starred' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onStarToggle(photo.id, photo.isStarred);
          }}
          title={photo.isStarred ? t('photo.unstar') : t('photo.star')}
          aria-label={photo.isStarred ? t('photo.unstar') : t('photo.star')}
          aria-pressed={photo.isStarred}
        >
          <Star size={20} fill={photo.isStarred ? 'currentColor' : 'none'} />
        </button>
      )}

      <div className="photo-card-thumb">
        <img src={photo.thumbnailUrl} alt={photo.filename} loading="lazy" />
        <ModifiedMark photo={photo} size={18} />
      </div>

      <div className="p-2 d-flex align-items-center justify-content-between">
        <span dir="auto" className="text-truncate fs-6 fw-semibold" style={{ maxWidth: '70%' }} title={photo.filename}>
          {photo.filename}
        </span>
        <div className="d-flex align-items-center gap-1">
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
