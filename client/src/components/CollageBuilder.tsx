import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useTranslation } from 'react-i18next';
import { Download, ArrowLeft, RefreshCw, LayoutGrid } from 'lucide-react';

export const CollageBuilder: React.FC = () => {
  const { selectedPhotos, setCurrentView } = usePalomaStore();
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 1000,
      height: 700,
      backgroundColor: '#1e293b',
    });

    setFabricCanvas(canvas);

    return () => {
      canvas.dispose();
    };
  }, []);

  const populateCollage = (mode: 'pile' | 'grid') => {
    if (!fabricCanvas) return;
    fabricCanvas.clear();
    fabricCanvas.setBackgroundColor('#1e293b', fabricCanvas.renderAll.bind(fabricCanvas));

    if (selectedPhotos.length === 0) return;

    if (mode === 'pile') {
      selectedPhotos.forEach((photo, index) => {
        fabric.Image.fromURL(`/api/raw/${photo.id}`, (img) => {
          img.scaleToWidth(300);
          img.set({
            left: 150 + (index % 3) * 220 + (Math.random() * 40 - 20),
            top: 100 + Math.floor(index / 3) * 200 + (Math.random() * 40 - 20),
            angle: Math.random() * 30 - 15,
            stroke: '#ffffff',
            strokeWidth: 8,
          });
          fabricCanvas.add(img);
        }, { crossOrigin: 'anonymous' });
      });
    } else {
      const cols = Math.ceil(Math.sqrt(selectedPhotos.length));
      const width = 1000 / cols;
      const height = 700 / cols;

      selectedPhotos.forEach((photo, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);

        fabric.Image.fromURL(`/api/raw/${photo.id}`, (img) => {
          img.scaleToWidth(width - 20);
          img.set({
            left: col * width + 10,
            top: row * height + 10,
            stroke: '#ffffff',
            strokeWidth: 4,
          });
          fabricCanvas.add(img);
        }, { crossOrigin: 'anonymous' });
      });
    }
  };

  useEffect(() => {
    if (fabricCanvas && selectedPhotos.length > 0) {
      populateCollage('pile');
    }
  }, [fabricCanvas, selectedPhotos]);

  const handleDownload = () => {
    if (!fabricCanvas) return;
    const dataURL = fabricCanvas.toDataURL({ format: 'png', quality: 1 });
    const link = document.createElement('a');
    link.download = 'paloma_collage.png';
    link.href = dataURL;
    link.click();
  };

  return (
    <div className="d-flex flex-column h-100 w-100 bg-dark text-white p-3">
      <div className="d-flex align-items-center justify-content-between mb-3 bg-secondary p-3 rounded">
        <div className="d-flex align-items-center gap-3">
          <button className="btn btn-outline-light btn-lg-custom" onClick={() => setCurrentView('library')}>
            <ArrowLeft size={20} className="flip-rtl" />
            <span>{t('common.back')}</span>
          </button>
          <h4 className="fw-bold mb-0">{t('collage.title')}</h4>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-outline-info btn-lg-custom" onClick={() => populateCollage('pile')}>
            <RefreshCw size={20} />
            <span>{t('collage.pile')}</span>
          </button>
          <button className="btn btn-outline-info btn-lg-custom" onClick={() => populateCollage('grid')}>
            <LayoutGrid size={20} />
            <span>{t('collage.grid')}</span>
          </button>
          <button className="btn btn-success btn-lg-custom ms-2" onClick={handleDownload}>
            <Download size={20} />
            <span>{t('collage.download')}</span>
          </button>
        </div>
      </div>

      <div className="flex-grow-1 d-flex align-items-center justify-content-center">
        <canvas ref={canvasRef} className="border border-secondary rounded shadow" />
      </div>
    </div>
  );
};
