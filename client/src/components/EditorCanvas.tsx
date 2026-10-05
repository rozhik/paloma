import React, { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, Badge, Form, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import {
  Crop, Image as ImageIcon, Redo2, RotateCcw, RotateCw, Save, Trash2, Undo2, X,
} from 'lucide-react';
import type { EditStep, FilterGroup, FilterInfo, FilterParamInfo, Photo, RelativeRect } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { fetchPlugins, savePhotoEdits } from '../api/plugins.js';
import { describeError } from '../api/http.js';
import { currentLanguage } from '../i18n/index.js';
import { chainReducer, initialChain } from './editChain.js';
import { CROP_RATIOS, FULL_FRAME, fitRatio, pixelRatio, type CropRatio } from './cropFrame.js';
import { CropOverlay, StraightenGrid } from './CropOverlay.js';
import { previewSizeFor, useEditPreview } from './useEditPreview.js';

interface EditorCanvasProps {
  photo: Photo;
  onSaveSuccess: () => void;
}

/** A rectangle parameter being edited as a frame over the image. */
interface FrameEdit {
  filter: string;
  param: string;
  /** The step being changed, or null for a new step */
  index: number | null;
  rect: RelativeRect;
  ratio: CropRatio;
  portrait: boolean;
}

const GROUPS: FilterGroup[] = ['basic', 'tuning', 'effects'];
/** Filters the editor offers as quick buttons instead of generic controls */
const ROTATE = 'rotate';
const STRAIGHTEN = 'straighten';

/** A step's parameter values for the controls: its own, else the filter's defaults. */
function valuesOf(filter: FilterInfo, step: EditStep | undefined): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const param of filter.params) values[param.name] = step?.[param.name] ?? param.default;
  return values;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({ photo, onSaveSuccess }) => {
  const { setActiveEditPhoto, bumpLibrary, refreshSelectedPhotos } = usePalomaStore();
  const { t, i18n } = useTranslation();
  const [chain, dispatch] = useReducer(chainReducer, photo.edits ?? [], initialChain);
  const [filters, setFilters] = useState<Map<string, FilterInfo> | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [frame, setFrame] = useState<FrameEdit | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters of the plugins that are on, with labels in the active language
  useEffect(() => {
    fetchPlugins(currentLanguage())
      .then((plugins) => setFilters(new Map(plugins
        .filter((plugin) => plugin.status === 'active')
        .flatMap((plugin) => plugin.filters)
        .map((filter) => [filter.name, filter]))))
      .catch((err) => setError(describeError(err, t)));
  }, [i18n.language]);

  // The preview fills the stage; its size decides the preview resolution
  const stage = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 800, height: 600 });
  useLayoutEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);

  const previewSteps = showOriginal ? [] : frame ? chain.steps.slice(0, frame.index ?? chain.steps.length) : chain.steps;
  const maxSize = previewSizeFor(box.width, box.height, window.devicePixelRatio || 1);
  const preview = useEditPreview(photo.id, previewSteps, maxSize);

  // Shown size of the preview, fitted in the stage
  const scale = preview.width > 0 ? Math.min(box.width / preview.width, box.height / preview.height) : 0;
  const shown = { width: Math.floor(preview.width * scale), height: Math.floor(preview.height * scale) };

  const close = () => setActiveEditPhoto(null);
  const isAvailable = (step: EditStep) => filters?.has(step.filter) ?? false;

  // Ctrl+Z / Ctrl+Shift+Z (Cmd on a Mac) for undo and redo
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || frame) return;
      event.preventDefault();
      dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frame]);

  // A selected step that disappeared (undo, remove) is no longer selected
  useEffect(() => {
    if (selected !== null && selected >= chain.steps.length) setSelected(null);
  }, [chain.steps.length, selected]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await savePhotoEdits(photo.id, chain.steps);
      refreshSelectedPhotos([updated]);
      bumpLibrary();
      onSaveSuccess();
      close();
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const formatNumber = (value: number) => new Intl.NumberFormat(i18n.language).format(value);

  /** Short text for a step: the filter's label and its values, or its name when unavailable. */
  const stepLabel = (step: EditStep): string => {
    const filter = filters?.get(step.filter);
    if (!filter) return step.filter;
    const values = filter.params.map((param) => {
      const value = step[param.name];
      if (param.type === 'number' && typeof value === 'number') return formatNumber(value);
      if (param.type === 'choice') return param.options.find((option) => option.value === value)?.label ?? '';
      if (param.type === 'boolean') return value ? t('plugins.on') : t('plugins.off');
      return '';
    }).filter(Boolean);
    return [filter.label, ...values].join(' ');
  };

  /** Opens the frame editor for a rectangle parameter: of the step at `index`, or for a new step. */
  const openFrame = (filter: FilterInfo, param: FilterParamInfo & { type: 'rect' }, index: number | null) => {
    // A new frame right after a step of the same filter changes that step, as other controls do
    const last = chain.steps.length - 1;
    const target = index ?? (chain.steps[last]?.filter === filter.name && chain.steps[last].enabled !== false ? last : null);
    const current = target !== null ? chain.steps[target][param.name] as RelativeRect | undefined : undefined;
    setFrame({ filter: filter.name, param: param.name, index: target, rect: current ?? param.default ?? FULL_FRAME, ratio: 'free', portrait: false });
    setSelected(null);
  };

  const applyFrame = () => {
    if (!frame || !filters) return;
    if (frame.index !== null) {
      dispatch({ type: 'update', index: frame.index, params: { [frame.param]: frame.rect } });
    } else {
      const filter = filters.get(frame.filter)!;
      dispatch({ type: 'apply', filter: frame.filter, params: { ...valuesOf(filter, undefined), [frame.param]: frame.rect } });
    }
    dispatch({ type: 'commit' });
    setFrame(null);
  };

  const imageAspect = preview.height > 0 ? preview.width / preview.height : 1;
  const photoAspect = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : imageAspect;
  const frameRatio = frame ? pixelRatio(frame.ratio, photoAspect, frame.portrait) : null;
  const setFrameRatio = (ratio: CropRatio, portrait: boolean) => {
    if (!frame) return;
    setFrame({ ...frame, ratio, portrait, rect: fitRatio(frame.rect, pixelRatio(ratio, photoAspect, portrait), imageAspect) });
  };

  /** Controls for a filter's parameters; `onChange` gets the full set of values. */
  const renderControls = (
    filter: FilterInfo,
    values: Record<string, unknown>,
    onChange: (values: Record<string, unknown>) => void,
    index: number | null,
  ) => (
    <>
      {filter.params.map((param) => {
        const value = values[param.name];
        const set = (next: unknown) => onChange({ ...values, [param.name]: next });
        switch (param.type) {
          case 'number':
            return (
              <div key={param.name} className="mb-2">
                <label className="form-label fs-5 d-flex justify-content-between mb-1" htmlFor={`${filter.name}-${param.name}-${index}`}>
                  <span>{filter.params.length > 1 ? param.label : filter.label}</span>
                  <span className="fw-semibold">{formatNumber(value as number)}</span>
                </label>
                <input
                  id={`${filter.name}-${param.name}-${index}`}
                  type="range"
                  className="form-range editor-slider"
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  value={value as number}
                  onChange={(event) => set(Number(event.target.value))}
                  onPointerDown={() => filter.name === STRAIGHTEN && setShowGrid(true)}
                  onPointerUp={() => { setShowGrid(false); dispatch({ type: 'commit' }); }}
                  onKeyUp={() => dispatch({ type: 'commit' })}
                  onBlur={() => dispatch({ type: 'commit' })}
                />
              </div>
            );
          case 'boolean':
            return (
              <Form.Check
                key={param.name}
                type="switch"
                id={`${filter.name}-${param.name}-${index}`}
                className="fs-5 mb-2"
                label={filter.params.length > 1 ? param.label : filter.label}
                checked={value as boolean}
                onChange={(event) => { set(event.target.checked); dispatch({ type: 'commit' }); }}
              />
            );
          case 'choice':
            return (
              <div key={param.name} className="mb-2">
                <div className="fs-5 mb-1">{filter.params.length > 1 ? param.label : filter.label}</div>
                <div className="d-flex flex-wrap gap-2">
                  {param.options.map((option) => (
                    <button
                      key={String(option.value)}
                      type="button"
                      className={`btn btn-lg ${index !== null && value === option.value ? 'btn-primary' : 'btn-outline-light'}`}
                      onClick={() => { set(option.value); dispatch({ type: 'commit' }); }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          case 'rect':
            return (
              <button
                key={param.name}
                type="button"
                className="btn btn-lg btn-outline-light w-100 mb-2 d-flex align-items-center justify-content-center gap-2"
                onClick={() => openFrame(filter, param, index)}
              >
                <Crop size={22} />
                <span>{filter.params.length > 1 ? param.label : filter.label}</span>
              </button>
            );
        }
      })}
      {filter.params.length === 0 && index === null && (
        <button
          type="button"
          className="btn btn-lg btn-outline-light"
          onClick={() => { dispatch({ type: 'apply', filter: filter.name, params: {} }); dispatch({ type: 'commit' }); }}
        >
          {filter.label}
        </button>
      )}
    </>
  );

  const lastStep = chain.steps[chain.steps.length - 1];
  const paletteValues = (filter: FilterInfo) =>
    valuesOf(filter, lastStep?.filter === filter.name && lastStep.enabled !== false ? lastStep : undefined);
  const grouped = useMemo(() => {
    const byGroup = new Map<FilterGroup, FilterInfo[]>(GROUPS.map((group) => [group, []]));
    for (const filter of filters?.values() ?? []) {
      if (filter.name !== ROTATE) byGroup.get(filter.group)?.push(filter);
    }
    return byGroup;
  }, [filters]);

  return (
    <div className="d-flex vh-100 w-100 bg-dark text-white overflow-hidden">
      {/* Preview */}
      <div className="flex-grow-1 d-flex flex-column p-3 gap-2 overflow-hidden" style={{ minWidth: 0 }}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <button className="btn btn-outline-light btn-lg-custom" onClick={() => dispatch({ type: 'undo' })} disabled={chain.past.length === 0 || !!frame}>
            <Undo2 size={20} className="flip-rtl" />
            <span>{t('editor.undo')}</span>
          </button>
          <button className="btn btn-outline-light btn-lg-custom" onClick={() => dispatch({ type: 'redo' })} disabled={chain.future.length === 0 || !!frame}>
            <Redo2 size={20} className="flip-rtl" />
            <span>{t('editor.redo')}</span>
          </button>
          <div className="flex-grow-1" />
          {preview.loading && <Spinner animation="border" size="sm" aria-label={t('editor.loading')} />}
          <button
            className={`btn btn-lg-custom ${showOriginal ? 'btn-warning' : 'btn-outline-secondary'}`}
            onPointerDown={() => setShowOriginal(true)}
            onPointerUp={() => setShowOriginal(false)}
            onPointerLeave={() => setShowOriginal(false)}
            onKeyDown={(event) => event.key === ' ' && setShowOriginal(true)}
            onKeyUp={() => setShowOriginal(false)}
            disabled={!!frame}
          >
            <ImageIcon size={20} />
            <span>{t('editor.holdForOriginal')}</span>
          </button>
        </div>

        <div ref={stage} className="flex-grow-1 d-flex align-items-center justify-content-center overflow-hidden" style={{ minHeight: 0 }}>
          {preview.url && (
            <div className="position-relative" style={{ width: shown.width, height: shown.height }}>
              <img src={preview.url} alt={photo.filename} className="d-block w-100 h-100" draggable={false} />
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
            </div>
          )}
          {!preview.url && !preview.error && <Spinner animation="border" />}
        </div>
        {preview.error != null && <Alert variant="danger" className="mb-0">{describeError(preview.error, t)}</Alert>}
      </div>

      {/* Tools */}
      <div className="bg-secondary text-white p-4 border-start border-secondary d-flex flex-column" style={{ width: '400px', flexShrink: 0, overflowY: 'auto' }}>
        <h4 className="fw-bold mb-3 border-bottom pb-2">{t('editor.title')}</h4>
        {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

        {frame ? (
          <div>
            <p className="fs-5">{t('editor.frame.hint')}</p>
            <div className="fs-5 mb-2">{t('editor.frame.ratio')}</div>
            <div className="d-flex flex-wrap gap-2 mb-3">
              {CROP_RATIOS.map((ratio) => {
                const label = ratio === 'free' ? t('editor.frame.free') : ratio === 'original' ? t('editor.frame.original') : `${ratio[0]}:${ratio[1]}`;
                const active = JSON.stringify(ratio) === JSON.stringify(frame.ratio);
                return (
                  <button key={label} type="button" className={`btn btn-lg ${active ? 'btn-primary' : 'btn-outline-light'}`}
                    onClick={() => setFrameRatio(ratio, frame.portrait)}>
                    <span dir="ltr">{label}</span>
                  </button>
                );
              })}
            </div>
            {frame.ratio !== 'free' && (
              <div className="btn-group mb-3 w-100">
                <button type="button" className={`btn btn-lg ${!frame.portrait ? 'btn-primary' : 'btn-outline-light'}`}
                  onClick={() => setFrameRatio(frame.ratio, false)}>{t('editor.frame.landscape')}</button>
                <button type="button" className={`btn btn-lg ${frame.portrait ? 'btn-primary' : 'btn-outline-light'}`}
                  onClick={() => setFrameRatio(frame.ratio, true)}>{t('editor.frame.portrait')}</button>
              </div>
            )}
            <div className="d-grid gap-2">
              <button className="btn btn-success btn-lg-custom py-3" onClick={applyFrame}>{t('editor.frame.apply')}</button>
              <button className="btn btn-outline-light btn-lg-custom" onClick={() => setFrame(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        ) : (
          <>
            {filters === null && !error && <Spinner animation="border" />}

            {GROUPS.map((group) => {
              const list = grouped.get(group) ?? [];
              const quickRotate = group === 'basic' && filters?.has(ROTATE);
              if (list.length === 0 && !quickRotate) return null;
              return (
                <section key={group} className="mb-3 border-bottom pb-2">
                  <h5 className="fw-bold mb-3">{t(`editor.groups.${group}`)}</h5>
                  {quickRotate && (
                    <div className="d-flex gap-2 mb-3">
                      <button className="btn btn-lg btn-outline-light flex-grow-1 d-flex align-items-center justify-content-center gap-2"
                        onClick={() => dispatch({ type: 'rotate', delta: -90 })}>
                        <RotateCcw size={22} />
                        <span>{t('editor.rotateLeft')}</span>
                      </button>
                      <button className="btn btn-lg btn-outline-light flex-grow-1 d-flex align-items-center justify-content-center gap-2"
                        onClick={() => dispatch({ type: 'rotate', delta: 90 })}>
                        <RotateCw size={22} />
                        <span>{t('editor.rotateRight')}</span>
                      </button>
                    </div>
                  )}
                  <div className={group === 'effects' ? 'd-flex flex-wrap gap-2' : ''}>
                    {list.map((filter) => (
                      <div key={filter.name} className={group === 'effects' && filter.params.length === 0 ? '' : 'mb-2 w-100'}>
                        {renderControls(filter, paletteValues(filter),
                          (values) => dispatch({ type: 'apply', filter: filter.name, params: values }), null)}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            <section className="mb-3">
              <h5 className="fw-bold mb-2">{t('editor.steps')}</h5>
              {chain.steps.length === 0 && <p className="text-white-50">{t('editor.noSteps')}</p>}
              <ol className="list-unstyled mb-0">
                {chain.steps.map((step, index) => {
                  const filter = filters?.get(step.filter);
                  const isSelected = selected === index;
                  return (
                    <li key={index} className={`rounded p-2 mb-2 ${isSelected ? 'bg-dark' : 'bg-secondary-subtle text-dark'}`}>
                      <div className="d-flex align-items-center gap-2">
                        <button
                          type="button"
                          className={`btn btn-link text-start flex-grow-1 p-0 fs-5 text-decoration-none ${isSelected ? 'text-white' : 'text-dark'}`}
                          onClick={() => setSelected(isSelected || !filter || filter.params.length === 0 ? null : index)}
                        >
                          <span className="me-2">{index + 1}.</span>
                          <span dir="auto">{stepLabel(step)}</span>
                        </button>
                        {!isAvailable(step) && filters && <Badge bg="warning" text="dark">{t('editor.unavailable')}</Badge>}
                        {step.enabled === false && <Badge bg="secondary">{t('editor.notApplied')}</Badge>}
                        <button type="button" className="btn btn-outline-danger" aria-label={t('editor.removeStep', { n: index + 1 })}
                          title={t('editor.removeStep', { n: index + 1 })}
                          onClick={() => dispatch({ type: 'remove', index })}>
                          <Trash2 size={20} />
                        </button>
                      </div>
                      {!isAvailable(step) && filters && <div className="small mt-1">{t('editor.unavailableHint')}</div>}
                      {isSelected && filter && (
                        <div className="mt-2">
                          {renderControls(filter, valuesOf(filter, step),
                            (values) => dispatch({ type: 'update', index, params: values }), index)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>

            <div className="d-grid gap-2 mt-auto border-top pt-3">
              <button className="btn btn-success btn-lg-custom py-3" onClick={save} disabled={saving}>
                <Save size={24} />
                <span>{saving ? t('editor.saving') : t('editor.save')}</span>
              </button>
              <button className="btn btn-outline-light btn-lg-custom" onClick={() => dispatch({ type: 'reset' })} disabled={chain.steps.length === 0}>
                <RotateCcw size={20} />
                <span>{t('editor.reset')}</span>
              </button>
              <button className="btn btn-outline-light btn-lg-custom" onClick={close}>
                <X size={20} />
                <span>{t('common.cancel')}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
