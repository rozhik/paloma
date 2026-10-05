import { Router, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { folders, photos, edits, people, faceAnnotations, tags, photoTags } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { ThumbnailService } from '../services/ThumbnailService.js';
import { getEdits, listFolders, listPhotos, saveEdits, setPhotosLocation, updatePhoto } from '../services/photoApi.js';
import {
  addAlbumPhotos, createAlbumFromPhotos, deleteAlbumEverywhere, editAlbumProperties, listAlbums, removeAlbumPhotos,
} from '../services/albumApi.js';
import { getGeoSettings, listGeoPoints, listPlaces, searchPlaces } from '../services/geoApi.js';
import { MetadataService } from '../services/MetadataService.js';
import { filterIcon, listPlugins, switchPlugin } from '../services/pluginApi.js';
import { photoImage, renderPreview, type ImageResult } from '../services/renderApi.js';
import { RenderService } from '../services/RenderService.js';
import { libraryLookup } from '../services/libraryImages.js';
import { parseEditsJson } from '../services/photoImages.js';
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
router.get('/photos/:id/edits', (req, res) => {
  const result = getEdits(Number(req.params.id));
  res.status(result.status).json(result.body);
});

router.put('/photos/:id/edits', (req, res) => {
  const result = saveEdits(Number(req.params.id), req.body);
  res.status(result.status).json(result.body);
});

function sendImage(res: Response, result: ImageResult): void {
  if (result.status !== 200) {
    res.status(result.status).json(result.body);
  } else if (result.kind === 'buffer') {
    res.setHeader('Content-Type', result.type);
    res.setHeader('Cache-Control', 'no-store');
    if (result.fullSize) {
      res.setHeader('X-Paloma-Full-Width', String(result.fullSize.width));
      res.setHeader('X-Paloma-Full-Height', String(result.fullSize.height));
    }
    res.send(result.image);
  } else {
    // The URL carries the render key, so a changed look always gets a new URL
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(result.file);
  }
}

router.post('/photos/:id/preview', async (req, res, next) => {
  try {
    sendImage(res, await renderPreview(Number(req.params.id), req.body));
  } catch (err) {
    next(err);
  }
});

router.get('/photos/:id/:size(thumbnail|preview)', async (req, res, next) => {
  try {
    sendImage(res, await photoImage(Number(req.params.id), req.params.size === 'thumbnail' ? 'thumb' : 'preview'));
  } catch (err) {
    next(err);
  }
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

    // Full size through the photo's edits, before any resizing chosen for the export
    let pipeline = await RenderService.render(srcPath, parseEditsJson(edit?.editInstructionsJson) ?? [], {
      lookup: libraryLookup,
      label: srcPath,
    });

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

// --- Plugins API ---
router.get('/plugins', async (req, res, next) => {
  try {
    res.json(await listPlugins(req.query.lang));
  } catch (err) {
    next(err);
  }
});

router.get('/plugins/:id/filters/:name/icon', async (req, res, next) => {
  try {
    const result = await filterIcon(req.params.id, req.params.name);
    if (result.status !== 200) return res.status(result.status).json(result.body);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // The URL carries the plugin version; a day is enough for an edited icon to show up without a version bump
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(result.file);
  } catch (err) {
    next(err);
  }
});

router.patch('/plugins/:id', async (req, res, next) => {
  try {
    const result = await switchPlugin(req.params.id, req.body, req.query.lang);
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

export default router;
