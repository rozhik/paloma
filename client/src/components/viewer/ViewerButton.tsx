import React, { forwardRef } from 'react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import type { Edge } from '../../settings/uiSettings.js';

interface ViewerButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  /** Accessible name and tooltip text */
  label: string;
  /** Side the tooltip opens on: the side of the bar facing the photo */
  tip: Edge;
  active?: boolean;
}

/** A large icon button of a viewer bar, with a tooltip. */
export const ViewerButton = forwardRef<HTMLButtonElement, ViewerButtonProps>(({ label, tip, active, className, children, ...rest }, ref) => {
  const button = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={`viewer-btn ${active ? 'active' : ''} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  );
  // A disabled button gets no pointer events, so its tooltip would never close; it keeps only its name
  if (rest.disabled) return button;
  return (
    <OverlayTrigger placement={tip} delay={{ show: 300, hide: 0 }} overlay={<Tooltip>{label}</Tooltip>}>
      {button}
    </OverlayTrigger>
  );
});
ViewerButton.displayName = 'ViewerButton';
