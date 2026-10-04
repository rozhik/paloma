import React, { useState, useEffect, useRef } from 'react';
import type { Photo, EditDAG } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useTranslation } from 'react-i18next';
import { Save, ArrowLeft, Sun, Contrast, Thermometer, Crop, RotateCw, Image as ImageIcon } from 'lucide-react';

interface EditorCanvasProps {
  photo: Photo;
  onSaveSuccess: () => void;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({ photo, onSaveSuccess }) => {
  const { setCurrentView, setActiveEditPhoto } = usePalomaStore();
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tuning, setTuning] = useState({
    fillLight: photo.edits?.tuning?.fillLight ?? 0,
    contrast: photo.edits?.tuning?.contrast ?? 0,
    temperature: photo.edits?.tuning?.temperature ?? 5500,
    straighten: photo.edits?.straighten ?? 0,
    sepia: photo.edits?.tuning?.sepia ?? false,
    bw: photo.edits?.tuning?.bw ?? false,
  });

  const [crop, setCrop] = useState<[number, number, number, number] | null>(photo.edits?.crop ?? null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `/api/raw/${photo.id}`;

    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (showOriginal) {
        ctx.drawImage(img, 0, 0);
        ctx.restore();
        return;
      }

      // Apply Straighten rotation around center
      if (tuning.straighten !== 0) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((tuning.straighten * Math.PI) / 180);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }

      // Draw base image
      ctx.drawImage(img, 0, 0);

      // Apply CSS-like filter transformations
      let filters = '';
      if (tuning.contrast !== 0) {
        filters += `contrast(${100 + tuning.contrast}%) `;
      }
      if (tuning.fillLight > 0) {
        filters += `brightness(${100 + tuning.fillLight * 0.5}%) `;
      }
      if (tuning.sepia) {
        filters += `sepia(100%) `;
      }
      if (tuning.bw) {
        filters += `grayscale(100%) `;
      }

      if (filters.trim().length > 0) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.filter = filters.trim();
          tempCtx.drawImage(canvas, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(tempCanvas, 0, 0);
        }
      }

      // Apply crop outline overlay if set
      if (crop) {
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 4;
        ctx.strokeRect(crop[0], crop[1], crop[2], crop[3]);
      }

      ctx.restore();
    };
  }, [photo, tuning, crop, showOriginal]);

  const handleSave = async () => {
    setIsSaving(true);
    const editInstructions: EditDAG = {
      crop: crop || undefined,
      straighten: tuning.straighten,
      tuning: {
        fillLight: tuning.fillLight,
        contrast: tuning.contrast,
        temperature: tuning.temperature,
        sepia: tuning.sepia,
        bw: tuning.bw,
      },
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch(`/api/photos/${photo.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editInstructions }),
      });

      if (res.ok) {
        onSaveSuccess();
        setActiveEditPhoto(null);
      }
    } catch (err) {
      console.error('Failed to save edits:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="d-flex h-100 w-100 bg-dark text-white overflow-hidden">
      {/* Main Canvas preview area */}
      <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center p-3 relative">
        <div className="position-absolute top-0 start-0 m-3 z-3">
          <button
            className="btn btn-outline-light btn-lg-custom"
            onClick={() => setActiveEditPhoto(null)}
          >
            <ArrowLeft size={20} className="flip-rtl" />
            <span>{t('editor.back')}</span>
          </button>
        </div>

        <div className="position-absolute top-0 end-0 m-3 z-3">
          <button
            className={`btn btn-lg-custom ${showOriginal ? 'btn-warning' : 'btn-outline-secondary'}`}
            onMouseDown={() => setShowOriginal(true)}
            onMouseUp={() => setShowOriginal(false)}
            onMouseLeave={() => setShowOriginal(false)}
          >
            <ImageIcon size={20} />
            <span>{t('editor.holdForOriginal')}</span>
          </button>
        </div>

        <div style={{ maxWidth: '90%', maxHeight: '85%', overflow: 'hidden' }}>
          <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
        </div>
      </div>

      {/* Right Control Toolbar */}
      <div className="bg-secondary text-white p-4 border-start border-secondary" style={{ width: '360px', overflowY: 'auto' }}>
        <h4 className="fw-bold mb-4 border-bottom pb-2">{t('editor.title')}</h4>

        {/* Tuning Controls */}
        <div className="mb-4">
          <label className="form-label fs-5 fw-semibold d-flex align-items-center gap-2">
            <Sun size={20} className="text-warning" />
            <span>{t('editor.fillLight', { value: tuning.fillLight })}</span>
          </label>
          <input
            type="range"
            className="form-range"
            min="0"
            max="100"
            value={tuning.fillLight}
            onChange={(e) => setTuning({ ...tuning, fillLight: Number(e.target.value) })}
          />
        </div>

        <div className="mb-4">
          <label className="form-label fs-5 fw-semibold d-flex align-items-center gap-2">
            <Contrast size={20} className="text-info" />
            <span>{t('editor.contrast', { value: tuning.contrast })}</span>
          </label>
          <input
            type="range"
            className="form-range"
            min="-100"
            max="100"
            value={tuning.contrast}
            onChange={(e) => setTuning({ ...tuning, contrast: Number(e.target.value) })}
          />
        </div>

        <div className="mb-4">
          <label className="form-label fs-5 fw-semibold d-flex align-items-center gap-2">
            <RotateCw size={20} className="text-success" />
            <span>{t('editor.straighten', { value: tuning.straighten })}</span>
          </label>
          <input
            type="range"
            className="form-range"
            min="-45"
            max="45"
            value={tuning.straighten}
            onChange={(e) => setTuning({ ...tuning, straighten: Number(e.target.value) })}
          />
        </div>

        {/* Color Presets */}
        <div className="mb-4 border-top pt-3">
          <h6 className="fw-bold mb-3 fs-5">{t('editor.effects')}</h6>
          <div className="d-flex gap-2 mb-2">
            <button
              className={`btn btn-lg flex-grow-1 ${tuning.bw ? 'btn-primary' : 'btn-outline-light'}`}
              onClick={() => setTuning({ ...tuning, bw: !tuning.bw, sepia: false })}
            >
              {t('editor.bw')}
            </button>
            <button
              className={`btn btn-lg flex-grow-1 ${tuning.sepia ? 'btn-primary' : 'btn-outline-light'}`}
              onClick={() => setTuning({ ...tuning, sepia: !tuning.sepia, bw: false })}
            >
              {t('editor.sepia')}
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="d-grid gap-2 border-top pt-4">
          <button className="btn btn-success btn-lg-custom py-3" onClick={handleSave} disabled={isSaving}>
            <Save size={24} />
            <span>{isSaving ? t('editor.saving') : t('editor.save')}</span>
          </button>
          <button className="btn btn-outline-light btn-lg-custom" onClick={() => setActiveEditPhoto(null)}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
