import React, { useLayoutEffect, useRef, useState } from 'react';
import { Badge, Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Crop, X } from 'lucide-react';
import type { EditStep, FilterInfo, FilterParamInfo } from '../../../../shared/types.js';
import type { Edge } from '../../settings/uiSettings.js';
import { CROP_RATIOS, type CropRatio } from '../cropFrame.js';
import { FilterIcon } from './FilterIcon.js';
import type { PanelAnchor } from './EditBar.js';

const GAP = 8;

interface FloatingPanelProps {
  /** Extra class from the skin */
  className?: string;
  /** Side of the edit bar facing the photo: the panel opens there */
  side: Edge;
  /** The button that opened the panel and its bar, which the panel never covers */
  anchor: PanelAnchor;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** A panel over the photo, next to the edit bar button that opened it, kept inside the window. */
export const FloatingPanel: React.FC<FloatingPanelProps> = ({ className, side, anchor, title, onClose, children }) => {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const clamp = (value: number, size: number, max: number) => Math.max(GAP, Math.min(value, max - size - GAP));
    const { button, bar } = anchor;
    let left: number;
    let top: number;
    if (side === 'right' || side === 'left') {
      left = side === 'right' ? bar.right + GAP : bar.left - width - GAP;
      top = clamp(button.top, height, H);
    } else {
      top = side === 'bottom' ? bar.bottom + GAP : bar.top - height - GAP;
      left = clamp(button.left, width, W);
    }
    const next = { left: clamp(left, width, W), top: clamp(top, height, H) };
    // Re-measured after every render, as the content can change size; set only when it moved
    setPosition((current) => (current && current.left === next.left && current.top === next.top ? current : next));
  });

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={title}
      className={`viewer-panel ${className ?? ''}`}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
    >
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <h2 className="fs-5 fw-bold mb-0" dir="auto">{title}</h2>
        <button type="button" className="btn btn-sm btn-outline-light" aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {children}
    </div>
  );
};

interface FilterControlsProps {
  filter: FilterInfo;
  values: Record<string, unknown>;
  /** Called with the full set of values on every change, including while a slider moves */
  onChange: (values: Record<string, unknown>) => void;
  /** Ends a change: slider released, switch flipped, choice picked */
  onCommit: () => void;
  /** Opens the frame editor for a `rect` parameter */
  onFrame: (param: FilterParamInfo & { type: 'rect' }) => void;
  /** Whether a step of this filter is being changed (choices show their current value then) */
  editing: boolean;
  /** Straighten shows a grid while its slider moves */
  onSliding?: (sliding: boolean) => void;
  idPrefix: string;
}

