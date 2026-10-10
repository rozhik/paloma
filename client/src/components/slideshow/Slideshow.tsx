import React, { useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { IconButton } from '../../shell/IconButton.js';
import { usePalomaStore, type SlideshowState } from '../../store/usePalomaStore.js';
import { SLIDESHOW_INTERVALS, useUiSettings } from '../../settings/uiSettings.js';
import { slideshowReducer, startPlayback } from './slideshowReducer.js';

/** How long the controls stay after the pointer last moved */
const CONTROLS_HIDE_MS = 3000;

/**
 * Asks the browser for full screen. Call it from the click that starts the slideshow: browsers allow full
 * screen only right after a user action. A refusal is fine; the slideshow then fills the window.
 */
export function enterFullscreen(): void {
  try {
    void document.documentElement.requestFullscreen?.()?.catch(() => {});
  } catch {
    // Not supported: the window will do
  }
}

export function leaveFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {});
}

/** The running slideshow, shown over everything while there is one. */
export const Slideshow: React.FC = () => {
  const slideshow = usePalomaStore((state) => state.slideshow);
  return slideshow ? <SlideshowScreen slideshow={slideshow} /> : null;
};

const SlideshowScreen: React.FC<{ slideshow: SlideshowState }> = ({ slideshow }) => {
  const { t, i18n } = useTranslation();
  const stop = usePalomaStore((state) => state.stopSlideshow);
  const interval = useUiSettings((state) => state.slideshowInterval);
  const update = useUiSettings((state) => state.update);
  const { photos } = slideshow;
  const [state, dispatch] = useReducer(slideshowReducer, startPlayback(slideshow.index, photos.length));
  const [controls, setControls] = useState(true);
  const root = useRef<HTMLDivElement | null>(null);
  const photo = photos[state.index];
  const src = (index: number) => photos[index].previewUrl ?? photos[index].thumbnailUrl ?? '';

  const exit = () => {
    leaveFullscreen();
    stop();
  };

  // The next photo after the interval; every move or a new interval starts it again
  useEffect(() => {
    if (!state.playing) return;
    const timer = window.setTimeout(() => dispatch({ type: 'tick' }), interval * 1000);
    return () => window.clearTimeout(timer);
  }, [state.step, state.playing, interval]);

  // The next photo loads while this one is shown
  useEffect(() => {
    if (photos.length > 1) new Image().src = src((state.index + 1) % photos.length);
  }, [state.index]);

  // Controls hide when the pointer rests, and come back when it moves or the screen is touched
  const showControls = () => setControls(true);
  useEffect(() => {
    if (!controls) return;
    const timer = window.setTimeout(() => setControls(false), CONTROLS_HIDE_MS);
    return () => window.clearTimeout(timer);
  });

  // Leaving full screen (the browser's own Esc, for example) ends the slideshow
  useEffect(() => {
    let wasFullscreen = !!document.fullscreenElement;
    const onChange = () => {
      if (document.fullscreenElement) wasFullscreen = true;
      else if (wasFullscreen) stop();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Keyboard focus moves into the slideshow, and returns where it was afterwards
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => before?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        exit();
      } else if (event.key === ' ') {
        event.preventDefault();
        dispatch({ type: 'toggle' });
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const forward = (event.key === 'ArrowRight') !== (i18n.dir() === 'rtl');
        dispatch({ type: forward ? 'next' : 'previous' });
      } else {
        return;
      }
      showControls();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // In a right-to-left language "previous" points right
  const rtl = i18n.dir() === 'rtl';

  return (
    <div
      ref={root}
      className={`slideshow ${controls ? '' : 'slideshow-idle'}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('slideshow.title')}
      tabIndex={-1}
      onPointerMove={showControls}
      onPointerDown={showControls}
    >
      <img key={photo.id} src={src(state.index)} alt={photo.filename} className="slideshow-photo" draggable={false} />
      <div className="slideshow-controls" hidden={!controls}>
        <IconButton icon={X} label={t('slideshow.exit')} iconSize={26} placement="top" className="slideshow-btn" onClick={exit} />
        <IconButton
          icon={rtl ? ChevronRight : ChevronLeft}
          label={t('slideshow.previous')}
          iconSize={30}
          placement="top"
          className="slideshow-btn"
          onClick={() => dispatch({ type: 'previous' })}
        />
        <IconButton
          icon={state.playing ? Pause : Play}
          label={state.playing ? t('slideshow.pause') : t('slideshow.play')}
          iconSize={30}
          placement="top"
          className="slideshow-btn"
          onClick={() => dispatch({ type: 'toggle' })}
        />
        <IconButton
          icon={rtl ? ChevronLeft : ChevronRight}
          label={t('slideshow.next')}
          iconSize={30}
          placement="top"
          className="slideshow-btn"
          onClick={() => dispatch({ type: 'next' })}
        />
        <div className="slideshow-interval" role="radiogroup" aria-label={t('slideshow.interval')} title={t('slideshow.interval')}>
          {SLIDESHOW_INTERVALS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              role="radio"
              aria-checked={interval === seconds}
              className={`slideshow-btn slideshow-interval-btn ${interval === seconds ? 'active' : ''}`}
              onClick={() => update({ slideshowInterval: seconds })}
            >
              {t('slideshow.seconds', { seconds })}
            </button>
          ))}
        </div>
        <span className="slideshow-position">
          {t('viewer.position', { index: state.index + 1, total: photos.length })}
        </span>
      </div>
      {/* For screen readers: which photo is shown, also while the controls are hidden */}
      <span className="visually-hidden" aria-live="polite">{photo.filename}</span>
    </div>
  );
};
