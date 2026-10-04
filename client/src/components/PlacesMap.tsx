import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Photo } from '../../../shared/types.js';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { usePalomaStore } from '../store/usePalomaStore.js';

// Fix Leaflet marker icons issue in React
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export const PlacesMap: React.FC = () => {
  const { setCurrentView } = usePalomaStore();
  const { t } = useTranslation();
  const [geoPhotos, setGeoPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    fetch('/api/photos?limit=1000')
      .then((res) => res.json())
      .then((data: Photo[]) => {
        const filtered = data.filter((p) => p.latitude !== null && p.longitude !== null);
        setGeoPhotos(filtered);
      })
      .catch((err) => console.error(err));
  }, []);

  const center: [number, number] = geoPhotos.length > 0 && geoPhotos[0].latitude && geoPhotos[0].longitude
    ? [geoPhotos[0].latitude, geoPhotos[0].longitude]
    : [48.3794, 31.1656]; // Ukraine center default

  return (
    <div className="d-flex flex-column h-100 w-100 bg-dark text-white">
      <div className="d-flex align-items-center justify-content-between p-3 bg-secondary">
        <div className="d-flex align-items-center gap-3">
          <button className="btn btn-outline-light btn-lg-custom" onClick={() => setCurrentView('library')}>
            <ArrowLeft size={20} className="flip-rtl" />
            <span>{t('common.back')}</span>
          </button>
          <h4 className="fw-bold mb-0">{t('map.title')}</h4>
        </div>
        <span className="badge bg-primary fs-5">{t('map.found', { count: geoPhotos.length })}</span>
      </div>

      <div className="flex-grow-1" style={{ height: 'calc(100vh - 80px)' }}>
        <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {geoPhotos.map((photo) => (
            <Marker key={photo.id} position={[photo.latitude!, photo.longitude!]} icon={customIcon}>
              <Popup>
                <div className="text-center">
                  <img src={photo.thumbnailUrl} alt={photo.filename} style={{ width: '120px', borderRadius: '4px' }} />
                  <p className="fw-bold mt-2 mb-0">{photo.filename}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};
