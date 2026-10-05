import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { EditStep, FilterInfo, FilterParamInfo, RelativeRect } from '../../../../shared/types.js';
import { fetchPlugins } from '../../api/plugins.js';
import { describeError } from '../../api/http.js';
import { currentLanguage } from '../../i18n/index.js';
import { usePalomaStore, type ViewerState } from '../../store/usePalomaStore.js';
import { useUiSettings } from '../../settings/uiSettings.js';
import { CropOverlay, StraightenGrid } from '../CropOverlay.js';
import { FULL_FRAME, fitRatio, framePixelSize, pixelRatio, type CropRatio } from '../cropFrame.js';
import { previewSizeFor, useEditPreview } from '../useEditPreview.js';
import { VIEWER_BAR_SIZE, barInsets, barLayout, barStyle, inwardSide } from './barLayout.js';
import { EditBar, type PanelAnchor, type PanelKind } from './EditBar.js';
import { ChangesList, FilterControls, FloatingPanel, FrameControls } from './FilterPanel.js';
import { NavBar } from './NavBar.js';
import { useViewerEdits } from './useViewerEdits.js';
import { ZOOM_STEP, clampPan, clampScale, fitted, isFitted, panBy, zoomAt, type Size, type ZoomState } from './zoomMath.js';
import { ZoomStage } from './ZoomStage.js';

/** A rectangle parameter being edited as a frame over the photo. */
interface FrameEdit {
  filter: string;
  param: string;
  /** The trailing step being changed, or null for a new step */
  index: number | null;
  rect: RelativeRect;
  ratio: CropRatio;
  portrait: boolean;
}

const STRAIGHTEN = 'straighten';
/** How far Shift+arrow pans, in CSS pixels */
const PAN_STEP = 80;

/** A step's parameter values for the controls: its own, else the filter's defaults. */
function valuesOf(filter: FilterInfo, step: EditStep | undefined): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const param of filter.params) values[param.name] = step?.[param.name] ?? param.default;
  return values;
}

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement
  && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** The photo viewer, shown over the library while a photo is open. */
export const PhotoViewer: React.FC = () => {
  const viewer = usePalomaStore((state) => state.viewer);
  return viewer ? <ViewerScreen viewer={viewer} /> : null;
};

