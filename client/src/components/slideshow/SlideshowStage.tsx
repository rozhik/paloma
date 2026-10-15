import React, { useEffect, useRef, useState } from 'react';
import type { Photo } from '../../../../shared/types.js';
import type { SlideshowFit } from '../../settings/uiSettings.js';
import type { Size } from '../viewer/zoomMath.js';
import { effectiveEffect, pickEffect, reverseOf, type EffectChoice, type EffectId, type PlayedEffect } from './effects.js';
import { SlideImages, type SlideImage } from './slideImages.js';
import { slideBox } from './slideSize.js';

/** A photo on a layer of the stage. */
interface Slide {
  index: number;
  image: SlideImage;
}

/** What the stage shows: the photo fully shown, and the one arriving over it with its effect. */
interface Layers {
  shown: Slide | null;
  incoming: Slide | null;
  effect: PlayedEffect;
  /** The move the incoming photo belongs to */
  move: number;
}

/** Whether this browser can draw an effect; those it cannot are played as a fade. */
function supported(effect: EffectId): boolean {
  if (typeof CSS === 'undefined' || !CSS.supports) return effect === 'fade';
  if (effect.startsWith('wipe') || effect === 'iris') return CSS.supports('clip-path', 'circle(10%)');
  if (effect === 'blinds') {
    return 'registerProperty' in CSS
      && (CSS.supports('mask-image', 'linear-gradient(#000, #000)') || CSS.supports('-webkit-mask-image', 'linear-gradient(#000, #000)'));
  }
  if (effect === 'flip') return CSS.supports('backface-visibility', 'hidden') || CSS.supports('-webkit-backface-visibility', 'hidden');
  return true;
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useScreenSize(): Size {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export interface SlideshowStageProps {
  photos: Photo[];
  /** The photo to show, as a grid index */
  index: number;
  /** Raised on every move; a new value starts a transition to `index` */
  move: number;
  /** The move went back: directional effects play the other way */
  back: boolean;
  /** The photo the next move will likely show, loaded ahead */
  next: number | null;
  effect: EffectChoice;
  /** Seconds */
  duration: number;
  fit: SlideshowFit;
  /** The photo of `move` comes on screen: its effect starts, or it is shown at once */
  onShown: (move: number) => void;
  /** The photo of `move` is fully shown; its interval may start */
  onSettled: (move: number) => void;
}

/**
 * The slideshow's photos with transition effects. A move waits until its photo has loaded, then plays the effect
 * from the shown photo to it; a move during an effect first ends the running one with its photo fully shown.
 */
export const SlideshowStage: React.FC<SlideshowStageProps> = ({ photos, index, move, back, next, effect, duration, fit, onShown, onSettled }) => {
  const screen = useScreenSize();
  const images = useRef<SlideImages | null>(null);
  images.current ??= new SlideImages();
  const [layers, setLayers] = useState<Layers>({ shown: null, incoming: null, effect: 'none', move: -1 });
  const lastEffect = useRef<PlayedEffect | null>(null);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const shownRef = useRef(onShown);
  shownRef.current = onShown;
  const pixelRatio = window.devicePixelRatio || 1;

  useEffect(() => () => images.current?.dispose(), []);

  /** Ends the running effect: the incoming photo becomes the shown one. */
  const finish = (expected?: number) => setLayers((current) => {
    if (!current.incoming || (expected !== undefined && current.move !== expected)) return current;
    const settled = current.move;
    queueMicrotask(() => settledRef.current(settled));
    return { shown: current.incoming, incoming: null, effect: 'none', move: current.move };
  });

  // A move: end any running effect, load the photo, then play its effect
  useEffect(() => {
    finish();
    let cancelled = false;
    void images.current!.load(photos[index], fit, screen, pixelRatio).then((image) => {
      if (cancelled) return;
      setLayers((current) => {
        // Outside the state update: the parent shows the photo's name and position, and starts the interval
        queueMicrotask(() => shownRef.current(move));
        const settle = () => queueMicrotask(() => settledRef.current(move));
        const slide = { index, image };
        // Same photo again, or the first photo: shown at once
        if (!current.shown || current.shown.index === index) {
          settle();
          return { shown: slide, incoming: null, effect: 'none', move };
        }
        const picked = pickEffect(effect, lastEffect.current);
        lastEffect.current = picked;
        const played = effectiveEffect(back ? reverseOf(picked) : picked, reducedMotion(), supported);
        if (played === 'none') {
          settle();
          return { shown: slide, incoming: null, effect: 'none', move };
        }
        return { shown: current.shown, incoming: slide, effect: played, move };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [move]);

  // A new screen size or photo size: the shown photo is loaded again at the size it needs now
  useEffect(() => {
    let cancelled = false;
    const shown = layers.shown;
    if (!shown) return;
    void images.current!.load(photos[shown.index], fit, screen, pixelRatio).then((image) => {
      if (cancelled || image.url === shown.image.url) return;
      setLayers((current) => (current.shown?.index === shown.index ? { ...current, shown: { ...current.shown, image } } : current));
    });
    return () => {
      cancelled = true;
    };
  }, [screen.width, screen.height, fit]);

  // The next photo loads while this one is shown
  useEffect(() => {
    if (next !== null && next !== index) void images.current!.load(photos[next], fit, screen, pixelRatio);
  }, [index, next]);

  // Should the animation never report its end (a hidden tab, for example), the effect ends anyway
  useEffect(() => {
    if (!layers.incoming) return;
    const timer = window.setTimeout(() => finish(layers.move), duration * 1000 + 500);
    return () => window.clearTimeout(timer);
  }, [layers.incoming, layers.move]);

  const style = { '--fx-duration': `${duration}s` } as React.CSSProperties;
  const running = layers.incoming ? layers.effect : null;
  return (
    <div className={`slideshow-stage ${running ? `fx-${running}` : ''}`} style={style}>
      {layers.shown && (
        <SlideLayer
          key={`${layers.shown.index}:${layers.shown.image.url}`}
          slide={layers.shown}
          photo={photos[layers.shown.index]}
          fit={fit}
          screen={screen}
          role={running ? 'out' : 'shown'}
        />
      )}
      {layers.incoming && (
        <SlideLayer
          key={`${layers.incoming.index}:${layers.incoming.image.url}:in`}
          slide={layers.incoming}
          photo={photos[layers.incoming.index]}
          fit={fit}
          screen={screen}
          role="in"
          onAnimationEnd={(event) => {
            // Only the layer's own animation ends the effect, not one of a child
            if (event.target === event.currentTarget) finish(layers.move);
          }}
        />
      )}
    </div>
  );
};

interface SlideLayerProps {
  slide: Slide;
  photo: Photo;
  fit: SlideshowFit;
  screen: Size;
  role: 'shown' | 'in' | 'out';
  onAnimationEnd?: React.AnimationEventHandler<HTMLDivElement>;
}

/** One photo, centred and sized by the photo size; what does not fit the screen is cut off equally. */
const SlideLayer: React.FC<SlideLayerProps> = ({ slide, photo, fit, screen, role, onAnimationEnd }) => {
  const box = slideBox(fit, slide.image.full, screen);
  return (
    <div className={`slideshow-layer slideshow-layer-${role}`} onAnimationEnd={onAnimationEnd} aria-hidden={role === 'out'}>
      <img
        src={slide.image.url}
        alt={photo.filename}
        className="slideshow-photo"
        style={{ width: box.width, height: box.height }}
        draggable={false}
      />
    </div>
  );
};
