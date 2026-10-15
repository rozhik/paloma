import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditStep, FilterInfo, FilterParamInfo, RelativeRect } from '../../../../shared/types.js';
import { fetchPlugins } from '../../api/plugins.js';
import { describeError } from '../../api/http.js';
import { currentLanguage } from '../../i18n/index.js';
import { usePalomaStore, type ViewerState } from '../../store/usePalomaStore.js';
import { useUiSettings } from '../../settings/uiSettings.js';
import { FULL_FRAME, fitRatio, framePixelSize, pixelRatio, type CropRatio } from '../cropFrame.js';
import { previewSizeFor, useEditPreview } from '../useEditPreview.js';
import { barInsets, barLayout, inwardSide } from './barLayout.js';
import type { PanelAnchor, PanelKind } from './EditBar.js';
import { useViewerEdits } from './useViewerEdits.js';
import {
  ZOOM_STEP, atLevel, clampPan, clampScale, fitted, isFilled, isFitted, panBy, zoomAt, type Size, type ZoomLevel, type ZoomState,
} from './zoomMath.js';
import { useSkin } from '../../appearance/runtime.js';
import { useAllows, useLevel } from '../../levels/controls.js';
import { BUNDLED_FILTER_ACTIONS } from '../../../../shared/keymaps.js';
import { useKeymapStore } from '../../keys/keymapStore.js';
import { offeredFilters } from '../../levels/filters.js';
import { LAYER, useKeyActions } from '../../keys/dispatcher.js';
import { setLeaveOverlay } from '../../keys/useAppKeys.js';
import { apiRequest } from '../../api/http.js';

/** A rectangle parameter being edited as a frame over the photo. */
export interface FrameEdit {
  filter: string;
  param: string;
  /** The trailing step being changed, or null for a new step */
  index: number | null;
  rect: RelativeRect;
  ratio: CropRatio;
  portrait: boolean;
}

export const STRAIGHTEN = 'straighten';
/** How far Shift+arrow pans, in CSS pixels */
const PAN_STEP = 80;

/** A step's parameter values for the controls: its own, else the filter's defaults. */
function valuesOf(filter: FilterInfo, step: EditStep | undefined): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const param of filter.params) values[param.name] = step?.[param.name] ?? param.default;
  return values;
}

/** What Esc closes first: the frame, then a floating panel, then the Info panel, else the viewer. */
export function escapeTarget(open: { frame: boolean; panel: boolean; info: boolean }): 'frame' | 'panel' | 'info' | 'viewer' {
  if (open.frame) return 'frame';
  if (open.panel) return 'panel';
  if (open.info) return 'info';
  return 'viewer';
}

/**
 * Everything the viewer knows and can do for the photo on screen: navigation, zoom, the edit chain, the open
 * panel and frame, and saving. Shared by every skin; a skin's viewer chrome only renders it.
 */
