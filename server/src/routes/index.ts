import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { folders, photos, edits, people, faceAnnotations, tags, photoTags } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { ThumbnailService } from '../services/ThumbnailService.js';
import { listFolders, listPhotos, setPhotosLocation, updatePhoto } from '../services/photoApi.js';
import {
  addAlbumPhotos, createAlbumFromPhotos, deleteAlbumEverywhere, editAlbumProperties, listAlbums, removeAlbumPhotos,
} from '../services/albumApi.js';
import { getGeoSettings, listGeoPoints, listPlaces, searchPlaces } from '../services/geoApi.js';
import { MetadataService } from '../services/MetadataService.js';
import { apiError } from '../services/apiError.js';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const router = Router();

// --- Folders API ---
router.get('/folders', (req, res) => {
  res.json(listFolders());
});

// --- Photos API ---
router.get('/photos', (req, res) => {
  res.json(listPhotos(req.query));
});

router.post('/photos/location', (req, res) => {
  const result = setPhotosLocation(req.body);
  res.status(result.status).json(result.body);
});

router.patch('/photos/:id', (req, res) => {
  const result = updatePhoto(Number(req.params.id), req.body);
  res.status(result.status).json(result.body);
});

// Shortcut kept for the client's star toggle
router.patch('/photos/:id/star', (req, res) => {
  const result = updatePhoto(Number(req.params.id), { isStarred: req.body?.isStarred });
  res.status(result.status).json(result.body);
});

// --- Edits API ---
router.post('/photos/:id/edit', (req, res) => {
  const photoId = Number(req.params.id);
  const { editInstructions } = req.body; // EditDAG object

  const photo = db.select().from(photos).where(eq(photos.id, photoId)).get();
  if (!photo) return res.status(404).json(apiError('photo_not_found', 'Photo not found'));

  const existingEdit = db.select().from(edits).where(eq(edits.photoId, photoId)).get();

  const jsonStr = JSON.stringify(editInstructions);
  if (existingEdit) {
    db.update(edits)
      .set({ editInstructionsJson: jsonStr, updatedAt: new Date().toISOString() })
      .where(eq(edits.photoId, photoId))
      .run();
  } else {
    db.insert(edits).values({
      photoId,
      editInstructionsJson: jsonStr,
      updatedAt: new Date().toISOString(),
    }).run();
  }

  // Backup original to .paloma/originals/ if not already backed up
  const folder = db.select().from(folders).where(eq(folders.id, photo.folderId)).get();
  if (folder) {
    const originalsDir = path.join(folder.path, '.paloma', 'originals');
    if (!fs.existsSync(originalsDir)) {
      fs.mkdirSync(originalsDir, { recursive: true });
    }
    const origBackup = path.join(originalsDir, photo.filename);
    const srcFile = path.join(folder.path, photo.filename);
    if (!fs.existsSync(origBackup) && fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, origBackup);
    }
  }

  res.json({ success: true, edits: editInstructions });
});

// --- Cache & File Media Endpoints ---
router.get('/cache/thumbnail/:fileHash', (req, res) => {
  const thumbPath = ThumbnailService.getThumbnailPath(req.params.fileHash, 'thumb');
  if (fs.existsSync(thumbPath)) {
    res.setHeader('Content-Type', 'image/webp');
    return res.sendFile(thumbPath);
  }
  res.status(404).json(apiError('file_not_found', 'Thumbnail not found'));
});

router.get('/cache/preview/:fileHash', (req, res) => {
  const previewPath = ThumbnailService.getThumbnailPath(req.params.fileHash, 'preview');
  if (fs.existsSync(previewPath)) {
    res.setHeader('Content-Type', 'image/webp');
    return res.sendFile(previewPath);
  }
  res.status(404).json(apiError('file_not_found', 'Preview not found'));
});

router.get('/raw/:photoId', (req, res) => {
  const photo = db.select().from(photos).where(eq(photos.id, Number(req.params.photoId))).get();
  if (!photo) return res.status(404).json(apiError('photo_not_found', 'Photo not found'));

  const folder = db.select().from(folders).where(eq(folders.id, photo.folderId)).get();
  if (!folder) return res.status(404).json(apiError('file_not_found', 'Folder not found'));

  const fullPath = path.join(folder.path, photo.filename);
  if (fs.existsSync(fullPath)) {
    return res.sendFile(fullPath);
  }
  res.status(404).json(apiError('file_not_found', 'File missing'));
});

