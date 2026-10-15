import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { BoxSelect, Check, ChevronLeft, ChevronRight, Info, Maximize, ScanFace, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Edge } from '../../settings/uiSettings.js';
import { ZOOM_PERCENTS } from './zoomMath.js';
import { inwardSide, type BarPlacement } from './barLayout.js';
import { ViewerButton } from './ViewerButton.js';

interface NavBarProps {
  /** Extra class from the skin */
  className?: string;
  placement: BarPlacement;
  style: React.CSSProperties;
  filename: string;
  index: number;
  total: number;
  /** Zoom as a fraction of the photo's actual pixels (1 = 100%) */
  scale: number;
  canPrev: boolean;
  canNext: boolean;
  /** Zoom controls are off while a frame is edited */
  zoomLocked: boolean;
  saving: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** The zoom menu's level the photo is at: a named level, or a scale that is marked when it is one of the percentages */
  zoomLevel: ZoomMenuValue;
  /** Whether a percentage of the zoom menu can be chosen (not below the fitted size) */
  canZoomTo: (scale: number) => boolean;
  onZoomTo: (level: 'fit' | 'fill' | number) => void;
  /** Opens or closes the Info panel; without it the bar has no Info button (the level does not offer it) */
  onInfo?: () => void;
  infoOpen?: boolean;
  /** Turns face frames on or off; without it the bar has no Faces toggle (the level does not offer it) */
  onFaces?: () => void;
  facesOn?: boolean;
  /** Turns object frames on or off; without it the bar has no Objects toggle (the level does not offer it) */
  onObjects?: () => void;
  objectsOn?: boolean;
}

/** The viewer's navigation bar: close, previous, next, file name, position, zoom, face and object frames, and Info. */
export const NavBar: React.FC<NavBarProps> = (props) => {
  const { t, i18n } = useTranslation();
  const { placement } = props;
  const column = placement.orientation === 'column';
  const tip = inwardSide(placement.edge);
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 }).format(props.scale);

  return (
    <nav className={`viewer-bar viewer-nav ${column ? 'flex-column' : 'flex-row'} ${props.className ?? ''}`} style={props.style} aria-label={t('viewer.navigation')}>
      <ViewerButton label={t('viewer.close')} tip={tip} onClick={props.onClose}><X size={26} /></ViewerButton>
      <ViewerButton label={t('viewer.previous')} tip={tip} onClick={props.onPrev} disabled={!props.canPrev}>
        <ChevronLeft size={28} className="flip-rtl" />
      </ViewerButton>
      <ViewerButton label={t('viewer.next')} tip={tip} onClick={props.onNext} disabled={!props.canNext}>
        <ChevronRight size={28} className="flip-rtl" />
      </ViewerButton>

      <div className={`viewer-nav-title ${column ? 'vertical' : ''}`} title={props.filename}>
        <span dir="auto" className="viewer-nav-filename">{props.filename}</span>
        <span className="viewer-nav-position" dir="ltr">{t('viewer.position', { index: props.index + 1, total: props.total })}</span>
      </div>
      {props.saving && <Spinner animation="border" size="sm" role="status" aria-label={t('viewer.saving')} className="m-2 flex-shrink-0" />}

      <ViewerButton label={t('viewer.zoomOut')} tip={tip} onClick={props.onZoomOut} disabled={props.zoomLocked}><ZoomOut size={24} /></ViewerButton>
      <ZoomMenu
        percent={percent}
        tip={tip}
        level={props.zoomLevel}
        disabled={props.zoomLocked}
        canZoomTo={props.canZoomTo}
        onZoomTo={props.onZoomTo}
      />
      <ViewerButton label={t('viewer.zoomIn')} tip={tip} onClick={props.onZoomIn} disabled={props.zoomLocked}><ZoomIn size={24} /></ViewerButton>
      <ViewerButton label={t('viewer.fit')} tip={tip} onClick={props.onFit} disabled={props.zoomLocked}><Maximize size={22} /></ViewerButton>
      {props.onFaces && (
        <ViewerButton label={t('viewer.faces')} tip={tip} onClick={props.onFaces} active={props.facesOn} aria-pressed={!!props.facesOn}>
          <ScanFace size={24} />
        </ViewerButton>
      )}
      {props.onObjects && (
        <ViewerButton label={t('viewer.objects')} tip={tip} onClick={props.onObjects} active={props.objectsOn} aria-pressed={!!props.objectsOn}>
          <BoxSelect size={24} />
        </ViewerButton>
      )}
      {props.onInfo && (
        <ViewerButton label={t('viewer.info')} tip={tip} onClick={props.onInfo} active={props.infoOpen} aria-pressed={!!props.infoOpen}>
          <Info size={24} />
        </ViewerButton>
      )}
    </nav>
  );
};

