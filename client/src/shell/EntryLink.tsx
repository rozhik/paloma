import React from 'react';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useLevel } from '../levels/controls.js';
import { entryIcon, entryListAllowed, openEntry, type LibraryEntry } from './entries.js';

/** Goes to the entry: closes the viewer, shows the library and opens the entry there. */
export function followEntryLink(entry: LibraryEntry): void {
  const { closeViewer, setCurrentView } = usePalomaStore.getState();
  closeViewer();
  setCurrentView('library');
  openEntry(entry);
}

interface EntryLinkProps {
  entry: LibraryEntry;
  label: string;
  /** The label is a placeholder, like "Untitled" */
  placeholder?: boolean;
  /** Called before going to the entry, e.g. to close the dialog the link is in */
  onNavigate?: () => void;
  iconSize?: number;
  className?: string;
}

/**
 * A folder, album, tag or person named somewhere in the UI: its sidebar icon and its name, which opens it in the
 * library. Below the level of the entry's sidebar list it is plain text.
 */
export const EntryLink: React.FC<EntryLinkProps> = ({ entry, label, placeholder = false, onNavigate, iconSize = 16, className = '' }) => {
  const level = useLevel();
  const { icon: Icon, iconClass } = entryIcon(entry);
  const content = (
    <>
      <Icon size={iconSize} className={`flex-shrink-0 ${iconClass}`} aria-hidden="true" />
      <span dir="auto" className={`text-truncate ${placeholder ? 'fst-italic' : ''}`}>{label}</span>
    </>
  );
  if (!entryListAllowed(level, entry.kind)) {
    return <span className={`entry-link d-inline-flex align-items-center gap-1 mw-100 ${className}`}>{content}</span>;
  }
  return (
    <button
      type="button"
      className={`entry-link btn btn-link p-0 border-0 d-inline-flex align-items-center gap-1 mw-100 text-start ${className}`}
      onClick={() => {
        onNavigate?.();
        followEntryLink(entry);
      }}
    >
      {content}
    </button>
  );
};
