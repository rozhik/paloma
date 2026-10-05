import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { panBy, toggleZoom, wheelFactor, zoomAt, type Point, type Size, type ZoomState } from './zoomMath.js';

interface ZoomStageProps {
  /** Image to show; it stands for a photo of `full` pixels, whatever its own resolution */
  url: string | null;
  /** Shown fitted while `url` is not ready yet, e.g. the photo's cached preview */
  placeholder?: string;
  alt: string;
  full: Size;
  stage: Size;
  zoom: ZoomState;
  onZoom: (zoom: ZoomState) => void;
  onStageResize: (size: Size) => void;
  /** No zooming or panning, e.g. while a frame is edited */
  locked: boolean;
  /** Drawn over the image in its own box, e.g. the crop frame */
  children?: React.ReactNode;
}

/**
 * The photo behind the viewer's overlays: fills the window, zooms with the wheel, a trackpad or two fingers
 * around the pointer, pans by dragging, and toggles 100% on double-click.
 */
export const ZoomStage: React.FC<ZoomStageProps> = ({ url, placeholder, alt, full, stage, zoom, onZoom, onStageResize, locked, children }) => {
  const element = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number } | null>(null);
  // Handlers read the latest values without re-subscribing native listeners
  const latest = useRef({ full, stage, zoom, onZoom, locked });
  latest.current = { full, stage, zoom, onZoom, locked };

  useLayoutEffect(() => {
    if (!element.current) return;
    const observer = new ResizeObserver(([entry]) => onStageResize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);

  /** A point of the event relative to the stage's centre */
  const fromCentre = (clientX: number, clientY: number): Point => {
    const bounds = element.current!.getBoundingClientRect();
    return { x: clientX - bounds.left - bounds.width / 2, y: clientY - bounds.top - bounds.height / 2 };
  };

  // React's wheel listener is passive, so the page would scroll; a native one can prevent that
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { full, stage, zoom, onZoom, locked } = latest.current;
      if (locked) return;
      const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.height : 1;
      // A trackpad pinch arrives as a wheel event with ctrlKey and small deltas: make it as lively as the wheel
      const delta = event.deltaY * lines * (event.ctrlKey ? 4 : 1);
      onZoom(zoomAt(zoom, zoom.scale * wheelFactor(delta), full, stage, fromCentre(event.clientX, event.clientY)));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    if (locked || event.button !== 0 || event.target !== event.currentTarget && !(event.target instanceof HTMLImageElement)) return;
    element.current!.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || locked) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.distance > 0) {
        const anchor = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
        onZoom(zoomAt(zoom, zoom.scale * (distance / pinch.current.distance), full, stage, anchor));
      }
      pinch.current = { distance };
    } else {
      onZoom(panBy(zoom, next.x - previous.x, next.y - previous.y, full, stage));
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    if (locked || event.target !== event.currentTarget && !(event.target instanceof HTMLImageElement)) return;
    onZoom(toggleZoom(zoom, full, stage, fromCentre(event.clientX, event.clientY)));
  };

  const width = full.width * zoom.scale;
  const height = full.height * zoom.scale;
  const box: React.CSSProperties = {
    position: 'absolute',
    width,
    height,
    left: stage.width / 2 + zoom.x - width / 2,
    top: stage.height / 2 + zoom.y - height / 2,
  };
  const zoomedIn = width > stage.width + 0.5 || height > stage.height + 0.5;

  return (
    <div
      ref={element}
      className="viewer-stage"
      style={{ cursor: locked ? 'default' : zoomedIn ? (pointers.current.size > 0 ? 'grabbing' : 'grab') : 'zoom-in' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      {url ? (
        <div style={box}>
          <img src={url} alt={alt} draggable={false} className="d-block w-100 h-100" />
          {children}
        </div>
      ) : placeholder ? (
        <img src={placeholder} alt={alt} draggable={false} className="viewer-placeholder" />
      ) : null}
    </div>
  );
};