export type ZoomMenuValue = 'fit' | 'fill' | number;

export interface ZoomMenuItem {
  value: ZoomMenuValue;
  /** The photo is at this level */
  checked: boolean;
  disabled: boolean;
}

/** The zoom menu's entries: Fit, Fill and the percentages, the current one checked, those below Fit disabled. */
export function zoomMenuItems(level: ZoomMenuValue, canZoomTo: (scale: number) => boolean): ZoomMenuItem[] {
  const isAt = (value: ZoomMenuValue) => (typeof value === 'number' && typeof level === 'number'
    ? Math.abs(value - level) < 1e-6
    : value === level);
  return (['fit', 'fill', ...ZOOM_PERCENTS] as ZoomMenuValue[]).map((value) => ({
    value,
    checked: isAt(value),
    disabled: typeof value === 'number' && !canZoomTo(value),
  }));
}

/** Which way the menu opens: towards the photo, away from the bar's edge. */
const DROP = { bottom: 'down', top: 'up', right: 'end', left: 'start' } as const;

/** The zoom percentage; choosing it opens the zoom levels: Fit, Fill and the percentages. */
const ZoomMenu: React.FC<{
  percent: string;
  tip: Edge;
  level: ZoomMenuValue;
  disabled: boolean;
  canZoomTo: (scale: number) => boolean;
  onZoomTo: (level: ZoomMenuValue) => void;
}> = ({ percent, tip, level, disabled, canZoomTo, onZoomTo }) => {
  const { t, i18n } = useTranslation();
  const [show, setShow] = useState(false);
  const format = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 });
  const labelOf = (value: ZoomMenuValue) => {
    if (typeof value === 'string') return t(`viewer.zoomLevels.${value}`);
    return value === 1 ? `${format.format(value)} (${t('viewer.zoomLevels.actual')})` : format.format(value);
  };
  return (
    <Dropdown show={show} onToggle={(next) => setShow(next)} drop={DROP[tip]} className="flex-shrink-0">
      <Dropdown.Toggle
        as="button"
        type="button"
        bsPrefix="viewer-zoom-toggle"
        className="viewer-nav-zoom"
        disabled={disabled}
        aria-label={`${t('viewer.zoomLevel')}: ${percent}`}
        title={t('viewer.zoomLevel')}
      >
        <span aria-live="polite">{percent}</span>
      </Dropdown.Toggle>
      {show && createPortal(
        <Dropdown.Menu className="viewer-zoom-menu shadow" popperConfig={{ strategy: 'fixed' }}>
          {zoomMenuItems(level, canZoomTo).map((item) => (
            <Dropdown.Item
              key={String(item.value)}
              as="button"
              type="button"
              role="menuitemradio"
              aria-checked={item.checked}
              active={item.checked}
              disabled={item.disabled}
              onClick={() => {
                setShow(false);
                onZoomTo(item.value);
              }}
            >
              <span className="d-flex align-items-center gap-2">
                <Check size={16} aria-hidden="true" style={{ visibility: item.checked ? 'visible' : 'hidden' }} />
                <span>{labelOf(item.value)}</span>
              </span>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>,
        document.body,
      )}
    </Dropdown>
  );
};