// --- Export API ---
router.post('/export', async (req, res) => {
  const { photoIds, outputDir, quality = 85, resizeWidth, watermarkText } = req.body;

  if (!photoIds || !Array.isArray(photoIds) || !outputDir) {
    return res.status(400).json(apiError('export_params_required', 'photoIds array and outputDir are required'));
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const selectedPhotos = db.select({
    photo: photos,
    folder: folders,
    edit: edits,
  })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .leftJoin(edits, eq(photos.id, edits.photoId))
    .where(inArray(photos.id, photoIds))
    .all();

  const exportedFiles: string[] = [];

  for (const { photo, folder, edit } of selectedPhotos) {
    const srcPath = path.join(folder.path, photo.filename);
    const destPath = path.join(outputDir, `exported_${photo.filename}`);

    let pipeline = sharp(srcPath, { failOnError: false }).rotate();

    if (edit) {
      const editDAG = JSON.parse(edit.editInstructionsJson);
      if (editDAG.crop) {
        const [x, y, w, h] = editDAG.crop;
        pipeline = pipeline.extract({ left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h) });
      }
      if (editDAG.straighten) {
        pipeline = pipeline.rotate(editDAG.straighten);
      }
      if (editDAG.tuning) {
        if (editDAG.tuning.contrast) {
          pipeline = pipeline.linear(1 + editDAG.tuning.contrast / 100, 0);
        }
        if (editDAG.tuning.bw) {
          pipeline = pipeline.grayscale();
        }
      }
    }

    if (resizeWidth && Number(resizeWidth) > 0) {
      pipeline = pipeline.resize({ width: Number(resizeWidth), withoutEnlargement: true });
    }

    await pipeline.jpeg({ quality: Number(quality) }).toFile(destPath);
    exportedFiles.push(destPath);
  }

  res.json({ success: true, count: exportedFiles.length, exportedFiles });
});

// --- Movie Maker API ---
router.post('/creation/movie', async (req, res) => {
  const { photoIds, durationPerSlide = 3, outputFilename = 'paloma_slideshow.mp4' } = req.body;

  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return res.status(400).json(apiError('photo_ids_required', 'At least one photoId is required'));
  }

  const selectedPhotos = db.select({
    photo: photos,
    folder: folders,
  })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(inArray(photos.id, photoIds))
    .all();

  const tmpDir = path.join(process.cwd(), '.paloma_data', 'tmp_movie');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const tempFiles: string[] = [];
  for (let i = 0; i < selectedPhotos.length; i++) {
    const { photo, folder } = selectedPhotos[i];
    const srcPath = path.join(folder.path, photo.filename);
    const tmpFrame = path.join(tmpDir, `frame_${String(i).padStart(4, '0')}.jpg`);
    await sharp(srcPath).resize(1920, 1080, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } }).jpeg().toFile(tmpFrame);
    tempFiles.push(tmpFrame);
  }

  const outputMoviePath = path.join(process.cwd(), '.paloma_data', outputFilename);

  ffmpeg()
    .input(path.join(tmpDir, 'frame_%04d.jpg'))
    .inputOptions([`-loop 1`, `-framerate 1/${durationPerSlide}`])
    .outputOptions(['-c:v libx264', '-pix_fmt yuv420p', `-t ${selectedPhotos.length * durationPerSlide}`])
    .output(outputMoviePath)
    .on('end', () => {
      res.json({ success: true, moviePath: outputMoviePath });
    })
    .on('error', (err) => {
      console.error('Failed to make a movie:', err);
      res.status(500).json(apiError('internal', err.message, { message: err.message }));
    })
    .run();
});

// --- People & Face Recognition API ---
router.get('/people', (req, res) => {
  const allPeople = db.select().from(people).all();
  res.json(allPeople);
});

router.post('/people', (req, res) => {
  const { name } = req.body;
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json(apiError('person_name_required', 'Name is required'));
  }

  const inserted = db.insert(people).values({ name }).returning().get();
  res.json(inserted);
});

router.post('/faces/annotate', (req, res) => {
  const { photoId, personId, boundingBox, descriptorVector, isConfirmed } = req.body;

  const inserted = db.insert(faceAnnotations).values({
    photoId,
    personId,
    boundingBox: JSON.stringify(boundingBox),
    descriptorVector: descriptorVector ? JSON.stringify(descriptorVector) : null,
    isConfirmed: Boolean(isConfirmed),
  }).returning().get();

  res.json(inserted);
});

// --- Geo API ---
router.get('/geo/settings', (req, res) => {
  res.json(getGeoSettings());
});

router.get('/geo/points', (req, res) => {
  res.json(listGeoPoints(req.query));
});

router.get('/geo/places', (req, res) => {
  const result = listPlaces(req.query);
  res.status(result.status).json(result.body);
});

router.get('/geo/search', async (req, res, next) => {
  try {
    const result = await searchPlaces(req.query.q, req.query.lang);
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

// --- Albums API ---
router.get('/albums', (req, res) => {
  res.json(listAlbums());
});

router.post('/albums', (req, res) => {
  const result = createAlbumFromPhotos(req.body);
  res.status(result.status).json(result.body);
});

router.patch('/albums/:token', (req, res) => {
  const result = editAlbumProperties(req.params.token, req.body);
  res.status(result.status).json(result.body);
});

router.delete('/albums/:token', (req, res) => {
  const result = deleteAlbumEverywhere(req.params.token);
  res.status(result.status).json(result.body);
});

router.post('/albums/:token/photos', (req, res) => {
  const result = addAlbumPhotos(req.params.token, req.body);
  res.status(result.status).json(result.body);
});

router.delete('/albums/:token/photos', (req, res) => {
  const result = removeAlbumPhotos(req.params.token, req.body);
  res.status(result.status).json(result.body);
});

export default router;
