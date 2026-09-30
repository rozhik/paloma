import React from 'react';
import type { Photo } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { Star, CheckCircle, MapPin, Sliders } from 'lucide-react';

interface PhotoCardProps {
  photo: Photo;
  onStarToggle: (photoId: number, currentStarred: boolean) => void;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onStarToggle }) => {
  const { toggleSelectPhoto, isPhotoSelected, setActiveEditPhoto } = usePalomaStore();
  const selected = isPhotoSelected(photo.id);

  return (
    <div
      className={`photo-card ${selected ? 'selected' : ''}`}
      onClick={() => toggleSelectPhoto(photo)}
      onDoubleClick={() => setActiveEditPhoto(photo)}
    >
      <button
        type="button"
        className={`star-btn ${photo.isStarred ? 'starred' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onStarToggle(photo.id, photo.isStarred);
        }}
        title={photo.isStarred ? 'Видалити з обраного' : 'Додати в обране'}
      >
        <Star size={20} fill={photo.isStarred ? '#f59e0b' : 'none'} />
      </button>

      {selected && (
        <div className="position-absolute top-0 start-0 m-2 z-3 text-primary">
          <CheckCircle size={28} fill="#0284c7" color="#ffffff" />
        </div>
      )}

      <div style={{ aspectRatio: '1 / 1', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
        <img
          src={photo.thumbnailUrl}
          alt={photo.filename}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      <div className="p-2 d-flex align-items-center justify-content-between bg-white">
        <span className="text-truncate fs-6 fw-semibold" style={{ maxWidth: '70%' }} title={photo.filename}>
          {photo.filename}
        </span>
        <div className="d-flex align-items-center gap-1">
          {photo.edits && <span title="Відредаговано"><Sliders size={16} className="text-primary" /></span>}
          {photo.latitude !== null && <span title="Геомітка"><MapPin size={16} className="text-danger" /></span>}
        </div>
      </div>
    </div>
  );
};
