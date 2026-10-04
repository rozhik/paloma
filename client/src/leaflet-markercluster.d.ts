// The parts of leaflet.markercluster that Paloma uses; the package ships no types.
import 'leaflet';

declare module 'leaflet' {
  interface MarkerClusterGroupOptions {
    showCoverageOnHover?: boolean;
    zoomToBoundsOnClick?: boolean;
    spiderfyOnMaxZoom?: boolean;
    maxClusterRadius?: number;
    chunkedLoading?: boolean;
    iconCreateFunction?: (cluster: MarkerCluster) => Icon | DivIcon;
  }

  class MarkerCluster extends Marker {
    getChildCount(): number;
    getAllChildMarkers(): Marker[];
    getBounds(): LatLngBounds;
    zoomToBounds(options?: FitBoundsOptions): void;
  }

  class MarkerClusterGroup extends FeatureGroup {
    constructor(options?: MarkerClusterGroupOptions);
    addLayers(layers: Layer[]): this;
    clearLayers(): this;
  }

  function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;

  interface MarkerClusterMouseEvent extends LeafletMouseEvent {
    layer: MarkerCluster;
  }
}
