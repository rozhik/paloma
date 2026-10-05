import type React from 'react';
import type { Photo } from '../../../../shared/types.js';
import type { AppView } from '../../store/usePalomaStore.js';
import type { SkinTokens } from '../css.js';
import type { SkinId } from './ids.js';
import type { ViewerChromeProps } from '../../components/viewer/ViewerChrome.js';

/** Opens the tray's dialogs, which live outside the shell. */
export interface TrayHandlers {
  onOpenExport: () => void;
  onOpenPrint: () => void;
  onOpenMovie: () => void;
}

/** The app frame of a skin: navigation, sidebar and tray, around the active view. */
export interface AppShellProps {
  view: AppView;
  tray: TrayHandlers;
  /** The active view's content: the library grid, map, plugins or settings */
  children: React.ReactNode;
}

/** The library grid of a skin, with its photo cards. */
export interface PhotoGridProps {
  photos: Photo[];
  onStarToggle: (photoId: number, currentStarred: boolean) => void;
}

/** The parts of the UI a skin builds with its own components. */
export interface SkinComponents {
  AppShell: React.ComponentType<AppShellProps>;
  PhotoGrid: React.ComponentType<PhotoGridProps>;
  /** The viewer's bars and panel over the photo */
  ViewerChrome: React.ComponentType<ViewerChromeProps>;
}

/** A skin: its token values, a few sizes code needs as numbers, and its components (loaded on demand). */
export interface SkinDefinition extends SkinTokens {
  id: SkinId;
  /**
   * Photo grid cells in CSS pixels: the smallest cell width (matching `--pal-thumb-size`), and how much taller
   * than wide a cell is, for a caption under the square thumbnail
   */
  grid: { columnWidth: number; captionHeight: number };
  /** Viewer bar thickness in CSS pixels; matches `--pal-viewer-bar-size` */
  viewerBarSize: number;
  /** The skin's components and stylesheet */
  load: () => Promise<SkinComponents>;
}
