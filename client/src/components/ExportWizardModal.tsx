import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { Trans, useTranslation } from 'react-i18next';
import { Download, CheckCircle2 } from 'lucide-react';

interface ExportWizardModalProps {
  show: boolean;
  onHide: () => void;
}

export const ExportWizardModal: React.FC<ExportWizardModalProps> = ({ show, onHide }) => {
  const { selectedPhotos } = usePalomaStore();
  const { t } = useTranslation();
  const [outputDir, setOutputDir] = useState('Paloma_Export');
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
      <Modal.Header closeButton className="bg-primary">
        <Modal.Title className="fs-3 fw-bold d-flex align-items-center gap-2">
          <Download size={28} />
          <span>{t('export.title')}</span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        {exportResult ? (
          <div className="text-center py-4">
            <CheckCircle2 size={64} className="text-success mb-3" />
            <h3 className="fw-bold">{t('export.done', { count: exportResult.count })}</h3>
            <p className="fs-5 text-muted">{t('export.savedTo')} <code>{outputDir}</code></p>
            <Button variant="primary" size="lg" className="mt-3" onClick={onHide}>
              {t('common.close')}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleExport}>
            <div className="mb-4">
              <label className="form-label fs-5 fw-semibold">{t('export.destination')}</label>
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
                <label className="form-label fs-5 fw-semibold">{t('export.quality', { value: quality })}</label>
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
                <label className="form-label fs-5 fw-semibold">{t('export.maxWidth')}</label>
                <select
                  className="form-select form-select-lg fs-5"
                  value={resizeWidth}
                  onChange={(e) => setResizeWidth(Number(e.target.value))}
                >
                  <option value={0}>{t('export.originalSize')}</option>
                  <option value={3840}>4K Ultra HD (3840px)</option>
                  <option value={1920}>Full HD (1920px)</option>
                  <option value={1280}>HD (1280px)</option>
                </select>
              </div>
            </div>

            <div className="alert alert-info fs-5">
              <Trans i18nKey="export.summary" count={selectedPhotos.length} components={{ b: <strong /> }} />
            </div>

            <div className="d-flex justify-content-end gap-2">
              <Button variant="outline-secondary" size="lg" onClick={onHide} disabled={loading}>
                {t('common.cancel')}
              </Button>
              <Button variant="success" size="lg" type="submit" disabled={loading}>
                {loading ? t('export.exporting') : t('export.start')}
              </Button>
            </div>
          </form>
        )}
      </Modal.Body>
    </Modal>
  );
};
