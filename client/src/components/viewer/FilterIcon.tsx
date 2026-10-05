import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

/**
 * A plugin filter's icon. The SVG is used only as a CSS mask painted in the current text colour, never put
 * into the page as markup, so a plugin's file cannot run scripts here. Without an icon: a generic one.
 */
export const FilterIcon: React.FC<{ url?: string; size?: number }> = ({ url, size = 26 }) => {
  if (!url) return <SlidersHorizontal size={size} aria-hidden="true" />;
  const mask = `url("${url.replace(/"/g, '%22')}") center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-block', width: size, height: size, backgroundColor: 'currentColor', mask, WebkitMask: mask }}
    />
  );
};
