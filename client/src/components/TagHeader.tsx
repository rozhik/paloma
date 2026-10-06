import React from 'react';
import { Tag } from 'lucide-react';
import type { Photo } from '../../../shared/types.js';
import { useFormat } from '../i18n/format.js';
import { SlideshowButton } from './slideshow/SlideshowButton.js';

interface TagHeaderProps {
  tag: string;
  /** The tag's photos as the grid shows them */
  photos: Photo[];
}

/** Above the grid of a tag: its name, its number of photos and the slideshow. */
export const TagHeader: React.FC<TagHeaderProps> = ({ tag, photos }) => {
  const { formatNumber } = useFormat();
  return (
    <div className="album-header tag-header pal-surface border-bottom px-4 py-3 d-flex align-items-center justify-content-between gap-3">
      <h4 className="fw-bold mb-0 d-flex align-items-center gap-2 text-truncate">
        <Tag size={24} className="text-info flex-shrink-0" />
        <span dir="auto" className="text-truncate">{tag}</span>
        <span className="badge pal-badge fs-6">{formatNumber(photos.length)}</span>
      </h4>
      <SlideshowButton photos={photos} />
    </div>
  );
};
