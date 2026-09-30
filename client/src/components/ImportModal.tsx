import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { FolderPlus, CheckCircle, AlertCircle } from 'lucide-react';

interface ImportModalProps {
  show: boolean;
  onHide: () => void;
  onSuccess: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ show, onHide, onSuccess }) => {
  const [folderPath, setFolderPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderPath.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/folders/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderPath.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Помилка сканування папки');
      }

      onSuccess();
      onHide();
      setFolderPath('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton className="bg-primary text-white">
        <Modal.Title className="fs-3 fw-bold d-flex align-items-center gap-2">
          <FolderPlus size={28} />
          <span>Імпорт нової папки світлин</span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <form onSubmit={handleScan}>
          <div className="mb-4">
            <label className="form-label fs-5 fw-semibold">
              Вкажіть повний шлях до папки з фотографіями на комп'ютері:
            </label>
            <input
              type="text"
              className="form-control form-control-lg fs-5"
              placeholder="Наприклад: /Users/username/Pictures/2024_Vacation"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <div className="form-text fs-6 text-muted mt-2">
              Paloma проіндексує світлини, зчитає EXIF метадані та створить мініатюри. Файли фотографій залишаться у безпеці.
            </div>
          </div>

          {error && (
            <div className="alert alert-danger d-flex align-items-center gap-2 fs-5">
              <AlertCircle size={24} />
              <span>{error}</span>
            </div>
          )}

          <div className="d-flex justify-content-end gap-2">
            <Button variant="outline-secondary" size="lg" onClick={onHide} disabled={loading}>
              Скасувати
            </Button>
            <Button variant="success" size="lg" type="submit" disabled={loading || !folderPath.trim()}>
              {loading ? 'Сканування...' : 'Розпочати імпорт'}
            </Button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
};
