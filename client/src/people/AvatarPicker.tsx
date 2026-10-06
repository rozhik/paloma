import React, { useEffect, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { PersonFace, RelativeRect } from '../../../shared/types.js';
import { faceCropUrl, fetchPersonFaces } from '../api/people.js';

interface AvatarPickerProps {
  personId: string;
  /** The face chosen in the editor; null for the default avatar */
  chosen: { photoId: number; rect: RelativeRect } | null;
  onChoose: (face: { photoId: number; rect: RelativeRect } | null) => void;
}

const same = (a: PersonFace, b: { photoId: number; rect: RelativeRect } | null) =>
  b !== null && a.photoId === b.photoId && Math.abs(a.rect.left - b.rect.left) < 1e-6 && Math.abs(a.rect.top - b.rect.top) < 1e-6
  && Math.abs(a.rect.right - b.rect.right) < 1e-6 && Math.abs(a.rect.bottom - b.rect.bottom) < 1e-6;

/** The person's faces with a rectangle; choosing one makes it the avatar. */
export const AvatarPicker: React.FC<AvatarPickerProps> = ({ personId, chosen, onChoose }) => {
  const { t } = useTranslation();
  const [faces, setFaces] = useState<PersonFace[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPersonFaces(personId).then((list) => { if (!cancelled) setFaces(list); }).catch(() => { if (!cancelled) setFaces([]); });
    return () => { cancelled = true; };
  }, [personId]);

  if (faces === null) return <Spinner animation="border" size="sm" role="status" aria-label={t('info.loading')} />;
  if (faces.length === 0) return <p className="opacity-75 mb-0">{t('people.noAvatarFaces')}</p>;
  return (
    <div className="avatar-picker d-flex flex-wrap gap-2" role="radiogroup" aria-label={t('people.avatar')}>
      <button
        type="button"
        role="radio"
        aria-checked={chosen === null}
        className={`btn btn-outline-secondary avatar-choice ${chosen === null ? 'active' : ''}`}
        onClick={() => onChoose(null)}
      >
        {t('people.defaultAvatar')}
      </button>
      {faces.map((face, index) => (
        <button
          key={`${face.photoId}:${index}`}
          type="button"
          role="radio"
          aria-checked={same(face, chosen)}
          aria-label={t('people.avatarFace', { index: index + 1 })}
          className={`btn p-0 avatar-choice ${same(face, chosen) ? 'active' : ''}`}
          onClick={() => onChoose({ photoId: face.photoId, rect: face.rect })}
        >
          <img src={faceCropUrl(face.photoId, face.rect, 96)} alt="" width={64} height={64} className="person-avatar" />
        </button>
      ))}
    </div>
  );
};
