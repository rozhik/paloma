import React, { useRef } from 'react';
import type { RelativeRect } from '../../../shared/types.js';
import { dragCorner, moveFrame, type Handle } from './cropFrame.js';

interface CropOverlayProps {
  rect: RelativeRect;
  /** Frame width:height in pixels, or null for free */
  ratio: number | null;
  /** Width/height of the image under the overlay */
  imageAspect: number;
  onChange: (rect: RelativeRect) => void;
  label: string;
}

const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se'];
const pct = (value: number) => `${value * 100}%`;

/**
 * A draggable crop frame over an image. It fills its positioned parent, which must have exactly the size of
 * the image. The area outside the frame is dimmed, and the frame shows thirds and large corner handles.
 */
export const CropOverlay: React.FC<CropOverlayProps> = ({ rect, ratio, imageAspect, onChange, label }) => {
  const box = useRef<HTMLDivElement | null>(null);

  const pointOf = (event: React.PointerEvent) => {
    const bounds = box.current!.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
  };

  const startDrag = (event: React.PointerEvent, handle: Handle | 'move') => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const start = pointOf(event);
    const startRect = rect;

    const onMove = (move: PointerEvent) => {
      const bounds = box.current!.getBoundingClientRect();
      const point = { x: (move.clientX - bounds.left) / bounds.width, y: (move.clientY - bounds.top) / bounds.height };
      onChange(handle === 'move'
        ? moveFrame(startRect, point.x - start.x, point.y - start.y)
        : dragCorner(startRect, handle, point, ratio, imageAspect));
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  return (
    <div ref={box} className="crop-overlay" aria-label={label}>
      <div
        className="crop-frame"
        style={{
          left: pct(rect.left),
          top: pct(rect.top),
          width: pct(rect.right - rect.left),
          height: pct(rect.bottom - rect.top),
        }}
        onPointerDown={(event) => startDrag(event, 'move')}
      >
        <div className="crop-thirds" />
        {HANDLES.map((handle) => (
          <div key={handle} className={`crop-handle crop-handle-${handle}`} onPointerDown={(event) => startDrag(event, handle)} />
        ))}
      </div>
    </div>
  );
};

/** Grid lines over the image while the horizon is being straightened. */
export const StraightenGrid: React.FC = () => <div className="straighten-grid" />;
