import React, { useMemo } from 'react';
import type { Photo } from '../../../shared/types.js';
import { useTranslation } from 'react-i18next';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { PhotoCard } from './PhotoCard.js';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeGrid as Grid, type GridChildComponentProps } from 'react-window';

interface VirtualPhotoGridProps {
  photos: Photo[];
  onStarToggle: (photoId: number, currentStarred: boolean) => void;
}

interface CellData {
  photos: Photo[];
  columnCount: number;
  onStarToggle: (photoId: number, currentStarred: boolean) => void;
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
    <div style={{ ...style, padding: '8px' }}>
      <PhotoCard photo={data.photos[index]} onStarToggle={data.onStarToggle} onOpen={() => data.onOpen(index)} />
    </div>
  );
};

const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 240;

export const VirtualPhotoGrid: React.FC<VirtualPhotoGridProps> = ({ photos, onStarToggle }) => {
  const { t, i18n } = useTranslation();
  const openViewer = usePalomaStore((state) => state.openViewer);

  if (photos.length === 0) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center p-5">
        <div className="fs-1 mb-3">🖼️</div>
        <h4 className="fw-bold">{t('grid.emptyTitle')}</h4>
        <p className="text-muted fs-5">{t('grid.emptyHint')}</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, height: '100%', width: '100%', padding: '12px' }}>
      <AutoSizer>
        {({ height, width }) => (
          <SizedGrid
            photos={photos}
            width={width}
            height={height}
            direction={i18n.dir()}
            onStarToggle={onStarToggle}
            onOpen={(index) => openViewer(photos, index)}
          />
        )}
      </AutoSizer>
    </div>
  );
};

interface SizedGridProps {
  photos: Photo[];
  width: number;
  height: number;
  direction: 'ltr' | 'rtl';
  onStarToggle: CellData['onStarToggle'];
  onOpen: CellData['onOpen'];
}

const SizedGrid: React.FC<SizedGridProps> = ({ photos, width, height, direction, onStarToggle, onOpen }) => {
  const columnCount = Math.max(1, Math.floor(width / COLUMN_WIDTH));
  const rowCount = Math.ceil(photos.length / columnCount);
  const itemData = useMemo<CellData>(
    () => ({ photos, columnCount, onStarToggle, onOpen }),
    [photos, columnCount, onStarToggle, onOpen],
  );
  return (
    <Grid
      direction={direction}
      columnCount={columnCount}
      columnWidth={width / columnCount}
      height={height}
      rowCount={rowCount}
      rowHeight={ROW_HEIGHT}
      width={width}
      itemData={itemData}
    >
      {Cell}
    </Grid>
  );
};
