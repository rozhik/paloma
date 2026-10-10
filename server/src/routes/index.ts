import { Router, type NextFunction, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { all, BATCH_SIZE, chunked, get } from '../db/query.js';
import { folders, photos, edits } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { ThumbnailService } from '../services/ThumbnailService.js';
import { changePhotosKeywords, listFolders, listPhotos, saveEdits, setPhotosLocation, updatePhoto } from '../services/photoApi.js';
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
import { invalidDateFilter } from '../services/photoFilters.js';
import { listTags } from '../services/tagApi.js';
import { listMemories } from '../services/memories.js';
import { photoStats } from '../services/photoStats.js';
import { getPhotoInfo } from '../services/photoInfo.js';
import { personAvatar, photoFace, photoFaceSource } from '../services/faceImages.js';
import { assignFaces, dismissFaces, pendingPhotos, saveDetectedFaces, similarFaces, unassignedFaces } from '../services/faceDetectionApi.js';
import {
  addPersonToPhoto, createPerson, deletePerson, getPerson, getPhotoPeople, listPeople, listPersonFaces, removePersonFromPhoto,
  updatePerson,
} from '../services/peopleApi.js';
import { movieFilename, resolveInside } from '../services/outputPaths.js';
import { config } from '../config.js';
import { asyncRoute, sendFileOr404 } from './asyncRoute.js';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const router = Router();

/** Sends an API result: its status with its body. */
const send = (res: Response, result: { status: number; body: unknown }) => res.status(result.status).json(result.body);

// --- Folders API ---
router.get('/folders', asyncRoute(async (req, res) => {
  res.json(await listFolders());
}));

// --- Photos API ---
router.get('/photos', asyncRoute(async (req, res) => {
  const field = invalidDateFilter(req.query);
  if (field) return res.status(400).json(apiError('invalid_date', `${field} must be a YYYY-MM-DD date`, { field }));
  res.json(await listPhotos(req.query));
}));

router.get('/photos/stats', asyncRoute(async (req, res) => {
  const field = invalidDateFilter(req.query);
  if (field) return res.status(400).json(apiError('invalid_date', `${field} must be a YYYY-MM-DD date`, { field }));
  res.json(await photoStats(req.query));
}));

router.post('/photos/location', asyncRoute(async (req, res) => {
  send(res, await setPhotosLocation(req.body));
}));

router.post('/photos/keywords', asyncRoute(async (req, res) => {
  send(res, await changePhotosKeywords(req.body));
}));

router.get('/photos/:id/info', asyncRoute(async (req, res) => {
  send(res, await getPhotoInfo(Number(req.params.id), req.query.lang));
}));

// --- Tags API ---
router.get('/tags', asyncRoute(async (req, res) => {
  res.json(await listTags());
}));

router.patch('/photos/:id', asyncRoute(async (req, res) => {
  send(res, await updatePhoto(Number(req.params.id), req.body));
}));

// Shortcut kept for the client's star toggle
router.patch('/photos/:id/star', asyncRoute(async (req, res) => {
  send(res, await updatePhoto(Number(req.params.id), { isStarred: req.body?.isStarred }));
}));

// --- Edits API ---
router.put('/photos/:id/edits', asyncRoute(async (req, res) => {
  send(res, await saveEdits(Number(req.params.id), req.body));
}));

function sendImage(res: Response, next: NextFunction, result: ImageResult): void {
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
    res.setHeader('Content-Type', result.type ?? 'image/webp');
    res.setHeader('Cache-Control', result.cacheControl ?? 'public, max-age=31536000, immutable');
    sendFileOr404(res, next, result.file, 'file_not_found', 'Image not found');
  }
}

router.post('/photos/:id/preview', asyncRoute(async (req, res, next) => {
  sendImage(res, next, await renderPreview(Number(req.params.id), req.body));
}));

router.get('/photos/:id/:size(thumbnail|preview)', asyncRoute(async (req, res, next) => {
  sendImage(res, next, await photoImage(Number(req.params.id), req.params.size === 'thumbnail' ? 'thumb' : 'preview'));
}));

// --- Cache & File Media Endpoints ---
router.get('/cache/thumbnail/:fileHash', (req, res, next) => {
  res.setHeader('Content-Type', 'image/webp');
  sendFileOr404(res, next, ThumbnailService.getThumbnailPath(req.params.fileHash, 'thumb'), 'file_not_found', 'Thumbnail not found');
});

router.get('/cache/preview/:fileHash', (req, res, next) => {
  res.setHeader('Content-Type', 'image/webp');
  sendFileOr404(res, next, ThumbnailService.getThumbnailPath(req.params.fileHash, 'preview'), 'file_not_found', 'Preview not found');
});