const ViewerScreen: React.FC<{ viewer: ViewerState }> = ({ viewer }) => {
  const { moveViewer, closeViewer } = usePalomaStore();
  const { t, i18n } = useTranslation();
  const photo = viewer.photos[viewer.index];
  const edits = useViewerEdits(photo);
  const { chain, dispatch } = edits;

  const navEdge = useUiSettings((state) => state.navBar);
  const editEdge = useUiSettings((state) => state.editBar);
  const layout = useMemo(() => barLayout({ navBar: navEdge, editBar: editEdge }), [navEdge, editEdge]);

  const [filters, setFilters] = useState<Map<string, FilterInfo> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<(PanelKind & { anchor: PanelAnchor }) | null>(null);
  const [frame, setFrame] = useState<FrameEdit | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [stage, setStage] = useState<Size>({ width: window.innerWidth, height: window.innerHeight });
  /** 'fit' follows the photo and window size; a state is a zoom the user chose */
  const [zoomChoice, setZoomChoice] = useState<ZoomState | 'fit'>('fit');
  const [blocked, setBlocked] = useState(false);

  // Filters of the plugins that are on, with labels in the active language
  useEffect(() => {
    fetchPlugins(currentLanguage())
      .then((plugins) => setFilters(new Map(plugins
        .filter((plugin) => plugin.status === 'active')
        .flatMap((plugin) => plugin.filters)
        .map((filter) => [filter.name, filter]))))
      .catch((err) => setLoadError(describeError(err, t)));
  }, [i18n.language]);

  // Another photo starts fitted, with nothing open
  useEffect(() => {
    setZoomChoice('fit');
    setPanel(null);
    setFrame(null);
    setBlocked(false);
  }, [photo.id]);

  // Keyboard focus moves into the viewer, so keys do not reach the grid behind it, and returns on close
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => before?.focus?.();
  }, []);

  const previewSteps = showOriginal ? [] : frame ? chain.steps.slice(0, frame.index ?? chain.steps.length) : chain.steps;

  // The photo's full size decides zoom percentages; until a preview tells it, the file's size will do
  const [full, setFull] = useState<Size>({ width: photo.width || 1, height: photo.height || 1 });
  const zoom = useMemo(() => {
    if (frame) {
      // The frame's handles must not hide under the bars: fit the photo into the area they leave free
      const inset = barInsets(layout);
      const free = { width: stage.width - inset.left - inset.right, height: stage.height - inset.top - inset.bottom };
      return { scale: fitted(full, free).scale, x: (inset.left - inset.right) / 2, y: (inset.top - inset.bottom) / 2 };
    }
    if (zoomChoice === 'fit') return fitted(full, stage);
    return clampPan({ ...zoomChoice, scale: clampScale(zoomChoice.scale, full, stage) }, full, stage);
  }, [frame, zoomChoice, full, stage, layout]);

  // Sharper previews when zoomed in; never re-requested smaller for the same chain
  const dpr = window.devicePixelRatio || 1;
  const needed = previewSizeFor(full.width * zoom.scale, full.height * zoom.scale, dpr);
  const stepsKey = `${photo.id}:${JSON.stringify(previewSteps)}`;
  const highWater = useRef({ key: '', size: 0 });
  if (highWater.current.key !== stepsKey) highWater.current = { key: stepsKey, size: needed };
  else if (needed > highWater.current.size) highWater.current.size = needed;
  const preview = useEditPreview(photo.id, previewSteps, highWater.current.size);

  useEffect(() => {
    if (preview.fullWidth > 0 && (preview.fullWidth !== full.width || preview.fullHeight !== full.height)) {
      setFull({ width: preview.fullWidth, height: preview.fullHeight });
    }
  }, [preview.fullWidth, preview.fullHeight]);
  useEffect(() => setFull({ width: photo.width || 1, height: photo.height || 1 }), [photo.id]);

  const setZoom = useCallback((next: ZoomState) => setZoomChoice(isFitted(next, full, stage) ? 'fit' : next), [full, stage]);
  // A fitted photo stays fitted, and another zoom is clamped to the new size by `zoom` above
  const onStageResize = useCallback((size: Size) => setStage(size), []);
  const zoomBy = (factor: number) => setZoom(zoomAt(zoom, zoom.scale * factor, full, stage));

  // Leaving a photo waits for its saves; a failed save keeps the viewer on it
  const leave = async (go: () => void) => {
    if (frame) return;
    if (await edits.settle()) go();
    else setBlocked(true);
  };
  const canPrev = viewer.index > 0;
  const canNext = viewer.index < viewer.photos.length - 1;
  const prev = () => canPrev && leave(() => moveViewer(-1));
  const next = () => canNext && leave(() => moveViewer(1));
  const close = () => leave(closeViewer);

  /** Opens the frame editor for a rectangle parameter, for a new step or a trailing step of the same filter. */
  const openFrame = (filter: FilterInfo, param: FilterParamInfo & { type: 'rect' }) => {
    // A frame right after a step of the same filter changes that step, as other controls do
    const last = chain.steps.length - 1;
    const target = chain.steps[last]?.filter === filter.name && chain.steps[last].enabled !== false ? last : null;
    const current = target !== null ? chain.steps[target][param.name] as RelativeRect | undefined : undefined;
    setFrame({ filter: filter.name, param: param.name, index: target, rect: current ?? param.default ?? FULL_FRAME, ratio: 'free', portrait: false });
  };

  const applyFrame = () => {
    if (!frame || !filters) return;
    // `apply` changes a trailing step of the same filter, or adds a step with the other values at their defaults
    const filter = filters.get(frame.filter)!;
    const step = frame.index !== null ? chain.steps[frame.index] : undefined;
    dispatch({ type: 'apply', filter: frame.filter, params: { ...valuesOf(filter, step), [frame.param]: frame.rect } });
    dispatch({ type: 'commit' });
    setFrame(null);
    setPanel(null);
  };

  const cancelFrame = () => {
    setFrame(null);
    // A panel that only held the frame closes with it
    if (panel?.kind === 'filter' && filters?.get(panel.name)?.params.every((param) => param.type === 'rect')) setPanel(null);
  };

  const imageAspect = preview.height > 0 ? preview.width / preview.height : 1;
  const photoAspect = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : imageAspect;
  const frameRatio = frame ? pixelRatio(frame.ratio, photoAspect, frame.portrait) : null;
  const setFrameRatio = (ratio: CropRatio, portrait: boolean) => {
    if (!frame) return;
    setFrame({ ...frame, ratio, portrait, rect: fitRatio(frame.rect, pixelRatio(ratio, photoAspect, portrait), imageAspect) });
  };

  const chooseFilter = (filter: FilterInfo, anchor: PanelAnchor) => {
    if (panel?.kind === 'filter' && panel.name === filter.name) {
      setPanel(null);
      setFrame(null);
      return;
    }
    if (filter.params.length === 0) {
      dispatch({ type: 'apply', filter: filter.name, params: {} });
      dispatch({ type: 'commit' });
      setPanel(null);
      return;
    }
    setPanel({ kind: 'filter', name: filter.name, anchor });
    // A filter that is only a frame, like crop, goes straight to the frame
    const only = filter.params.length === 1 ? filter.params[0] : null;
    if (only?.type === 'rect') openFrame(filter, only);
  };

  const lastStep = chain.steps[chain.steps.length - 1];
  const paletteValues = (filter: FilterInfo) =>
    valuesOf(filter, lastStep?.filter === filter.name && lastStep.enabled !== false ? lastStep : undefined);

  // Viewer keys; keys typed into controls stay there
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = isTyping(event.target);
      if (event.key === 'Escape') {
        event.preventDefault();
        if (frame) cancelFrame();
        else if (panel) setPanel(null);
        else close();
        return;
      }
      if (typing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (!frame && !event.shiftKey) dispatch({ type: 'undo' });
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (event.key in arrows && event.shiftKey) {
        event.preventDefault();
        const [dx, dy] = arrows[event.key];
        if (!frame) setZoom(panBy(zoom, dx * PAN_STEP, dy * PAN_STEP, full, stage));
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const forward = (event.key === 'ArrowRight') !== (i18n.dir() === 'rtl');
        if (forward) next();
        else prev();
      } else if ((event.key === '+' || event.key === '=') && !frame) {
        zoomBy(ZOOM_STEP);
      } else if (event.key === '-' && !frame) {
        zoomBy(1 / ZOOM_STEP);
      } else if (event.key === '0' && !frame) {
        setZoomChoice('fit');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const panelFilter = panel?.kind === 'filter' ? filters?.get(panel.name) : undefined;
  const panelSide = inwardSide(layout.editBar.edge);
  const saveMessage = edits.status === 'failed' ? describeError(edits.error, t) : null;

  return (
    <div
      ref={root}
      className="photo-viewer"
      style={{ '--viewer-bar-size': `${VIEWER_BAR_SIZE}px` } as React.CSSProperties}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={photo.filename}
    >
      <ZoomStage
        url={preview.url}
        placeholder={photo.previewUrl}
        alt={photo.filename}
        full={full}
        stage={stage}
        zoom={zoom}
        onZoom={setZoom}
        onStageResize={onStageResize}
        locked={!!frame}
      >
        {frame && !preview.loading && (
          <CropOverlay
            rect={frame.rect}
            ratio={frameRatio}
            imageAspect={imageAspect}
            onChange={(rect) => setFrame({ ...frame, rect })}
            label={t('editor.frame.hint')}
          />
        )}
        {showGrid && <StraightenGrid />}
      </ZoomStage>

      <NavBar
        placement={layout.navBar}
        style={barStyle(layout.navBar)}
        filename={photo.filename}
        index={viewer.index}
        total={viewer.photos.length}
        scale={zoom.scale}
        canPrev={canPrev && !frame}
        canNext={canNext && !frame}
        zoomLocked={!!frame}
        saving={edits.status === 'saving'}
        onClose={close}
        onPrev={prev}
        onNext={next}
        onZoomIn={() => zoomBy(ZOOM_STEP)}
        onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
        onFit={() => setZoomChoice('fit')}
      />

      <EditBar
        placement={layout.editBar}
        style={barStyle(layout.editBar)}
        filters={filters}
        canUndo={chain.steps.length > 0}
        locked={!!frame}
        openPanel={panel}
        showingOriginal={showOriginal}
        onUndo={() => dispatch({ type: 'undo' })}
        onRotate={(delta) => dispatch({ type: 'rotate', delta })}
        onFilter={chooseFilter}
        onChanges={(anchor) => setPanel(panel?.kind === 'changes' ? null : { kind: 'changes', anchor })}
        onShowOriginal={setShowOriginal}
      />

      {panel && (panelFilter || panel.kind === 'changes') && (
        <FloatingPanel
          side={panelSide}
          anchor={panel.anchor}
          title={panelFilter ? panelFilter.label : t('editor.steps')}
          onClose={() => (frame ? cancelFrame() : setPanel(null))}
        >
          {frame ? (
            <FrameControls
              hint={t('editor.frame.hint')}
              pixelSize={!preview.loading && preview.fullWidth > 0
                ? framePixelSize(frame.rect, { width: preview.fullWidth, height: preview.fullHeight })
                : null}
              ratio={frame.ratio}
              portrait={frame.portrait}
              onRatio={setFrameRatio}
              onApply={applyFrame}
              onCancel={cancelFrame}
            />
          ) : panelFilter ? (
            <FilterControls
              filter={panelFilter}
              values={paletteValues(panelFilter)}
              editing={lastStep?.filter === panelFilter.name}
              onChange={(values) => dispatch({ type: 'apply', filter: panelFilter.name, params: values })}
              onCommit={() => dispatch({ type: 'commit' })}
              onFrame={(param) => openFrame(panelFilter, param)}
              onSliding={(sliding) => setShowGrid(sliding && panelFilter.name === STRAIGHTEN)}
              idPrefix="panel"
            />
          ) : (
            <ChangesList steps={chain.steps} filters={filters} />
          )}
        </FloatingPanel>
      )}

      {(saveMessage || loadError || preview.error != null) && (
        <div className="viewer-toast">
          {saveMessage && (
            <Alert variant="danger" className={`mb-2 fs-5 ${blocked ? 'viewer-attention' : ''}`} onAnimationEnd={() => setBlocked(false)}>
              <div className="mb-2">{t('editor.saveFailed', { message: saveMessage })}</div>
              <div className="d-flex gap-2 flex-wrap">
                <button type="button" className="btn btn-danger btn-lg" onClick={() => { setBlocked(false); edits.retry(); }}>{t('editor.retry')}</button>
                <button type="button" className="btn btn-outline-danger btn-lg" onClick={() => { setBlocked(false); edits.discard(); }}>{t('editor.discard')}</button>
              </div>
            </Alert>
          )}
          {loadError && <Alert variant="danger" className="mb-2 fs-5" onClose={() => setLoadError(null)} dismissible>{loadError}</Alert>}
          {preview.error != null && <Alert variant="danger" className="mb-0 fs-5">{describeError(preview.error, t)}</Alert>}
        </div>
      )}
    </div>
  );
};
