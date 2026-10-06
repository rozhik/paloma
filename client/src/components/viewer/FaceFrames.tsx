import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditStep, PhotoPeople } from '../../../../shared/types.js';
import { addPersonToPhoto, fetchPhotoPeople } from '../../api/people.js';
import { PersonPicker } from '../../people/PersonPicker.js';
import { usePalomaStore } from '../../store/usePalomaStore.js';
import { faceRectMapper, rectStyle } from './faceRects.js';

interface FaceFramesViewProps {
  people: PhotoPeople;
  /** The edit steps of the picture shown, which the frames follow */
  steps: readonly EditStep[];
  /** Activating an unassigned frame chooses who it is; without it unassigned frames are only drawn */
  onAssign?: (faceId: number) => void;
}

/**
 * Frames over the photo, in the photo's own box so they follow zoom and pan: people's marks labelled with their
 * names, unassigned detected faces dashed. Nothing is drawn when the edits warp the picture.
 */
export const FaceFramesView: React.FC<FaceFramesViewProps> = ({ people, steps, onAssign }) => {
  const { t } = useTranslation();
  const mapper = useMemo(() => faceRectMapper(steps), [steps]);
  if (mapper === null) return <div className="face-frames-note" role="status">{t('viewer.facesUnavailable')}</div>;

  return (
    <div className="face-frames" aria-label={t('viewer.faces')}>
      {people.people.flatMap((person) => person.rects.map((rect, index) => {
        const shown = mapper(rect);
        if (!shown) return null;
        const name = person.name ?? t('info.unknownPerson');
        return (
          <div key={`${person.id}:${index}`} className="face-frame" style={rectStyle(shown)}>
            <span dir="auto" className={`face-frame-label ${shown.top < 0.08 ? 'inside' : ''} ${person.name === null ? 'fst-italic' : ''}`}>{name}</span>
          </div>
        );
      }))}
      {people.faces.map((face, index) => {
        const shown = mapper(face.rect);
        if (!shown) return null;
        const label = t('info.whoIsThis', { index: index + 1 });
        return onAssign
          ? <button key={face.id} type="button" className="face-frame unassigned" style={rectStyle(shown)} aria-label={label} title={label} onClick={() => onAssign(face.id)} />
          : <div key={face.id} className="face-frame unassigned" style={rectStyle(shown)} />;
      })}
    </div>
  );
};

/** Loads the photo's people and faces and draws their frames; assigns a face chosen on its frame. */
export const FaceFrames: React.FC<{ photoId: number; steps: readonly EditStep[]; canAssign: boolean }> = ({ photoId, steps, canAssign }) => {
  const { t } = useTranslation();
  const libraryVersion = usePalomaStore((state) => state.libraryVersion);
  const bumpLibrary = usePalomaStore((state) => state.bumpLibrary);
  const [people, setPeople] = useState<PhotoPeople | null>(null);
  const [assigning, setAssigning] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPhotoPeople(photoId)
      .then((found) => { if (!cancelled) setPeople(found); })
      .catch((err) => console.error('Failed to fetch the people on the photo:', err));
    return () => { cancelled = true; };
  }, [photoId, libraryVersion]);

  if (!people) return null;
  return (
    <>
      <FaceFramesView people={people} steps={steps} onAssign={canAssign ? setAssigning : undefined} />
      <PersonPicker
        show={assigning !== null}
        title={t('info.whoIsThisTitle')}
        onHide={() => setAssigning(null)}
        onPick={async (personId) => {
          setPeople(await addPersonToPhoto(photoId, personId, assigning!));
          bumpLibrary();
        }}
      />
    </>
  );
};