export function usePhotoViewer(viewer: ViewerState) {
  const { moveViewer, closeViewer, replaceViewerPhoto } = usePalomaStore();
  const { t, i18n } = useTranslation();
  const photo = viewer.photos[viewer.index];
  const edits = useViewerEdits(photo);
  const { chain, dispatch } = edits;
  /** Whether the edit bar is offered at the active level; without it the viewer only shows */
  const canEdit = useAllows('viewer.editBar');
  /** Whether the Info button and panel are offered at the active level */
  const canInfo = useAllows('viewer.info');
  /** The Info panel starts closed each time the viewer opens, and stays open from photo to photo */
  const [infoOpen, setInfoOpen] = useState(false);
  const showInfo = canInfo && infoOpen;
  /** Face frames over the photo: offered from Easy, remembered in this browser */
  const canFaces = useAllows('viewer.faces');
  const canAssignFaces = useAllows('viewer.faces.assign');
  const facesOn = useUiSettings((state) => state.showFaces);
  const showFaces = canFaces && facesOn;
  const toggleFaces = () => useUiSettings.getState().update({ showFaces: !useUiSettings.getState().showFaces });
  const canObjects = useAllows('viewer.objects');
  const objectsOn = useUiSettings((state) => state.showObjects);
  const showObjects = canObjects && objectsOn;
  const toggleObjects = () => useUiSettings.getState().update({ showObjects: !useUiSettings.getState().showObjects });

  const barSize = useSkin().skin.viewerBarSize;
  const navEdge = useUiSettings((state) => state.navBar);
  const editEdge = useUiSettings((state) => state.editBar);
  const layout = useMemo(() => barLayout({ navBar: navEdge, editBar: editEdge }), [navEdge, editEdge]);

  const level = useLevel();
  /** Every filter of an active plugin, by name: to name and edit steps */
  const [filters, setFilters] = useState<Map<string, FilterInfo> | null>(null);
  /** The filters the edit bar offers at the active level */
  const [barFilters, setBarFilters] = useState<Map<string, FilterInfo> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<(PanelKind & { anchor: PanelAnchor }) | null>(null);
  const [frame, setFrame] = useState<FrameEdit | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [stage, setStage] = useState<Size>({ width: window.innerWidth, height: window.innerHeight });
  /** A named level follows the photo and window size; a state is a zoom the user chose */
  const openZoom = useUiSettings((state) => state.viewerOpenZoom);
  const [zoomChoice, setZoomChoice] = useState<ZoomState | ZoomLevel>(openZoom);
  const [blocked, setBlocked] = useState(false);

  // Filters of the plugins that are on, with labels in the active language
  useEffect(() => {
    fetchPlugins(currentLanguage())
      .then((plugins) => {
        const byName = (list: FilterInfo[]) => new Map(list.map((filter) => [filter.name, filter]));
        setFilters(byName(plugins.filter((plugin) => plugin.status === 'active').flatMap((plugin) => plugin.filters)));
        setBarFilters(byName(offeredFilters(plugins, level)));
      })
      .catch((err) => setLoadError(describeError(err, t)));
  }, [i18n.language, level]);

  // Another photo starts at the zoom chosen in Settings, with nothing open
  useEffect(() => {
    setZoomChoice(useUiSettings.getState().viewerOpenZoom);
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
      const inset = barInsets(layout, barSize);
      const free = { width: stage.width - inset.left - inset.right, height: stage.height - inset.top - inset.bottom };
      return { scale: fitted(full, free).scale, x: (inset.left - inset.right) / 2, y: (inset.top - inset.bottom) / 2 };
    }
    if (typeof zoomChoice === 'string') return atLevel(zoomChoice, full, stage);
    return clampPan({ ...zoomChoice, scale: clampScale(zoomChoice.scale, full, stage) }, full, stage);
  }, [frame, zoomChoice, full, stage, layout, barSize]);

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

  const setZoom = useCallback((next: ZoomState) => {
    if (isFitted(next, full, stage)) setZoomChoice('fit');
    else if (isFilled(next, full, stage)) setZoomChoice('fill');
    else setZoomChoice(next);
  }, [full, stage]);
  // A fitted photo stays fitted, and another zoom is clamped to the new size by `zoom` above
  const onStageResize = useCallback((size: Size) => setStage(size), []);
  const zoomBy = (factor: number) => setZoom(zoomAt(zoom, zoom.scale * factor, full, stage));
  /** A level from the zoom menu: Fit and Fill follow the window, a percentage keeps the window's centre in place */
  const zoomTo = (level: 'fit' | 'fill' | number) => {
    if (typeof level === 'string') setZoomChoice(level);
    else setZoom(zoomAt(zoom, level, full, stage));
  };
  /** The menu entry the zoom is at, if any */
  const zoomLevel: 'fit' | 'fill' | number = zoomChoice === 'fit' || zoomChoice === 'fill' ? zoomChoice
    : zoomChoice === 'actual' ? 1 : zoom.scale;

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

  // Viewer keys from the user's keymap; keys typed into controls stay there (keys/dispatcher.ts)
  const rtl = i18n.dir() === 'rtl';
  const pan = (dx: number, dy: number) => () => {
    // The arrows were mirrored for the keymap; panning follows the arrow that was pressed
    if (!frame) setZoom(panBy(zoom, (rtl ? -dx : dx) * PAN_STEP, dy * PAN_STEP, full, stage));
  };
  const unzoomed = (run: () => void) => ({ run, enabled: () => !frame });
  const canStar = useAllows('photo.star');
  const star = async () => {
    try {
      replaceViewerPhoto(await apiRequest('PATCH', `/api/photos/${photo.id}/star`, { isStarred: !photo.isStarred }));
    } catch (err) {
      setLoadError(describeError(err, t));
    }
  };
  useKeyActions('viewer', LAYER.viewer, {
    // Esc closes what is open first: the frame, a floating panel, the Info panel, then the viewer
    'viewer.close': () => {
      const target = escapeTarget({ frame: !!frame, panel: !!panel, info: showInfo });
      if (target === 'frame') cancelFrame();
      else if (target === 'panel') setPanel(null);
      else if (target === 'info') setInfoOpen(false);
      else close();
    },
    'viewer.previous': prev,
    'viewer.next': next,
    'viewer.info': () => setInfoOpen((open) => !open),
    'viewer.faces': toggleFaces,
    'viewer.objects': toggleObjects,
    'viewer.star': { run: star, enabled: () => canStar },
    'viewer.zoomIn': unzoomed(() => zoomBy(ZOOM_STEP)),
    'viewer.zoomOut': unzoomed(() => zoomBy(1 / ZOOM_STEP)),
    'viewer.zoomReset': unzoomed(() => setZoomChoice('fit')),
    'viewer.zoomActual': unzoomed(() => zoomTo(1)),
    'viewer.panLeft': pan(1, 0),
    'viewer.panRight': pan(-1, 0),
    'viewer.panUp': pan(0, 1),
    'viewer.panDown': pan(0, -1),
  });
  /** Presses a filter's button in the edit bar, so the key does what a click does, only for filters the bar offers. */
  const filterButton = (name: string) => document.querySelector<HTMLButtonElement>(`.viewer-edit [data-filter="${CSS.escape(name)}"]`);
  const filterHandlers = Object.fromEntries([...(filters?.keys() ?? []), 'rotate'].map((name) => [name, {
    run: () => filterButton(name)?.click(),
    enabled: () => canEdit && !(filterButton(name)?.disabled ?? true),
  }]));
  const editHandlers: Parameters<typeof useKeyActions>[2] = {
    'edit.undo': { run: () => dispatch({ type: 'undo' }), enabled: () => canEdit && !frame },
    'edit.showOriginal': { run: () => setShowOriginal((shown) => !shown), enabled: () => canEdit },
  };
  const pluginFilters = useKeymapStore((state) => state.filters);
  for (const id of [...BUNDLED_FILTER_ACTIONS, ...pluginFilters.map((filter) => filter.id)]) {
    const handler = filterHandlers[id.split('.').slice(2).join('.')];
    if (handler) editHandlers[id] = handler;
  }
  useKeyActions('edit', LAYER.viewer, editHandlers);

  // A Global key that opens another view leaves the viewer as Close does: after its saves, and not when one failed
  useEffect(() => {
    setLeaveOverlay(async () => {
      if (frame || !(await edits.settle())) {
        setBlocked(!frame);
        return false;
      }
      closeViewer();
      return true;
    });
    return () => setLeaveOverlay(null);
  });

  const panelFilter = panel?.kind === 'filter' ? filters?.get(panel.name) : undefined;
  const panelSide = inwardSide(layout.editBar.edge);
  const saveMessage = edits.status === 'failed' ? describeError(edits.error, t) : null;

  return {
    root, photo, viewer, edits, chain, dispatch, canEdit, layout, barSize, filters, barFilters, loadError, setLoadError, panel, setPanel,
    panelFilter, panelSide, frame, setFrame, frameRatio, imageAspect, showOriginal, setShowOriginal, showGrid,
    setShowGrid, stage, full, zoom, preview, setZoom, onStageResize, zoomBy, zoomTo, zoomLevel,
    fit: () => setZoomChoice('fit'),
    canPrev, canNext, prev, next, close, openFrame, applyFrame, cancelFrame, setFrameRatio, chooseFilter, lastStep,
    paletteValues, blocked, setBlocked, saveMessage, canInfo, showInfo, toggleInfo: () => setInfoOpen((open) => !open),
    closeInfo: () => setInfoOpen(false), previewSteps, canFaces, canAssignFaces, showFaces, toggleFaces, canObjects, showObjects, toggleObjects,
  };
}

export type PhotoViewerModel = ReturnType<typeof usePhotoViewer>;
