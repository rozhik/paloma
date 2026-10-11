import React from 'react';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import type { Photo } from '../../../shared/types.js';
import type { MemorySelection } from '../store/usePalomaStore.js';
import { useFormat } from '../i18n/format.js';
import { SlideshowButton } from '../components/slideshow/SlideshowButton.js';
import { FaceDetectionButton } from '../faces/FaceDetectionButton.js';
import { AiMenu } from '../ai/AiMenu.js';
import { memoryName } from './memoryName.js';

interface MemoryHeaderProps {
  memory: MemorySelection;
  /** The memory's photos as the grid shows them */
  photos: Photo[];
}

/** Above the grid of a memory: its name, its number of photos and days, face detection and the slideshow; a memory has no edits. */
export const MemoryHeader: React.FC<MemoryHeaderProps> = ({ memory, photos }) => {
  const { t } = useTranslation();
  const { formatNumber, formatDayRange } = useFormat();
  return (
    <div className="album-header memory-header pal-surface border-bottom px-4 py-3 d-flex align-items-center justify-content-between gap-3">
      <div className="min-w-0">
        <h4 className="fw-bold mb-1 d-flex align-items-center gap-2 text-truncate">
          <History size={24} className="text-secondary flex-shrink-0" />
          <span dir="auto" className="text-truncate">{memoryName(memory, t)}</span>
          <span className="badge pal-badge fs-6">{formatNumber(photos.length)}</span>
        </h4>
        <p className="mb-0 text-muted">{t('memories.taken', { range: formatDayRange(memory.from, memory.to) })}</p>
      </div>
      <div className="d-flex gap-2 flex-wrap">
        <FaceDetectionButton photos={photos} />
        <AiMenu photos={photos} />
        <SlideshowButton photos={photos} />
      </div>
    </div>
  );
};
