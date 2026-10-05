import React, { useMemo } from 'react';
import { Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Eye, ListOrdered, RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import type { FilterGroup, FilterInfo } from '../../../../shared/types.js';
import { inwardSide, type BarPlacement } from './barLayout.js';
import { FilterIcon } from './FilterIcon.js';
import { ViewerButton } from './ViewerButton.js';

const GROUPS: FilterGroup[] = ['basic', 'tuning', 'effects'];
/** Offered as Rotate left and Rotate right instead of its own button */
export const ROTATE = 'rotate';

/** What a floating panel of the edit bar shows. */
export type PanelKind = { kind: 'filter'; name: string } | { kind: 'changes' };

/** Where a panel opens: next to the button that opened it, outside the bar. */
export interface PanelAnchor {
  button: DOMRect;
  bar: DOMRect;
}

interface EditBarProps {
  /** Extra class from the skin */
  className?: string;
  placement: BarPlacement;
  style: React.CSSProperties;
  /** Filters of active plugins; null while loading */
  filters: Map<string, FilterInfo> | null;
  /** Undo removes the last step, so it is possible while the chain has steps */
  canUndo: boolean;
  /** Everything but the frame's own panel is off while a frame is edited */
  locked: boolean;
  openPanel: PanelKind | null;
  showingOriginal: boolean;
  onUndo: () => void;
  onRotate: (delta: 90 | -90) => void;
  /** A filter was chosen; `anchor` places its panel */
  onFilter: (filter: FilterInfo, anchor: PanelAnchor) => void;
  onChanges: (anchor: PanelAnchor) => void;
  onShowOriginal: (show: boolean) => void;
}

const anchorOf = (event: React.MouseEvent<HTMLElement>): PanelAnchor => ({
  button: event.currentTarget.getBoundingClientRect(),
  bar: (event.currentTarget.closest('.viewer-bar') ?? event.currentTarget).getBoundingClientRect(),
});

/**
 * The viewer's edit bar: Undo first, then Rotate left/right, the filters of active plugins grouped as Basic,
 * Tuning and Effects, and finally Show original and Changes.
 */
export const EditBar: React.FC<EditBarProps> = (props) => {
  const { t } = useTranslation();
  const { placement, filters, locked, openPanel } = props;
  const column = placement.orientation === 'column';
  const tip = inwardSide(placement.edge);

  const grouped = useMemo(() => GROUPS.map((group) => ({
    group,
    list: [...(filters?.values() ?? [])].filter((filter) => filter.group === group && filter.name !== ROTATE),
  })), [filters]);

  const separator = <span className={`viewer-bar-separator ${column ? 'horizontal' : 'vertical'}`} aria-hidden="true" />;

  return (
    <div
      role="toolbar"
      aria-label={t('viewer.editBar')}
      aria-orientation={column ? 'vertical' : 'horizontal'}
      className={`viewer-bar viewer-edit ${column ? 'flex-column' : 'flex-row'} ${props.className ?? ''}`}
      style={props.style}
    >
      <ViewerButton label={t('editor.undo')} tip={tip} onClick={props.onUndo} disabled={!props.canUndo || locked}>
        <Undo2 size={26} className="flip-rtl" />
      </ViewerButton>

      {filters === null && <Spinner animation="border" size="sm" className="m-3" aria-label={t('editor.loading')} />}

      {filters?.has(ROTATE) && (
        <>
          {separator}
          <ViewerButton label={t('editor.rotateLeft')} tip={tip} onClick={() => props.onRotate(-90)} disabled={locked}>
            <RotateCcw size={26} />
          </ViewerButton>
          <ViewerButton label={t('editor.rotateRight')} tip={tip} onClick={() => props.onRotate(90)} disabled={locked}>
            <RotateCw size={26} />
          </ViewerButton>
        </>
      )}

      {grouped.map(({ group, list }) => list.length > 0 && (
        <React.Fragment key={group}>
          {separator}
          <div role="group" aria-label={t(`editor.groups.${group}`)} className={`d-flex ${column ? 'flex-column' : 'flex-row'} align-items-center`}>
            {list.map((filter) => {
              const active = openPanel?.kind === 'filter' && openPanel.name === filter.name;
              return (
                <ViewerButton
                  key={filter.name}
                  label={filter.label}
                  tip={tip}
                  active={active}
                  aria-expanded={filter.params.length > 0 ? active : undefined}
                  disabled={locked && !active}
                  onClick={(event) => props.onFilter(filter, anchorOf(event))}
                >
                  <FilterIcon url={filter.iconUrl} />
                </ViewerButton>
              );
            })}
          </div>
        </React.Fragment>
      ))}

      {separator}
      <ViewerButton
        label={t('editor.holdForOriginal')}
        tip={tip}
        active={props.showingOriginal}
        disabled={locked}
        onPointerDown={() => props.onShowOriginal(true)}
        onPointerUp={() => props.onShowOriginal(false)}
        onPointerLeave={() => props.onShowOriginal(false)}
        onKeyDown={(event) => (event.key === ' ' || event.key === 'Enter') && props.onShowOriginal(true)}
        onKeyUp={() => props.onShowOriginal(false)}
        onBlur={() => props.onShowOriginal(false)}
      >
        <Eye size={26} />
      </ViewerButton>
      <ViewerButton
        label={t('editor.steps')}
        tip={tip}
        active={openPanel?.kind === 'changes'}
        aria-expanded={openPanel?.kind === 'changes'}
        disabled={locked}
        onClick={(event) => props.onChanges(anchorOf(event))}
      >
        <ListOrdered size={26} className="flip-rtl" />
      </ViewerButton>
    </div>
  );
};