router.get('/raw/:photoId', asyncRoute(async (req, res, next) => {
  const photo = await get(db.select().from(photos).where(eq(photos.id, Number(req.params.photoId))));
  if (!photo) return res.status(404).json(apiError('photo_not_found', 'Photo not found'));

  const folder = await get(db.select().from(folders).where(eq(folders.id, photo.folderId)));
  if (!folder) return res.status(404).json(apiError('file_not_found', 'Folder not found'));

  sendFileOr404(res, next, path.join(folder.path, photo.filename), 'file_not_found', 'File missing');
}));

// --- Export API ---
router.post('/export', asyncRoute(async (req, res) => {
  const { photoIds, outputDir, quality = 85, resizeWidth } = req.body ?? {};

  if (!photoIds || !Array.isArray(photoIds) || !outputDir) {
    return res.status(400).json(apiError('export_params_required', 'photoIds array and outputDir are required'));
  }

  // Exports stay inside the export folder: the destination is relative to it, never an arbitrary path
  const destination = typeof outputDir === 'string' ? resolveInside(config.exportDir, outputDir) : null;
  if (destination === null) {
    return res.status(400).json(apiError('invalid_field', 'outputDir must be a folder inside the export folder', { field: 'outputDir' }));
  }
  await fs.promises.mkdir(destination, { recursive: true });

  const selectedPhotos = await chunked(photoIds, BATCH_SIZE, (ids) => all(db.select({
    photo: photos,
    folder: folders,
    edit: edits,
  })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .leftJoin(edits, eq(photos.id, edits.photoId))
    .where(inArray(photos.id, ids))));

  const exportedFiles: string[] = [];

  for (const { photo, folder, edit } of selectedPhotos) {
    const srcPath = path.join(folder.path, photo.filename);
    const destPath = path.join(destination, `exported_${photo.filename}`);

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
}));

// --- Movie Maker API ---
router.post('/creation/movie', asyncRoute(async (req, res) => {
  const { photoIds, durationPerSlide = 3, outputFilename } = req.body ?? {};

  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return res.status(400).json(apiError('photo_ids_required', 'At least one photoId is required'));
  }

  const selectedPhotos = await chunked(photoIds, BATCH_SIZE, (ids) => all(db.select({
    photo: photos,
    folder: folders,
  })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(inArray(photos.id, ids))));

  await fs.promises.mkdir(config.exportDir, { recursive: true });
  // The duration goes into ffmpeg's options, so it must be a plain number
  const slideSeconds = Number(durationPerSlide);
  if (!Number.isFinite(slideSeconds) || slideSeconds <= 0 || slideSeconds > 60) {
    return res.status(400).json(apiError('invalid_field', 'durationPerSlide must be a number from 0 to 60', { field: 'durationPerSlide' }));
  }

  const tmpDir = path.join(config.dataDir, 'tmp_movie');
  await fs.promises.mkdir(tmpDir, { recursive: true });

  const tempFiles: string[] = [];
  for (let i = 0; i < selectedPhotos.length; i++) {
    const { photo, folder } = selectedPhotos[i];
    const srcPath = path.join(folder.path, photo.filename);
    const tmpFrame = path.join(tmpDir, `frame_${String(i).padStart(4, '0')}.jpg`);
    await sharp(srcPath).resize(1920, 1080, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } }).jpeg().toFile(tmpFrame);
    tempFiles.push(tmpFrame);
  }

  const outputMoviePath = path.join(config.exportDir, movieFilename(outputFilename));

  ffmpeg()
    .input(path.join(tmpDir, 'frame_%04d.jpg'))
    .inputOptions([`-loop 1`, `-framerate 1/${slideSeconds}`])
    .outputOptions(['-c:v libx264', '-pix_fmt yuv420p', `-t ${selectedPhotos.length * slideSeconds}`])
    .output(outputMoviePath)
    .on('end', () => {
      res.json({ success: true, moviePath: outputMoviePath });
    })
    .on('error', (err) => {
      console.error('Failed to make a movie:', err);
      res.status(500).json(apiError('internal', err.message, { message: err.message }));
    })
    .run(); // ffmpeg, not a query
}));

// --- People API ---
router.get('/people', asyncRoute(async (req, res) => {
  res.json(await listPeople());
}));

router.post('/people', asyncRoute(async (req, res) => {
  send(res, await createPerson(req.body));
}));

router.get('/people/:id', asyncRoute(async (req, res) => {
  send(res, await getPerson(req.params.id));
}));

