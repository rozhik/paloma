import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { Download, CheckCircle2 } from 'lucide-react';

interface ExportWizardModalProps {
  show: boolean;
  onHide: () => void;
}

export const ExportWizardModal: React.FC<ExportWizardModalProps> = ({ show, onHide }) => {
  const { selectedPhotos } = usePalomaStore();
  const [outputDir, setOutputDir] = useState('/Users/orozhyk/Pictures/Paloma_Export');
  const [quality, setQuality] = useState(85);
  const [resizeWidth, setResizeWidth] = useState(1920);
  const [loading, setLoading] = useState(false);
  const [exportResult, setExportResult] = useState<{ count: number } | null>(null);

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setExportResult(null);

    try {
      const photoIds = selectedPhotos.map((p) => p.id);
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoIds,
          outputDir,
          quality,
          resizeWidth,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setExportResult({ count: data.count });
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton className="bg-primary text-white">
        <Modal.Title className="fs-3 fw-bold d-flex align-items-center gap-2">
          <Download size={28} />
          <span>Майстер пакетного експорту фотографій</span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        {exportResult ? (
          <div className="text-center py-4">
            <CheckCircle2 size={64} className="text-success mb-3" />
            <h3 className="fw-bold">Успішно експортовано {exportResult.count} світлин!</h3>
            <p className="fs-5 text-muted">Файли збережено у папці: <code>{outputDir}</code></p>
            <Button variant="primary" size="lg" className="mt-3" onClick={onHide}>
              Закрити
            </Button>
          </div>
        ) : (
          <form onSubmit={handleExport}>
            <div className="mb-4">
              <label className="form-label fs-5 fw-semibold">Папка призначення для збереження:</label>
              <input
                type="text"
                className="form-control form-control-lg fs-5"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                required
              />
            </div>

            <div className="row mb-4">
              <div className="col-md-6">
                <label className="form-label fs-5 fw-semibold">Якість JPEG ({quality}%):</label>
                <input
                  type="range"
                  className="form-range"
                  min="50"
                  max="100"
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label fs-5 fw-semibold">Максимальна ширина (px):</label>
                <select
                  className="form-select form-select-lg fs-5"
                  value={resizeWidth}
                  onChange={(e) => setResizeWidth(Number(e.target.value))}
                >
                  <option value={0}>Оригінальний розмір</option>
                  <option value={3840}>4K Ultra HD (3840px)</option>
                  <option value={1920}>Full HD (1920px)</option>
                  <option value={1280}>HD (1280px)</option>
                </select>
              </div>
            </div>

            <div className="alert alert-info fs-5">
              Буде експортовано <strong>{selectedPhotos.length}</strong> обраних світлин з запеченими правок.
            </div>

            <div className="d-flex justify-content-end gap-2">
              <Button variant="outline-secondary" size="lg" onClick={onHide} disabled={loading}>
                Скасувати
              </Button>
              <Button variant="success" size="lg" type="submit" disabled={loading}>
                {loading ? 'Експортування...' : 'Розпочати експорт'}
              </Button>
            </div>
          </form>
        )}
      </Modal.Body>
    </Modal>
  );
};
