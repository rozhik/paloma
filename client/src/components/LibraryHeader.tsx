import React from 'react';
import type { Photo } from '../../../shared/types.js';
import { SlideshowButton } from './slideshow/SlideshowButton.js';

/** Above the grid of a folder, shortcut or search: what the grid's photos can be played as. */
export const LibraryHeader: React.FC<{ photos: Photo[] }> = ({ photos }) => (
  <div className="album-header library-header pal-surface border-bottom px-4 py-2 d-flex justify-content-end">
    <SlideshowButton photos={photos} />
  </div>
);
