import { useTranslation } from 'react-i18next';
import type { Photo } from '../../../shared/types.js';
import { useFormat } from '../i18n/format.js';

/** Where a photo was taken, in words: its place name, or its coordinates until the place is known; null without a location. */
export function usePlaceLabel() {
  const { t } = useTranslation();
  const { formatDegrees } = useFormat();
  return (photo: Pick<Photo, 'latitude' | 'longitude' | 'place'>): string | null => {
    if (photo.latitude === null || photo.longitude === null) return null;
    return photo.place || t('geo.coordinates', { lat: formatDegrees(photo.latitude), lon: formatDegrees(photo.longitude) });
  };
}
