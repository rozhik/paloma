import React, { useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Pause, Play, Shuffle, X } from 'lucide-react';
import { IconButton } from '../../shell/IconButton.js';
import { usePalomaStore, type SlideshowState } from '../../store/usePalomaStore.js';
import { SLIDESHOW_INTERVALS, useUiSettings } from '../../settings/uiSettings.js';
import { type SlideshowAction, type SlideshowPlayback, currentIndex, peekNext, positionOf, slideshowReducer, startPlayback } from './slideshowReducer.js';
import { SlideshowStage } from './SlideshowStage.js';
import { LAYER, useKeyActions } from '../../keys/dispatcher.js';

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
  const effect = useUiSettings((state) => state.slideshowEffect);
  const duration = useUiSettings((state) => state.slideshowEffectDuration);
  const shuffle = useUiSettings((state) => state.slideshowShuffle);
  const fit = useUiSettings((state) => state.slideshowFit);
  const update = useUiSettings((state) => state.update);
  const { photos } = slideshow;
  const [state, dispatch] = useReducer(
    (current: SlideshowPlayback, action: SlideshowAction) => slideshowReducer(current, action),
    null,
    () => startPlayback(slideshow.index, photos.length, useUiSettings.getState().slideshowShuffle),
  );
  const [controls, setControls] = useState(true);
  /** The last move whose photo is fully shown; its interval runs only then */
  const [settled, setSettled] = useState(-1);
  const root = useRef<HTMLDivElement | null>(null);
  const index = currentIndex(state);
  /** The move whose photo is on screen; its name and position are shown until the next photo arrives */
  const [shownMove, setShownMove] = useState(0);
  const moves = useRef(new Map<number, { photo: typeof photos[number]; position: { index: number; total: number } }>());
  moves.current.set(state.move, { photo: photos[index], position: positionOf(state) });
  for (const move of moves.current.keys()) if (move < shownMove) moves.current.delete(move);
  const { photo, position } = moves.current.get(shownMove) ?? moves.current.get(state.move)!;

  const exit = () => {
    leaveFullscreen();
    stop();
  };

  // The next photo after the interval, counted once the photo is fully shown; every move or a new interval
  // starts it again
  const shown = settled === state.move;
  useEffect(() => {
    if (!state.playing || !shown) return;
    const timer = window.setTimeout(() => dispatch({ type: 'tick' }), interval * 1000);
    return () => window.clearTimeout(timer);
  }, [state.step, state.playing, shown, interval]);

  // Shuffle chosen in Settings or on the bar reorders the photos still to come
  useEffect(() => dispatch({ type: 'shuffle', on: shuffle }), [shuffle]);
  const toggleShuffle = () => update({ slideshowShuffle: !useUiSettings.getState().slideshowShuffle });

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

  // Keys from the user's keymap; they also bring the controls back
  const withControls = (run: () => void) => () => {
    run();
    showControls();
  };
  useKeyActions('slideshow', LAYER.slideshow, {
    'slideshow.exit': exit,
    'slideshow.playPause': withControls(() => dispatch({ type: 'toggle' })),
    'slideshow.previous': withControls(() => dispatch({ type: 'previous' })),
    'slideshow.next': withControls(() => dispatch({ type: 'next' })),
    'slideshow.shuffle': withControls(toggleShuffle),
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
      <SlideshowStage
        photos={photos}
        index={index}
        move={state.move}
        back={state.back}
        next={peekNext(state)}
        effect={effect}
        duration={duration}
        fit={fit}
        onShown={setShownMove}
        onSettled={setSettled}
      />
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
        <IconButton
          icon={Shuffle}
          label={t('slideshow.shuffle')}
          iconSize={26}
          placement="top"
          className="slideshow-btn"
          active={shuffle}
          aria-pressed={shuffle}
          onClick={toggleShuffle}
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
          {t('viewer.position', position)}
        </span>
      </div>
      {/* For screen readers: which photo is shown, also while the controls are hidden */}
      <span className="visually-hidden" aria-live="polite">{photo.filename}</span>
    </div>
  );
};
