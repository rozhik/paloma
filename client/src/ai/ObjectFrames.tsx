import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiObject, EditStep, PhotoAiResult } from '../../../shared/types.js';
import { faceRectMapper, rectStyle } from '../components/viewer/faceRects.js';
import { usePhotoAiResults } from './usePhotoAiResults.js';

/** The objects of every `objects` result, in the unedited photo. */
export const objectsOf = (results: readonly PhotoAiResult[]): AiObject[] => results.flatMap((result) => result.objects ?? []);

/** An object's label with its confidence, e.g. `dog 92%`. */
export function objectLabel(object: AiObject, language: string): string {
  if (object.confidence === null) return object.label;
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(object.confidence);
  return `${object.label} ${percent}`;
}

/**
 * Frames over the photo for the objects AI found, in the photo's own box so they follow zoom and pan and its
 * crop, rotate and flip edits, as face frames do. Nothing is drawn when the edits warp the picture.
 */
export const ObjectFramesView: React.FC<{ objects: readonly AiObject[]; steps: readonly EditStep[] }> = ({ objects, steps }) => {
  const { t, i18n } = useTranslation();
  const mapper = useMemo(() => faceRectMapper(steps), [steps]);
  if (mapper === null) return <div className="face-frames-note" role="status">{t('viewer.objectsUnavailable')}</div>;
  return (
    <div className="face-frames" aria-label={t('viewer.objects')}>
      {objects.map((object, index) => {
        const shown = mapper(object.rect);
        if (!shown) return null;
        return (
          <div key={index} className="face-frame object-frame" style={rectStyle(shown)}>
            <span dir="auto" className={`face-frame-label ${shown.top < 0.08 ? 'inside' : ''}`}>{objectLabel(object, i18n.language)}</span>
          </div>
        );
      })}
    </div>
  );
};

/** Loads the photo's AI results and draws the frames of their objects. */
export const ObjectFrames: React.FC<{ photoId: number; steps: readonly EditStep[] }> = ({ photoId, steps }) => {
  const { results } = usePhotoAiResults(photoId);
  if (!results) return null;
  return <ObjectFramesView objects={objectsOf(results)} steps={steps} />;
};
