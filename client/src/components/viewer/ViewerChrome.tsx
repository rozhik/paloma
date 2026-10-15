import React from 'react';
import { useTranslation } from 'react-i18next';
import { framePixelSize } from '../cropFrame.js';
import { barStyle, infoPanelStyle } from './barLayout.js';
import { InfoPanel } from './InfoPanel.js';
import { EditBar } from './EditBar.js';
import { ChangesList, FilterControls, FloatingPanel, FrameControls } from './FilterPanel.js';
import { NavBar } from './NavBar.js';
import { STRAIGHTEN, type PhotoViewerModel } from './usePhotoViewer.js';
import { ZOOM_STEP, canZoomTo } from './zoomMath.js';

export interface ViewerChromeProps {
  model: PhotoViewerModel;
  /** Extra class on both bars and the panel, for a skin's look */
  className?: string;
}

/**
 * The viewer's controls over the photo: the navigation bar, the edit bar and the floating panel, placed on the
 * edges chosen in Settings. Skins use it as it is or wrap it with their own look.
 */
export const ViewerChrome: React.FC<ViewerChromeProps> = ({ model: v, className }) => {
  const { t } = useTranslation();
  const { frame, chain, dispatch, panel, panelFilter, preview } = v;

  return (
    <>
      <NavBar
        className={className}
        placement={v.layout.navBar}
        style={barStyle(v.layout.navBar)}
        filename={v.photo.filename}
        index={v.viewer.index}
        total={v.viewer.photos.length}
        scale={v.zoom.scale}
        canPrev={v.canPrev && !frame}
        canNext={v.canNext && !frame}
        zoomLocked={!!frame}
        saving={v.edits.status === 'saving'}
        onClose={v.close}
        onPrev={v.prev}
        onNext={v.next}
        onZoomIn={() => v.zoomBy(ZOOM_STEP)}
        onZoomOut={() => v.zoomBy(1 / ZOOM_STEP)}
        onFit={v.fit}
        zoomLevel={v.zoomLevel}
        canZoomTo={(scale) => canZoomTo(scale, v.full, v.stage)}
        onZoomTo={v.zoomTo}
        onInfo={v.canInfo ? v.toggleInfo : undefined}
        infoOpen={v.showInfo}
        onFaces={v.canFaces ? v.toggleFaces : undefined}
        facesOn={v.showFaces}
        onObjects={v.canObjects ? v.toggleObjects : undefined}
        objectsOn={v.showObjects}
      />

      {v.showInfo && <InfoPanel className={className} photo={v.photo} style={infoPanelStyle(v.layout)} onClose={v.closeInfo} />}

      {v.canEdit && (
        <EditBar
          className={className}
          placement={v.layout.editBar}
          style={barStyle(v.layout.editBar)}
          filters={v.barFilters}
          canUndo={chain.steps.length > 0}
          locked={!!frame}
          openPanel={panel}
          showingOriginal={v.showOriginal}
          onUndo={() => dispatch({ type: 'undo' })}
          onRotate={(delta) => dispatch({ type: 'rotate', delta })}
          onFilter={v.chooseFilter}
          onChanges={(anchor) => v.setPanel(panel?.kind === 'changes' ? null : { kind: 'changes', anchor })}
          onShowOriginal={v.setShowOriginal}
        />
      )}

      {v.canEdit && panel && (panelFilter || panel.kind === 'changes') && (
        <FloatingPanel
          className={className}
          side={v.panelSide}
          anchor={panel.anchor}
          title={panelFilter ? panelFilter.label : t('editor.steps')}
          onClose={() => (frame ? v.cancelFrame() : v.setPanel(null))}
        >
          {frame ? (
            <FrameControls
              hint={t('editor.frame.hint')}
              pixelSize={!preview.loading && preview.fullWidth > 0
                ? framePixelSize(frame.rect, { width: preview.fullWidth, height: preview.fullHeight })
                : null}
              ratio={frame.ratio}
              portrait={frame.portrait}
              onRatio={v.setFrameRatio}
              onApply={v.applyFrame}
              onCancel={v.cancelFrame}
            />
          ) : panelFilter ? (
            <FilterControls
              filter={panelFilter}
              values={v.paletteValues(panelFilter)}
              editing={v.lastStep?.filter === panelFilter.name}
              onChange={(values) => dispatch({ type: 'apply', filter: panelFilter.name, params: values })}
              onCommit={() => dispatch({ type: 'commit' })}
              onFrame={(param) => v.openFrame(panelFilter, param)}
              onSliding={(sliding) => v.setShowGrid(sliding && panelFilter.name === STRAIGHTEN)}
              idPrefix="panel"
            />
          ) : (
            <ChangesList steps={chain.steps} filters={v.filters} />
          )}
        </FloatingPanel>
      )}
    </>
  );
};
