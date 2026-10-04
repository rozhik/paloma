import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { Trans, useTranslation } from 'react-i18next';
import { Film, CheckCircle2 } from 'lucide-react';

interface MovieMakerModalProps {
  show: boolean;
  onHide: () => void;
}

export const MovieMakerModal: React.FC<MovieMakerModalProps> = ({ show, onHide }) => {
  const { selectedPhotos } = usePalomaStore();
  const { t } = useTranslation();
  const [durationPerSlide, setDurationPerSlide] = useState(3);
  const [loading, setLoading] = useState(false);
  const [moviePath, setMoviePath] = useState<string | null>(null);

  const handleGenerateMovie = async () => {
    setLoading(true);
    setMoviePath(null);

    try {
      const res = await fetch('/api/creation/movie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoIds: selectedPhotos.map((p) => p.id),
          durationPerSlide,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMoviePath(data.moviePath);
      }
    } catch (err) {
      console.error('Movie generation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton className="bg-warning text-dark">
        <Modal.Title className="fs-3 fw-bold d-flex align-items-center gap-2">
          <Film size={28} />
          <span>{t('movie.title')}</span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        {moviePath ? (
          <div className="text-center py-4">
            <CheckCircle2 size={64} className="text-success mb-3" />
            <h3 className="fw-bold">{t('movie.done')}</h3>
            <p className="fs-5 text-muted">{t('movie.path')} <code>{moviePath}</code></p>
            <Button variant="primary" size="lg" className="mt-3" onClick={onHide}>
              {t('common.close')}
            </Button>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <label className="form-label fs-5 fw-semibold">{t('movie.duration', { value: durationPerSlide })}</label>
              <input
                type="range"
                className="form-range"
                min="1"
                max="10"
                value={durationPerSlide}
                onChange={(e) => setDurationPerSlide(Number(e.target.value))}
              />
            </div>

            <div className="alert alert-warning fs-5">
              <Trans i18nKey="movie.summary" count={selectedPhotos.length} components={{ b: <strong /> }} />
            </div>

            <div className="d-flex justify-content-end gap-2">
              <Button variant="outline-secondary" size="lg" onClick={onHide} disabled={loading}>
                {t('common.cancel')}
              </Button>
              <Button variant="warning" size="lg" className="text-dark fw-bold" onClick={handleGenerateMovie} disabled={loading}>
                {loading ? t('movie.generating') : t('movie.create')}
              </Button>
            </div>
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
};
