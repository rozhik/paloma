import React from 'react';
import { User } from 'lucide-react';
import { avatarUrl } from '../api/people.js';

interface PersonAvatarProps {
  id: string;
  version: string | null;
  /** Width and height in CSS pixels */
  size: number;
  className?: string;
}

/** A person's avatar, round; a placeholder when they have no face to show. Decorative: the name is next to it. */
export const PersonAvatar: React.FC<PersonAvatarProps> = ({ id, version, size, className }) => {
  const url = avatarUrl(id, version);
  const style = { width: size, height: size };
  return url
    ? <img src={url} alt="" className={`person-avatar ${className ?? ''}`} style={style} draggable={false} />
    : (
      <span className={`person-avatar person-avatar-placeholder ${className ?? ''}`} style={style} aria-hidden="true">
        <User size={Math.round(size * 0.6)} />
      </span>
    );
};