router.patch('/people/:id', asyncRoute(async (req, res) => {
  send(res, await updatePerson(req.params.id, req.body));
}));

router.delete('/people/:id', asyncRoute(async (req, res) => {
  send(res, await deletePerson(req.params.id));
}));

router.get('/people/:id/avatar', asyncRoute(async (req, res, next) => {
  sendImage(res, next, await personAvatar(req.params.id));
}));

router.get('/photos/:id/face', asyncRoute(async (req, res, next) => {
  sendImage(res, next, await photoFace(Number(req.params.id), req.query));
}));

router.get('/photos/:id/face-source', asyncRoute(async (req, res, next) => {
  sendImage(res, next, await photoFaceSource(Number(req.params.id)));
}));

router.get('/people/:id/faces', asyncRoute(async (req, res) => {
  send(res, await listPersonFaces(req.params.id));
}));

router.get('/people/:id/similar', asyncRoute(async (req, res) => {
  send(res, await similarFaces(req.params.id, req.query.limit));
}));

router.post('/people/:id/faces', asyncRoute(async (req, res) => {
  send(res, await assignFaces(req.params.id, req.body));
}));

router.post('/people/:id/dismissals', asyncRoute(async (req, res) => {
  send(res, await dismissFaces(req.params.id, req.body));
}));

// --- Face detection API (detection itself runs in the browser) ---
router.post('/faces/pending', asyncRoute(async (req, res) => {
  send(res, await pendingPhotos(req.body));
}));

router.get('/faces/unassigned', asyncRoute(async (req, res) => {
  send(res, await unassignedFaces(req.query.limit));
}));

router.put('/photos/:id/detected-faces', asyncRoute(async (req, res) => {
  send(res, await saveDetectedFaces(Number(req.params.id), req.body));
}));

router.get('/photos/:id/people', asyncRoute(async (req, res) => {
  send(res, await getPhotoPeople(Number(req.params.id)));
}));

router.post('/photos/:id/people', asyncRoute(async (req, res) => {
  send(res, await addPersonToPhoto(Number(req.params.id), req.body));
}));

router.delete('/photos/:id/people/:personId', asyncRoute(async (req, res) => {
  send(res, await removePersonFromPhoto(Number(req.params.id), req.params.personId));
}));

// --- Geo API ---
router.get('/geo/settings', (req, res) => {
  res.json(getGeoSettings());
});

router.get('/geo/points', asyncRoute(async (req, res) => {
  res.json(await listGeoPoints(req.query));
}));

router.get('/geo/places', asyncRoute(async (req, res) => {
  send(res, await listPlaces(req.query));
}));

router.get('/geo/search', asyncRoute(async (req, res) => {
  send(res, await searchPlaces(req.query.q, req.query.lang));
}));

// --- Memories API ---
router.get('/memories', asyncRoute(async (req, res) => {
  send(res, await listMemories(req.query.date));
}));

// --- Albums API ---
router.get('/albums', asyncRoute(async (req, res) => {
  res.json(await listAlbums());
}));

router.post('/albums', asyncRoute(async (req, res) => {
  send(res, await createAlbumFromPhotos(req.body));
}));

router.patch('/albums/:token', asyncRoute(async (req, res) => {
  send(res, await editAlbumProperties(req.params.token, req.body));
}));

router.delete('/albums/:token', asyncRoute(async (req, res) => {
  send(res, await deleteAlbumEverywhere(req.params.token));
}));

router.post('/albums/:token/photos', asyncRoute(async (req, res) => {
  send(res, await addAlbumPhotos(req.params.token, req.body));
}));

router.delete('/albums/:token/photos', asyncRoute(async (req, res) => {
  send(res, await removeAlbumPhotos(req.params.token, req.body));
}));

// --- Plugins API ---
router.get('/plugins', asyncRoute(async (req, res) => {
  res.json(await listPlugins(req.query.lang));
}));

router.get('/plugins/:id/filters/:name/icon', asyncRoute(async (req, res, next) => {
  const result = await filterIcon(req.params.id, req.params.name);
  if (result.status !== 200) return res.status(result.status).json(result.body);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // The URL carries the plugin version; a day is enough for an edited icon to show up without a version bump
  res.setHeader('Cache-Control', 'public, max-age=86400');
  sendFileOr404(res, next, result.file, 'file_not_found', 'Icon not found');
}));

router.patch('/plugins/:id', asyncRoute(async (req, res) => {
  send(res, await switchPlugin(req.params.id, req.body, req.query.lang));
}));

export default router;
