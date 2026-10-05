import React from 'react';
import { Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Maximize, X, ZoomIn, ZoomOut } from 'lucide-react';
import { inwardSide, type BarPlacement } from './barLayout.js';
import { ViewerButton } from './ViewerButton.js';

interface NavBarProps {
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
}

/** The viewer's navigation bar: close, previous, next, file name, position and zoom. */
export const NavBar: React.FC<NavBarProps> = (props) => {
  const { t, i18n } = useTranslation();
  const { placement } = props;
  const column = placement.orientation === 'column';
  const tip = inwardSide(placement.edge);
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 }).format(props.scale);

  return (
    <nav className={`viewer-bar viewer-nav ${column ? 'flex-column' : 'flex-row'}`} style={props.style} aria-label={t('viewer.navigation')}>
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
      <span className="viewer-nav-zoom" aria-live="polite">{percent}</span>
      <ViewerButton label={t('viewer.zoomIn')} tip={tip} onClick={props.onZoomIn} disabled={props.zoomLocked}><ZoomIn size={24} /></ViewerButton>
      <ViewerButton label={t('viewer.fit')} tip={tip} onClick={props.onFit} disabled={props.zoomLocked}><Maximize size={22} /></ViewerButton>
    </nav>
  );
};
