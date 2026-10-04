import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Crosshair, MapPinOff, Search } from 'lucide-react';
import type { GeoBounds, GeoPlaces, GeoPoint, GeoSearchResult, GeoSettings, Geotag, Photo } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { libraryQueryParams } from '../api/library.js';
import { describeError } from '../api/http.js';
import { fetchGeoPoints, fetchGeoSettings, fetchPlaces, searchAddress, setPhotosLocation } from '../api/geo.js';
import { currentLanguage } from '../i18n/index.js';
import { useFormat } from '../i18n/format.js';
import { ConfirmModal } from './ConfirmModal.js';
import { PHOTO_DRAG_TYPE } from './PhotoTray.js';

const PLACES_POLL_MS = 5000;
const WORLD: L.LatLngBoundsExpression = [[-60, -170], [75, 170]];

const toLatLngBounds = ({ south, west, north, east }: GeoBounds): L.LatLngBounds => L.latLngBounds([south, west], [north, east]);

/** A thumbnail pin; the photo itself is the marker. */
const thumbnailIcon = (url: string): L.DivIcon => L.divIcon({
  className: 'map-thumb-marker',
  html: `<img src="${url}" alt="" draggable="false" />`,
  iconSize: [48, 48],
  iconAnchor: [24, 48],
  popupAnchor: [0, -48],
});

const clusterIcon = (url: string, count: number): L.DivIcon => L.divIcon({
  className: 'map-thumb-marker map-cluster-marker',
  html: `<img src="${url}" alt="" draggable="false" /><span class="map-cluster-count">${count}</span>`,
  iconSize: [56, 56],
  iconAnchor: [28, 56],
  popupAnchor: [0, -56],
});

interface PhotosPopup {
  position: L.LatLng;
  points: GeoPoint[];
}

/** Geotagged photos as clustered thumbnails; a cluster that cannot be split, or a single photo, opens a popup. */
const ClusterLayer: React.FC<{ points: GeoPoint[]; onOpen: (popup: PhotosPopup) => void }> = ({ points, onOpen }) => {
  const map = useMap();
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const pointOf = new Map<L.Marker, GeoPoint>();
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      spiderfyOnMaxZoom: false,
      chunkedLoading: true,
      maxClusterRadius: 60,
      iconCreateFunction: (cluster) => {
        const first = pointOf.get(cluster.getAllChildMarkers()[0]);
        return clusterIcon(first?.thumbnailUrl ?? '', cluster.getChildCount());
      },
    });
    group.on('clusterclick', (event) => {
      const cluster = (event as L.MarkerClusterMouseEvent).layer;
      const bounds = cluster.getBounds();
      const canSplit = map.getZoom() < map.getMaxZoom() && !bounds.getNorthEast().equals(bounds.getSouthWest());
      if (canSplit) {
        cluster.zoomToBounds({ padding: [40, 40] });
        return;
      }
      const clusterPoints = cluster.getAllChildMarkers().map((marker) => pointOf.get(marker)!).filter(Boolean);
      onOpenRef.current({ position: cluster.getLatLng(), points: clusterPoints });
    });

    const markers = points.map((point) => {
      const marker = L.marker([point.lat, point.lon], { icon: thumbnailIcon(point.thumbnailUrl), keyboard: false });
      pointOf.set(marker, point);
      marker.on('click', () => onOpenRef.current({ position: marker.getLatLng(), points: [point] }));
      return marker;
    });
    group.addLayers(markers);
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [map, points]);

  return null;
};

/** Fits the map to `bounds` whenever `fitKey` changes, i.e. when another library selection is shown. */
const FitBounds: React.FC<{ fitKey: string; bounds: L.LatLngBounds | null }> = ({ fitKey, bounds }) => {
  const map = useMap();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (fitted.current === fitKey) return;
    fitted.current = fitKey;
    if (bounds?.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
    else map.fitBounds(WORLD);
  }, [map, fitKey, bounds]);
  return null;
};

