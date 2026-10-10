import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sliders } from 'lucide-react';
import type { Photo } from '../../../shared/types.js';

/** Whether the photo has a saved edit chain with at least one step. */
export const isModified = (photo: Photo): boolean => (photo.edits?.length ?? 0) > 0;

/** Over a card's thumbnail, in its bottom-start corner in every skin: the photo has saved edits. */
export const ModifiedMark: React.FC<{ photo: Photo; size?: number }> = ({ photo, size = 16 }) => {
  const { t } = useTranslation();
  if (!isModified(photo)) return null;
  const label = t('photo.edited');
  return (
    <span className="photo-modified-mark" role="img" aria-label={label} title={label}>
      <Sliders size={size} aria-hidden="true" />
    </span>
  );
};
