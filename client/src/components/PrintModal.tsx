import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { Printer } from 'lucide-react';

interface PrintModalProps {
  show: boolean;
  onHide: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({ show, onHide }) => {
  const { selectedPhotos } = usePalomaStore();
  const [layout, setLayout] = useState<'single' | 'grid2x2' | 'photo10x15'>('single');

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal show={show} onHide={onHide} centered size="xl">
      <Modal.Header closeButton className="bg-info text-white">
        <Modal.Title className="fs-3 fw-bold d-flex align-items-center gap-2">
          <Printer size={28} />
          <span>Модуль друку світлин</span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <div className="row mb-4">
          <div className="col-md-4">
            <h5 className="fw-bold mb-3">Макет аркуша:</h5>
            <div className="d-grid gap-2">
              <button
                className={`btn btn-lg ${layout === 'single' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setLayout('single')}
              >
                📄 1 фото на сторінку (A4)
              </button>
              <button
                className={`btn btn-lg ${layout === 'grid2x2' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setLayout('grid2x2')}
              >
                🖼️ Сітка 2x2 (4 фото на А4)
              </button>
              <button
                className={`btn btn-lg ${layout === 'photo10x15' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setLayout('photo10x15')}
              >
                📸 Фотобумага (10x15 см)
              </button>
            </div>

            <div className="mt-4 pt-3 border-top">
              <Button variant="success" size="lg" className="w-100 py-3 fs-4" onClick={handlePrint}>
                🖨️ Друкувати зараз
              </Button>
            </div>
          </div>

          <div className="col-md-8">
            <div className="bg-light p-3 border rounded shadow-sm text-center" style={{ minHeight: '400px' }}>
              <h6 className="text-muted mb-3">Попередній перегляд друку ({selectedPhotos.length} фото)</h6>
              <div className="d-flex flex-wrap justify-content-center gap-2">
                {selectedPhotos.map((p) => (
                  <img
                    key={p.id}
                    src={p.previewUrl}
                    alt={p.filename}
                    style={{
                      width: layout === 'single' ? '90%' : layout === 'grid2x2' ? '45%' : '200px',
                      height: 'auto',
                      maxHeight: '350px',
                      objectFit: 'contain',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
};
