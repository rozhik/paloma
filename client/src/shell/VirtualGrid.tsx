import React, { forwardRef, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeGrid as Grid, type GridChildComponentProps } from 'react-window';
import type { Photo } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useNeedsAlbum } from './useLibraryPhotos.js';
import { LAYER, useKeyActions } from '../keys/dispatcher.js';
import { enterFullscreen } from '../components/slideshow/Slideshow.js';
import { slideshowStart } from '../components/slideshow/slideshowStart.js';

/** Draws one photo card; `open` opens the viewer on it. */
export type RenderCard = (photo: Photo, open: () => void) => React.ReactNode;

interface CellData {
  photos: Photo[];
  columnCount: number;
  gap: number;
  renderCard: RenderCard;
  onOpen: (index: number) => void;
}

/**
 * One grid cell. It is a stable component, not an inline function, so cells are not remounted when the
 * grid re-renders, and a focused card keeps its keyboard focus (e.g. after Space selects it).
 */
const Cell: React.FC<GridChildComponentProps<CellData>> = ({ columnIndex, rowIndex, style, data }) => {
  const index = rowIndex * data.columnCount + columnIndex;
  if (index >= data.photos.length) return null;
  return (
    <div style={{ ...style, padding: data.gap / 2 }} data-photo-index={index}>
      {data.renderCard(data.photos[index], () => data.onOpen(index))}
    </div>
  );
};

interface VirtualGridProps {
  photos: Photo[];
  /** Smallest cell width; columns stretch to fill the row */
  columnWidth: number;
  /** A row is as tall as a cell is wide, plus this, for a caption under the square thumbnail */
  captionHeight: number;
  /** Space between cards */
  gap: number;
  renderCard: RenderCard;
  /** Space above the first row and below the last, which still scrolls: for content under floating bars */
  insetTop?: number;
  insetBottom?: number;
  className?: string;
}

/** The card a move by `delta` reaches from `from` (-1: no card focused, so the first), or null past either end. */
export function nextCardIndex(from: number, delta: number, count: number): number | null {
  const to = from < 0 ? 0 : from + delta;
  return to >= 0 && to < count ? to : null;
}

/** A virtualized photo grid, the same in every skin; each skin gives its own card and cell size. */
export const VirtualGrid: React.FC<VirtualGridProps> = ({ photos, insetTop = 0, insetBottom = 0, className, ...rest }) => {
  const { t, i18n } = useTranslation();
  const openViewer = usePalomaStore((state) => state.openViewer);
  const needsAlbum = useNeedsAlbum();

  if (photos.length === 0) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center p-5" style={{ paddingTop: insetTop }}>
        <div className="fs-1 mb-3">{needsAlbum ? '📚' : '🖼️'}</div>
        <h4 className="fw-bold">{needsAlbum ? t('grid.chooseAlbumTitle') : t('grid.emptyTitle')}</h4>
        <p className="text-muted fs-5">{needsAlbum ? t('grid.chooseAlbumHint') : t('grid.emptyHint')}</p>
      </div>
    );
  }

  return (
    <div className={className} style={{ flex: 1, height: '100%', width: '100%' }}>
      <AutoSizer>
        {({ height, width }) => (
          <SizedGrid
            {...rest}
            photos={photos}
            width={width}
            height={height}
            insetTop={insetTop}
            insetBottom={insetBottom}
            direction={i18n.dir()}
            onOpen={(index) => openViewer(photos, index)}
          />
        )}
      </AutoSizer>
    </div>
  );
};

interface SizedGridProps extends Omit<VirtualGridProps, 'className'> {
  width: number;
  height: number;
  insetTop: number;
  insetBottom: number;
  direction: 'ltr' | 'rtl';
  onOpen: (index: number) => void;
}

/** The scrolled content, taller by the insets, with the cells moved down by the top inset. */
const insetInner = (top: number, bottom: number) =>
  forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ style, children, ...props }, ref) => (
    <div ref={ref} {...props} style={{ ...style, height: Number(style?.height ?? 0) + top + bottom, position: 'relative' }}>
      <div style={{ position: 'absolute', top, left: 0, right: 0 }}>{children}</div>
    </div>
  ));

const SizedGrid: React.FC<SizedGridProps> = ({
  photos, width, height, columnWidth, captionHeight, gap, renderCard, insetTop, insetBottom, direction, onOpen,
}) => {
  const columnCount = Math.max(1, Math.floor(width / columnWidth));
  const cellWidth = width / columnCount;
  const rowCount = Math.ceil(photos.length / columnCount);
  const itemData = useMemo<CellData>(
    () => ({ photos, columnCount, gap, renderCard, onOpen }),
    [photos, columnCount, gap, renderCard, onOpen],
  );
  const innerElementType = useMemo(
    () => (insetTop || insetBottom ? insetInner(insetTop, insetBottom) : undefined),
    [insetTop, insetBottom],
  );
  const grid = useRef<Grid>(null);
  const outer = useRef<HTMLDivElement>(null);
  const { toggleSelectPhoto, selectPhotos, startSlideshow } = usePalomaStore.getState();
  /** The index of the card with keyboard focus, or -1 */
  const focused = (): number => {
    const cell = document.activeElement?.closest<HTMLElement>('[data-photo-index]');
    return cell && outer.current?.contains(cell) ? Number(cell.dataset.photoIndex) : -1;
  };
  const focus = (index: number) => {
    grid.current?.scrollToItem({ rowIndex: Math.floor(index / columnCount), columnIndex: index % columnCount });
    // The cell exists once the grid has scrolled to it
    requestAnimationFrame(() => outer.current?.querySelector<HTMLElement>(`[data-photo-index="${index}"] .photo-card`)?.focus());
  };
  /** Moves the focus by `delta` cards; without a focused card, to the first. A move past either end stays. */
  const move = (delta: number) => () => {
    const to = nextCardIndex(focused(), delta, photos.length);
    if (to !== null) focus(to);
  };
  const onFocused = (run: (index: number) => void) => ({ run: () => run(focused()), enabled: () => focused() >= 0 });
  // In a right-to-left grid the next card is on the left; the arrows were mirrored for the keymap already
  useKeyActions('library', LAYER.screen, {
    'library.open': onFocused(onOpen),
    'library.toggleSelect': onFocused((index) => toggleSelectPhoto(photos[index])),
    'library.focusPrevious': move(-1),
    'library.focusNext': move(1),
    'library.focusUp': move(-columnCount),
    'library.focusDown': move(columnCount),
    'library.selectAll': () => selectPhotos(photos),
    'library.slideshow': () => {
      // Full screen is allowed only while handling the key press
      enterFullscreen();
      startSlideshow(photos, slideshowStart(photos, usePalomaStore.getState().selectedPhotos));
    },
  });
  return (
    <Grid
      ref={grid}
      outerRef={outer}
      direction={direction}
      columnCount={columnCount}
      columnWidth={cellWidth}
      height={height}
      rowCount={rowCount}
      rowHeight={Math.ceil(cellWidth + captionHeight)}
      width={width}
      itemData={itemData}
      innerElementType={innerElementType}
    >
      {Cell}
    </Grid>
  );
};
