import React from 'react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import type { LucideIcon } from 'lucide-react';

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  icon: LucideIcon;
  /** Accessible name and tooltip */
  label: string;
  iconSize?: number;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Marks the current view or a pressed toggle */
  active?: boolean;
}

/** A button that shows only an icon; its label is its accessible name and tooltip. */
export const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon, label, iconSize = 18, placement = 'bottom', active, className, ...rest
}) => {
  const button = (
    <button type="button" aria-label={label} className={`${className ?? ''} ${active ? 'active' : ''}`} {...rest}>
      <Icon size={iconSize} aria-hidden="true" />
    </button>
  );
  // A disabled button gets no pointer events, so its tooltip would never close
  if (rest.disabled) return button;
  return (
    <OverlayTrigger placement={placement} delay={{ show: 250, hide: 0 }} overlay={<Tooltip>{label}</Tooltip>}>
      {button}
    </OverlayTrigger>
  );
};
