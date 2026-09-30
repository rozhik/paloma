import React from 'react';
import type { Photo } from '../../../shared/types.js';
import { PhotoCard } from './PhotoCard.js';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeGrid as Grid } from 'react-window';

interface VirtualPhotoGridProps {
  photos: Photo[];
  onStarToggle: (photoId: number, currentStarred: boolean) => void;
}

export const VirtualPhotoGrid: React.FC<VirtualPhotoGridProps> = ({ photos, onStarToggle }) => {
  if (photos.length === 0) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center p-5">
        <div className="fs-1 mb-3">🖼️</div>
        <h4 className="fw-bold">Світлин не знайдено</h4>
        <p className="text-muted fs-5">Додайте нову папку з фотографіями або змініть параметри пошуку.</p>
      </div>
    );
  }

  const COLUMN_WIDTH = 220;
  const ROW_HEIGHT = 240;

  return (
    <div style={{ flex: 1, height: '100%', width: '100%', padding: '12px' }}>
      <AutoSizer>
        {({ height, width }) => {
          const columnCount = Math.max(1, Math.floor(width / COLUMN_WIDTH));
          const rowCount = Math.ceil(photos.length / columnCount);

          return (
            <Grid
              columnCount={columnCount}
              columnWidth={width / columnCount}
              height={height}
              rowCount={rowCount}
              rowHeight={ROW_HEIGHT}
              width={width}
            >
              {({ columnIndex, rowIndex, style }) => {
                const index = rowIndex * columnCount + columnIndex;
                if (index >= photos.length) return null;
                const photo = photos[index];

                return (
                  <div style={{ ...style, padding: '8px' }}>
                    <PhotoCard photo={photo} onStarToggle={onStarToggle} />
                  </div>
                );
              }}
            </Grid>
          );
        }}
      </AutoSizer>
    </div>
  );
};