/** Gives the parent the Leaflet map, for flying to places and converting drop positions. */
const MapHandle: React.FC<{ onMap: (map: L.Map) => void }> = ({ onMap }) => {
  const map = useMap();
  useEffect(() => onMap(map), [map, onMap]);
  return null;
};

const ClickToPlace: React.FC<{ active: boolean; onPlace: (at: Geotag) => void }> = ({ active, onPlace }) => {
  useMapEvents({
    click: (event) => {
      if (active) onPlace({ lat: event.latlng.lat, lon: L.Util.wrapNum(event.latlng.lng, [-180, 180], true) });
    },
  });
  return null;
};

interface PendingPlacement {
  photoIds: number[];
  location: Geotag;
  /** How many of them already have a location */
  replacing: number;
}

export const PlacesMap: React.FC = () => {
  const {
    setCurrentView, selectedFolderId, selectedAlbumToken, selectedFilter, searchQuery, libraryVersion, bumpLibrary,
    selectedPhotos, selectPhotos, refreshSelectedPhotos, clearTray,
  } = usePalomaStore();
  const { t, i18n } = useTranslation();
  const { formatNumber } = useFormat();

  const [settings, setSettings] = useState<GeoSettings | null>(null);
  const [points, setPoints] = useState<GeoPoint[] | null>(null);
  const [places, setPlaces] = useState<GeoPlaces | null>(null);
  const [popup, setPopup] = useState<PhotosPopup | null>(null);
  const [placing, setPlacing] = useState(false);
  const [pending, setPending] = useState<PendingPlacement | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<GeoSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<GeoSearchResult | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const onMap = useCallback((map: L.Map) => { mapRef.current = map; }, []);

  const lang = i18n.language;
  const selection = { selectedFolderId, selectedAlbumToken, selectedFilter, searchQuery };
  const selectionKey = libraryQueryParams(selection, '').toString();
  const params = useMemo(() => libraryQueryParams(selection, currentLanguage()), [selectionKey, lang]);
  const geocoding = settings?.geocoding === true;

  useEffect(() => {
    fetchGeoSettings().then(setSettings).catch(setError);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchGeoPoints(params)
      .then((next) => { if (!cancelled) setPoints(next); })
      .catch((err) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, [params, libraryVersion]);

  // Places are polled while some photos still wait for their place name
  useEffect(() => {
    if (!geocoding) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      fetchPlaces(params)
        .then((next) => {
          if (cancelled) return;
          setPlaces(next);
          if (next.pending > 0) timer = setTimeout(load, PLACES_POLL_MS);
        })
        .catch((err) => { if (!cancelled) setError(err); });
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [geocoding, params, libraryVersion]);

  const pointsBounds = useMemo(
    () => (points && points.length > 0 ? L.latLngBounds(points.map((p) => [p.lat, p.lon] as L.LatLngTuple)) : null),
    [points],
  );

  /** Sets the location of photos, asking first when that replaces existing locations. */
  const requestPlacement = (photos: Photo[], location: Geotag) => {
    if (photos.length === 0) return;
    const placement = { photoIds: photos.map((p) => p.id), location, replacing: photos.filter((p) => p.latitude !== null).length };
    if (placement.replacing > 0) setPending(placement);
    else void place(placement);
  };

  const place = async ({ photoIds, location }: PendingPlacement) => {
    setPending(null);
    setPlacing(false);
    try {
      refreshSelectedPhotos(await setPhotosLocation(photoIds, location));
      setError(null);
      bumpLibrary();
    } catch (err) {
      setError(err);
    }
  };

  const geotaggedSelection = selectedPhotos.filter((p) => p.latitude !== null);
  const removeLocation = async () => {
    setConfirmRemove(false);
    try {
      await setPhotosLocation(geotaggedSelection.map((p) => p.id), null);
      setError(null);
      clearTray();
      bumpLibrary();
    } catch (err) {
      setError(err);
    }
  };

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!searchText.trim()) return;
    setSearching(true);
    try {
      setResults(await searchAddress(searchText.trim(), currentLanguage()));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setSearching(false);
    }
  };

  const showResult = (result: GeoSearchResult) => {
    setFound(result);
    mapRef.current?.flyToBounds(toLatLngBounds(result.bounds), { padding: [48, 48], maxZoom: 16 });
  };

  const addToSelection = async (point: GeoPoint) => {
    try {
      const res = await fetch(`/api/photos?${new URLSearchParams({ ids: String(point.id), lang: currentLanguage() })}`);
      const [photo] = res.ok ? await res.json() as Photo[] : [];
      if (photo) selectPhotos([photo]);
    } catch (err) {
      setError(err);
    }
  };

  const onDrop = (event: React.DragEvent) => {
    const id = Number(event.dataTransfer.getData(PHOTO_DRAG_TYPE));
    const map = mapRef.current;
    const photo = selectedPhotos.find((p) => p.id === id);
    if (!map || !photo) return;
    event.preventDefault();
    const at = map.mouseEventToLatLng(event.nativeEvent);
    requestPlacement([photo], { lat: at.lat, lon: L.Util.wrapNum(at.lng, [-180, 180], true) });
  };

  return (
    <div
      className="d-flex flex-column flex-grow-1 overflow-hidden bg-dark text-white"
      style={{ marginBottom: selectedPhotos.length > 0 ? '80px' : 0 }}
    >
      <div className="d-flex align-items-center flex-wrap gap-3 p-3 bg-secondary">
        <button className="btn btn-outline-light btn-lg-custom" onClick={() => setCurrentView('library')}>
          <ArrowLeft size={20} className="flip-rtl" />
          <span>{t('common.back')}</span>
        </button>
        <h4 className="fw-bold mb-0">{t('map.title')}</h4>
        {points && <span className="badge bg-primary fs-5">{t('map.found', { count: points.length })}</span>}

        <div className="d-flex align-items-center gap-2 ms-auto">
          <button
            className={`btn btn-lg-custom ${placing ? 'btn-warning text-dark' : 'btn-light'}`}
            disabled={selectedPhotos.length === 0}
            onClick={() => setPlacing(!placing)}
            title={selectedPhotos.length === 0 ? t('geo.selectPhotosFirst') : undefined}
          >
            <Crosshair size={20} />
            <span>{placing ? t('geo.cancelSetLocation') : t('geo.setLocation')}</span>
          </button>
          {geotaggedSelection.length > 0 && (
            <button className="btn btn-outline-light btn-lg-custom" onClick={() => setConfirmRemove(true)}>
              <MapPinOff size={20} />
              <span>{t('geo.removeLocation')}</span>
            </button>
          )}
        </div>
      </div>

      {error != null && (
        <Alert variant="danger" className="m-2 mb-0" dismissible onClose={() => setError(null)}>
          {describeError(error, t)}
        </Alert>
      )}
      {placing && <Alert variant="warning" className="m-2 mb-0 fs-5">{t('geo.clickToPlace', { count: selectedPhotos.length })}</Alert>}

      <div className="d-flex flex-grow-1 overflow-hidden">
        {geocoding && (
          <aside className="bg-white text-dark border-end p-3 d-flex flex-column gap-3" style={{ width: '300px', flexShrink: 0, overflowY: 'auto' }}>
            <form className="d-flex gap-2" onSubmit={search} role="search">
              <input
                type="search"
                className="form-control form-control-lg"
                placeholder={t('geo.searchPlaceholder')}
                aria-label={t('geo.searchPlaceholder')}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={searching} title={t('geo.search')}>
                <Search size={20} />
              </button>
            </form>

            {results !== null && (
              <div>
                <h6 className="text-uppercase text-muted fw-bold fs-6">{t('geo.results')}</h6>
                {results.length === 0 ? (
                  <p className="text-muted fst-italic mb-0">{t('geo.noResults')}</p>
                ) : (
                  <div className="list-group list-group-flush">
                    {results.map((result) => (
                      <button
                        key={`${result.lat},${result.lon},${result.name}`}
                        type="button"
                        className={`list-group-item list-group-item-action fs-6 ${found === result ? 'active' : ''}`}
                        onClick={() => showResult(result)}
                      >
                        <span dir="auto">{result.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <h6 className="text-uppercase text-muted fw-bold fs-6">{t('geo.places')}</h6>
              {places && places.places.length === 0 && places.pending === 0 && (
                <p className="text-muted fst-italic mb-0">{t('geo.noPlaces')}</p>
              )}
              <div className="list-group list-group-flush">
                {places?.places.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-2 fs-6"
                    onClick={() => mapRef.current?.fitBounds(toLatLngBounds(p.bounds), { padding: [48, 48], maxZoom: 15 })}
                  >
                    <span dir="auto">{p.name}</span>
                    <span className="badge bg-secondary">{formatNumber(p.count)}</span>
                  </button>
                ))}
              </div>
              {places && places.pending > 0 && (
                <p className="text-muted fst-italic mt-2 mb-0">{t('geo.resolving', { count: places.pending })}</p>
              )}
            </div>
          </aside>
        )}

        <div
          className={`flex-grow-1 position-relative ${placing ? 'map-placing' : ''}`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(PHOTO_DRAG_TYPE)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={onDrop}
        >
          {settings && (
            <MapContainer bounds={WORLD} style={{ height: '100%', width: '100%' }} worldCopyJump>
              <MapHandle onMap={onMap} />
              <TileLayer attribution={settings.tileAttribution} url={settings.tileUrl} />
              {points && <ClusterLayer points={points} onOpen={setPopup} />}
              {points && <FitBounds fitKey={selectionKey} bounds={pointsBounds} />}
              <ClickToPlace active={placing} onPlace={(at) => requestPlacement(selectedPhotos, at)} />

              {popup && (
                <Popup position={popup.position} eventHandlers={{ remove: () => setPopup(null) }} maxWidth={360}>
                  <div className="map-popup-thumbs">
                    {popup.points.map((point) => (
                      <button key={point.id} type="button" title={t('geo.addToSelection')} onClick={() => addToSelection(point)}>
                        <img src={point.thumbnailUrl} alt="" />
                      </button>
                    ))}
                  </div>
                  <div className="text-muted small mt-1">{t('geo.clickToSelect')}</div>
                </Popup>
              )}

              {found && (
                <Marker position={[found.lat, found.lon]} icon={FOUND_ICON}>
                  <Popup>
                    <div className="fw-semibold mb-2" dir="auto">{found.name}</div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={selectedPhotos.length === 0}
                      onClick={() => requestPlacement(selectedPhotos, { lat: found.lat, lon: found.lon })}
                    >
                      {t('geo.placeHere', { count: selectedPhotos.length })}
                    </button>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          )}

          {points && points.length === 0 && (
            <div className="map-empty-note text-dark">
              <div className="fw-bold fs-5">{t('geo.noGeotagged')}</div>
              <div>{t('geo.noGeotaggedHint')}</div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        show={pending !== null}
        title={t('geo.replaceTitle')}
        body={t('geo.replaceBody', { count: pending?.replacing ?? 0 })}
        confirmLabel={t('geo.replaceConfirm')}
        onConfirm={() => pending && place(pending)}
        onCancel={() => setPending(null)}
      />
      <ConfirmModal
        show={confirmRemove}
        title={t('geo.removeLocationTitle')}
        body={t('geo.removeLocationBody', { count: geotaggedSelection.length })}
        confirmLabel={t('geo.removeLocation')}
        variant="danger"
        onConfirm={removeLocation}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
};

const FOUND_ICON = L.divIcon({ className: 'map-found-marker', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12] });
