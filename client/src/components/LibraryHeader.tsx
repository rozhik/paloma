import React from 'react';
import type { Photo } from '../../../shared/types.js';
import { SlideshowButton } from './slideshow/SlideshowButton.js';
import { FaceDetectionButton } from '../faces/FaceDetectionButton.js';
import { AiMenu } from '../ai/AiMenu.js';

/** Above the grid of a folder, shortcut or search: finding faces and running AI tasks on the grid's photos, and playing them. */
export const LibraryHeader: React.FC<{ photos: Photo[] }> = ({ photos }) => (
  <div className="album-header library-header pal-surface border-bottom px-4 py-2 d-flex justify-content-end gap-2 flex-wrap">
    <FaceDetectionButton photos={photos} />
    <AiMenu photos={photos} />
    <SlideshowButton photos={photos} />
  </div>
);
