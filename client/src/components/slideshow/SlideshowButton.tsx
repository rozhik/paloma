import React from 'react';
import { useTranslation } from 'react-i18next';
import { Presentation } from 'lucide-react';
import type { Photo } from '../../../../shared/types.js';
import { usePalomaStore } from '../../store/usePalomaStore.js';
import { useAllows } from '../../levels/controls.js';
import { enterFullscreen } from './Slideshow.js';
import { slideshowStart } from './slideshowStart.js';

/** Plays the grid's photos as a slideshow, from the first selected one; nothing when the grid is empty. */
export const SlideshowButton: React.FC<{ photos: Photo[] }> = ({ photos }) => {
  const { t } = useTranslation();
  const allowed = useAllows('slideshow');
  const selectedPhotos = usePalomaStore((state) => state.selectedPhotos);
  const startSlideshow = usePalomaStore((state) => state.startSlideshow);
  if (!allowed || photos.length === 0) return null;
  return (
    <button
      type="button"
      className="btn btn-primary btn-lg-custom"
      onClick={() => {
        // Full screen is allowed only during the click itself
        enterFullscreen();
        startSlideshow(photos, slideshowStart(photos, selectedPhotos));
      }}
    >
      <Presentation size={20} aria-hidden="true" />
      <span>{t('slideshow.start')}</span>
    </button>
  );
};