/** Controls for a filter's parameters, generated from their types. */
export const FilterControls: React.FC<FilterControlsProps> = ({ filter, values, onChange, onCommit, onFrame, editing, onSliding, idPrefix }) => {
  const { i18n } = useTranslation();
  const formatNumber = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  const single = filter.params.length === 1;

  return (
    <>
      {filter.params.map((param) => {
        const value = values[param.name];
        const set = (next: unknown) => onChange({ ...values, [param.name]: next });
        const label = single ? filter.label : param.label;
        const id = `${idPrefix}-${filter.name}-${param.name}`;
        switch (param.type) {
          case 'number':
            return (
              <div key={param.name} className="mb-2">
                <label className="form-label fs-5 d-flex justify-content-between gap-3 mb-1" htmlFor={id}>
                  <span>{label}</span>
                  <span className="fw-semibold">{formatNumber(value as number)}</span>
                </label>
                <input
                  id={id}
                  type="range"
                  className="form-range editor-slider"
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  value={value as number}
                  onChange={(event) => set(Number(event.target.value))}
                  onPointerDown={() => onSliding?.(true)}
                  onPointerUp={() => { onSliding?.(false); onCommit(); }}
                  onKeyUp={onCommit}
                  onBlur={onCommit}
                />
              </div>
            );
          case 'boolean':
            return (
              <Form.Check
                key={param.name}
                type="switch"
                id={id}
                className="fs-5 mb-2"
                label={label}
                checked={value as boolean}
                onChange={(event) => { set(event.target.checked); onCommit(); }}
              />
            );
          case 'choice':
            return (
              <div key={param.name} className="mb-2">
                {!single && <div className="fs-5 mb-1">{label}</div>}
                <div className="d-flex flex-wrap gap-2">
                  {param.options.map((option) => (
                    <button
                      key={String(option.value)}
                      type="button"
                      className={`btn btn-lg ${editing && value === option.value ? 'btn-primary' : 'btn-outline-light'}`}
                      onClick={() => { set(option.value); onCommit(); }}
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
                onClick={() => onFrame(param)}
              >
                <Crop size={22} />
                <span>{label}</span>
              </button>
            );
        }
      })}
    </>
  );
};

interface FrameControlsProps {
  hint: string;
  /** Pixel size of the area inside the frame on the full-size image; null until it is known */
  pixelSize: { width: number; height: number } | null;
  ratio: CropRatio;
  portrait: boolean;
  onRatio: (ratio: CropRatio, portrait: boolean) => void;
  onApply: () => void;
  onCancel: () => void;
}

/** Proportions, orientation and Apply/Cancel of the crop frame. */
export const FrameControls: React.FC<FrameControlsProps> = ({ hint, pixelSize, ratio, portrait, onRatio, onApply, onCancel }) => {
  const { t } = useTranslation();
  return (
    <div>
      <p className="fs-6 viewer-muted">{hint}</p>
      <div className="fs-4 fw-semibold mb-3" aria-live="polite">
        {pixelSize ? <span dir="ltr">{t('editor.frame.size', { width: pixelSize.width, height: pixelSize.height })}</span> : '…'}
      </div>
      <div className="fs-5 mb-2">{t('editor.frame.ratio')}</div>
      <div className="d-flex flex-wrap gap-2 mb-3">
        {CROP_RATIOS.map((option) => {
          const label = option === 'free' ? t('editor.frame.free') : option === 'original' ? t('editor.frame.original') : `${option[0]}:${option[1]}`;
          const active = JSON.stringify(option) === JSON.stringify(ratio);
          return (
            <button key={label} type="button" className={`btn btn-lg ${active ? 'btn-primary' : 'btn-outline-light'}`} onClick={() => onRatio(option, portrait)}>
              <span dir="ltr">{label}</span>
            </button>
          );
        })}
      </div>
      {ratio !== 'free' && (
        <div className="btn-group mb-3 w-100">
          <button type="button" className={`btn btn-lg ${!portrait ? 'btn-primary' : 'btn-outline-light'}`} onClick={() => onRatio(ratio, false)}>
            {t('editor.frame.landscape')}
          </button>
          <button type="button" className={`btn btn-lg ${portrait ? 'btn-primary' : 'btn-outline-light'}`} onClick={() => onRatio(ratio, true)}>
            {t('editor.frame.portrait')}
          </button>
        </div>
      )}
      <div className="d-grid gap-2">
        <button type="button" className="btn btn-success btn-lg-custom" onClick={onApply}>{t('editor.frame.apply')}</button>
        <button type="button" className="btn btn-outline-light btn-lg-custom" onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  );
};

interface ChangesListProps {
  steps: EditStep[];
  filters: Map<string, FilterInfo> | null;
}

/**
 * The chain's steps, read-only: the chain is the photo's history, changed only by new steps and Undo. Each
 * step shows its filter's icon and values, and a step whose filter is missing is marked unavailable.
 */
export const ChangesList: React.FC<ChangesListProps> = ({ steps, filters }) => {
  const { t, i18n } = useTranslation();
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

  if (steps.length === 0) return <p className="viewer-muted mb-0">{t('editor.noSteps')}</p>;

  return (
    <ol className="list-unstyled mb-0">
      {steps.map((step, index) => {
        const filter = filters?.get(step.filter);
        const available = !filters || !!filter;
        return (
          <li key={index} className="rounded p-2 mb-2 viewer-step">
            <div className="d-flex align-items-center gap-2 fs-5">
              <span>{index + 1}.</span>
              <FilterIcon url={filter?.iconUrl} size={22} />
              <span dir="auto" className="flex-grow-1">{stepLabel(step)}</span>
              {!available && <Badge bg="warning" text="dark">{t('editor.unavailable')}</Badge>}
              {step.enabled === false && <Badge bg="secondary">{t('editor.notApplied')}</Badge>}
            </div>
            {!available && <div className="small mt-1">{t('editor.unavailableHint')}</div>}
          </li>
        );
      })}
    </ol>
  );
};
