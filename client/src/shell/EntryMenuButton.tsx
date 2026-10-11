import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { MoreVertical } from 'lucide-react';
import type { Album } from '../../../shared/types.js';
import { fetchAlbums } from '../api/albums.js';
import { useAllows } from '../levels/controls.js';
import { AlbumDialogs, type AlbumDialog } from '../components/AlbumDialogs.js';
import { EntryInfoDialog } from './EntryInfoDialog.js';
import { useEntryMenuItems } from './entryMenu.js';
import type { LibraryEntry } from './entries.js';

/** The menu's toggle: an icon button, without the dropdown caret. */
const Toggle = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => <button ref={ref} type="button" {...props} className={`entry-menu-btn ${className ?? ''}`} />,
);
Toggle.displayName = 'EntryMenuToggle';

interface EntryMenuButtonProps {
  entry: LibraryEntry;
  /** The entry's shown name, for the button's name and the Information title */
  name: string;
  /** The skin's button classes */
  className?: string;
  iconSize?: number;
}

/**
 * The menu of a sidebar entry, next to its count: the actions of its grid header, Map and Information, at the
 * active level, acting on the entry without changing what the library shows. The open menu is drawn over the
 * page, so a scrolling or floating sidebar does not clip it.
 */
export const EntryMenuButton: React.FC<EntryMenuButtonProps> = ({ entry, name, className, iconSize = 18 }) => {
  const { t } = useTranslation();
  const allowed = useAllows('entry.menu');
  const [show, setShow] = useState(false);
  const [info, setInfo] = useState<LibraryEntry | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [albumDialog, setAlbumDialog] = useState<AlbumDialog | null>(null);

  const openAlbumDialog = (dialog: AlbumDialog) => {
    if (entry.kind !== 'album') return;
    const token = entry.token;
    fetchAlbums()
      .then((albums) => {
        const found = albums.find((a) => a.token === token);
        if (!found) return;
        setAlbum(found);
        setAlbumDialog(dialog);
      })
      .catch((err) => console.error('Failed to fetch albums:', err));
  };

  const items = useEntryMenuItems(entry, {
    showInfo: () => setInfo(entry),
    showAlbumProperties: () => openAlbumDialog('properties'),
    confirmAlbumDelete: () => openAlbumDialog('delete'),
  });
  if (!allowed || items.length === 0) return null;

  const label = t('entryMenu.open', { name });
  return (
    <>
      <Dropdown show={show} onToggle={(next) => setShow(next)} align="end" className="entry-menu flex-shrink-0">
        <Dropdown.Toggle as={Toggle} className={className} aria-label={label} title={label}>
          <MoreVertical size={iconSize} aria-hidden="true" />
        </Dropdown.Toggle>
        {show && createPortal(
          <Dropdown.Menu className="entry-menu-items shadow" popperConfig={{ strategy: 'fixed' }}>
            {items.map(({ id, key, label: itemLabel, icon: Icon, danger, disabled, hint, header, run }) => (
              <React.Fragment key={key}>
                {header && <Dropdown.Header>{header}</Dropdown.Header>}
                <Dropdown.Item
                  as="button"
                  type="button"
                  disabled={disabled}
                  className={danger ? 'text-danger' : undefined}
                  data-entry-action={id}
                  onClick={() => {
                    setShow(false);
                    run();
                  }}
                >
                  <span className="d-flex align-items-center gap-2">
                    <Icon size={18} aria-hidden="true" />
                    <span>{itemLabel}</span>
                  </span>
                  {hint && <small className="d-block text-wrap text-secondary ms-4">{hint}</small>}
                </Dropdown.Item>
              </React.Fragment>
            ))}
          </Dropdown.Menu>,
          document.body,
        )}
      </Dropdown>
      <EntryInfoDialog entry={info} name={name} onHide={() => setInfo(null)} />
      <AlbumDialogs album={album} open={albumDialog} onClose={() => setAlbumDialog(null)} />
    </>
  );
};
