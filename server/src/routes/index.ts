import { Router, type NextFunction, type Response } from 'express';
import crypto from 'node:crypto';
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
import { apiError } from '../services/apiError.js';
import { invalidDateFilter } from '../services/photoFilters.js';
import { listTags } from '../services/tagApi.js';
import { listMemories } from '../services/memories.js';
import { photoStats } from '../services/photoStats.js';
import { getPhotoInfo } from '../services/photoInfo.js';
import { startExport } from '../services/exportApi.js';
import { personAvatar, photoFace, photoFaceSource } from '../services/faceImages.js';
import { assignFaces, dismissFaces, similarFaces, unassignedFaces } from '../services/faceDetectionApi.js';
import { startFaceDetection } from '../faces/detectTask.js';
import { describeTask } from '../tasks/api.js';
import {
  addPersonToPhoto, createPerson, deletePerson, getPerson, getPhotoPeople, listPeople, listPersonFaces, removePersonFromPhoto,
  updatePerson,
} from '../services/peopleApi.js';
import { movieFilename } from '../services/outputPaths.js';
import { config } from '../config.js';
import { asyncRoute, sendFileOr404 } from './asyncRoute.js';
import { registerAuthRoutes } from './auth.js';
import { registerAdminRoutes } from './admin.js';
import { registerAiRoutes } from './ai.js';
import { registerTaskRoutes } from './tasks.js';
import { registerModelRoutes } from './model.js';
import { registerMcpRoutes } from '../mcp/route.js';
import { authenticate, need, principalOf } from '../auth/middleware.js';
import { grantAlbum } from '../auth/users.js';
import { andVisible, isFileHashVisible } from '../auth/scope.js';
import { rateLimit } from '../auth/rateLimit.js';
import { exportSpaceOf, fits, requireSpace } from '../auth/exportSpace.js';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const router = Router();

// Who makes the request; every route below starts with a need() guard (checked by routes/guards.test.ts)
router.use(authenticate());
router.use(rateLimit());
registerAuthRoutes(router);
registerAdminRoutes(router);
registerAiRoutes(router);
registerTaskRoutes(router);
registerModelRoutes(router);
registerMcpRoutes(router);

/** Sends an API result: its status with its body. */
const send = (res: Response, result: { status: number; body: unknown }) => res.status(result.status).json(result.body);

// --- Folders API ---
router.get('/folders', need('library.view'), asyncRoute(async (req, res) => {
  res.json(await listFolders());
}));

// --- Photos API ---
router.get('/photos', need('library.view'), asyncRoute(async (req, res) => {
  const field = invalidDateFilter(req.query);
  if (field) return res.status(400).json(apiError('invalid_date', `${field} must be a YYYY-MM-DD date`, { field }));
  res.json(await listPhotos(req.query));
}));

router.get('/photos/stats', need('library.view'), asyncRoute(async (req, res) => {
  const field = invalidDateFilter(req.query);
  if (field) return res.status(400).json(apiError('invalid_date', `${field} must be a YYYY-MM-DD date`, { field }));
  res.json(await photoStats(req.query));
}));

router.post('/photos/location', need('photos.edit'), asyncRoute(async (req, res) => {
  send(res, await setPhotosLocation(req.body));
}));

router.post('/photos/keywords', need('photos.edit'), asyncRoute(async (req, res) => {
  send(res, await changePhotosKeywords(req.body));
}));

router.get('/photos/:id/info', need('library.view'), asyncRoute(async (req, res) => {
  send(res, await getPhotoInfo(Number(req.params.id), req.query.lang));
}));

// --- Tags API ---
router.get('/tags', need('library.view'), asyncRoute(async (req, res) => {
  res.json(await listTags());
}));

router.patch('/photos/:id', need('photos.edit'), asyncRoute(async (req, res) => {
  send(res, await updatePhoto(Number(req.params.id), req.body));
}));

// Shortcut kept for the client's star toggle
router.patch('/photos/:id/star', need('photos.edit'), asyncRoute(async (req, res) => {
  send(res, await updatePhoto(Number(req.params.id), { isStarred: req.body?.isStarred }));
}));

// --- Edits API ---
router.put('/photos/:id/edits', need('photos.edit'), asyncRoute(async (req, res) => {
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

router.post('/photos/:id/preview', need('photos.edit'), asyncRoute(async (req, res, next) => {
  sendImage(res, next, await renderPreview(Number(req.params.id), req.body));
}));

router.get('/photos/:id/:size(thumbnail|preview)', need('library.view'), asyncRoute(async (req, res, next) => {
  sendImage(res, next, await photoImage(Number(req.params.id), req.params.size === 'thumbnail' ? 'thumb' : 'preview'));
}));

// --- Cache & File Media Endpoints ---
/** A cached image by file hash, only when some photo the request may see has that content. */
function sendCached(size: 'thumb' | 'preview', label: string) {
  return asyncRoute<{ fileHash: string }>(async (req, res, next) => {
    if (!await isFileHashVisible(req.params.fileHash)) {
      return res.status(404).json(apiError('file_not_found', `${label} not found`));
    }
    res.setHeader('Content-Type', 'image/webp');
    sendFileOr404(res, next, ThumbnailService.getThumbnailPath(req.params.fileHash, size), 'file_not_found', `${label} not found`);
  });
}

router.get('/cache/thumbnail/:fileHash', need('library.view'), sendCached('thumb', 'Thumbnail'));

router.get('/cache/preview/:fileHash', need('library.view'), sendCached('preview', 'Preview'));

router.get('/raw/:photoId', need('library.view'), asyncRoute(async (req, res, next) => {
  const photo = await get(db.select().from(photos).where(andVisible(eq(photos.id, Number(req.params.photoId)))));
  if (!photo) return res.status(404).json(apiError('photo_not_found', 'Photo not found'));

  const folder = await get(db.select().from(folders).where(eq(folders.id, photo.folderId)));
  if (!folder) return res.status(404).json(apiError('file_not_found', 'Folder not found'));

  sendFileOr404(res, next, path.join(folder.path, photo.filename), 'file_not_found', 'File missing');
}));

// --- Export API ---
// An export is a task: 202 with the task; its files are reported when it ends
router.post('/export', need('export'), asyncRoute(async (req, res) => {
  const principal = principalOf(res);
  res.status(202).json(await describeTask(principal, await startExport(req.body, principal)));
}));

// --- Movie Maker API ---
router.post('/creation/movie', need('export'), asyncRoute(async (req, res) => {
  const { photoIds, durationPerSlide = 3, outputFilename } = req.body ?? {};

  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return res.status(400).json(apiError('photo_ids_required', 'At least one photoId is required'));
  }

  // The duration goes into ffmpeg's options, so it must be a plain number
  const slideSeconds = Number(durationPerSlide);
  if (!Number.isFinite(slideSeconds) || slideSeconds <= 0 || slideSeconds > 60) {
    return res.status(400).json(apiError('invalid_field', 'durationPerSlide must be a number from 0 to 60', { field: 'durationPerSlide' }));
  }
  const space = await exportSpaceOf(principalOf(res));
  requireSpace(space);

  const selectedPhotos = await chunked(photoIds, BATCH_SIZE, (ids) => all(db.select({
    photo: photos,
    folder: folders,
  })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(andVisible(inArray(photos.id, ids)))));

  await fs.promises.mkdir(space.root, { recursive: true });
  // A folder of frames per movie, so movies made at the same time do not mix
  const tmpDir = path.join(config.dataDir, 'tmp_movie', crypto.randomUUID());
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const removeFrames = () => fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  for (let i = 0; i < selectedPhotos.length; i++) {
    const { photo, folder } = selectedPhotos[i];
    const srcPath = path.join(folder.path, photo.filename);
    const tmpFrame = path.join(tmpDir, `frame_${String(i).padStart(4, '0')}.jpg`);
    await sharp(srcPath).resize(1920, 1080, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } }).jpeg().toFile(tmpFrame);
  }

  const outputMoviePath = path.join(space.root, movieFilename(outputFilename));

  ffmpeg()
    .input(path.join(tmpDir, 'frame_%04d.jpg'))
    .inputOptions([`-loop 1`, `-framerate 1/${slideSeconds}`])
    .outputOptions(['-c:v libx264', '-pix_fmt yuv420p', `-t ${selectedPhotos.length * slideSeconds}`])
    .output(outputMoviePath)
    .on('end', () => {
      void (async () => {
        await removeFrames();
        // The movie's size is known only once it is made; one that does not fit is removed
        const size = (await fs.promises.stat(outputMoviePath).catch(() => ({ size: 0 }))).size;
        if (!fits(space, size)) {
          await fs.promises.rm(outputMoviePath, { force: true });
          res.status(409).json(apiError('quota_exceeded', 'The movie does not fit in your export space', { limit: space.limit!, used: space.used }));
          return;
        }
        res.json({ success: true, moviePath: outputMoviePath });
      })().catch((err) => res.status(500).json(apiError('internal', (err as Error).message, { message: (err as Error).message })));
    })
    .on('error', (err) => {
      void removeFrames();
      console.error('Failed to make a movie:', err);
      res.status(500).json(apiError('internal', err.message, { message: err.message }));
    })
    .run(); // ffmpeg, not a query
}));

// --- People API ---
router.get('/people', need('library.view'), asyncRoute(async (req, res) => {
  res.json(await listPeople());
}));

router.post('/people', need('people.manage'), asyncRoute(async (req, res) => {
  send(res, await createPerson(req.body));
}));

router.get('/people/:id', need('library.view'), asyncRoute(async (req, res) => {
  send(res, await getPerson(req.params.id));
}));

router.patch('/people/:id', need('people.manage'), asyncRoute(async (req, res) => {
  send(res, await updatePerson(req.params.id, req.body));
}));

router.delete('/people/:id', need('people.manage'), asyncRoute(async (req, res) => {
  send(res, await deletePerson(req.params.id));
}));

router.get('/people/:id/avatar', need('library.view'), asyncRoute(async (req, res, next) => {
  sendImage(res, next, await personAvatar(req.params.id));
}));

router.get('/photos/:id/face', need('library.view'), asyncRoute(async (req, res, next) => {
  sendImage(res, next, await photoFace(Number(req.params.id), req.query));
}));

router.get('/photos/:id/face-source', need('library.view'), asyncRoute(async (req, res, next) => {
  sendImage(res, next, await photoFaceSource(Number(req.params.id)));
}));

router.get('/people/:id/faces', need('library.view'), asyncRoute(async (req, res) => {
  send(res, await listPersonFaces(req.params.id));
}));

router.get('/people/:id/similar', need('library.view'), asyncRoute(async (req, res) => {
  send(res, await similarFaces(req.params.id, req.query.limit));
}));

router.post('/people/:id/faces', need('people.manage'), asyncRoute(async (req, res) => {
  send(res, await assignFaces(req.params.id, req.body));
}));

router.post('/people/:id/dismissals', need('people.manage'), asyncRoute(async (req, res) => {
  send(res, await dismissFaces(req.params.id, req.body));
}));

// --- Face detection API: detection runs on the server as a task ---
router.post('/faces/detect', need('people.manage'), asyncRoute(async (req, res) => {
  const principal = principalOf(res);
  const task = await startFaceDetection(req.body, principal);
  res.status(task ? 202 : 200).json({ task: task && await describeTask(principal, task) });
}));

router.get('/faces/unassigned', need('library.view'), asyncRoute(async (req, res) => {
  send(res, await unassignedFaces(req.query.limit));
}));

router.get('/photos/:id/people', need('library.view'), asyncRoute(async (req, res) => {
  send(res, await getPhotoPeople(Number(req.params.id)));
}));

router.post('/photos/:id/people', need('people.manage'), asyncRoute(async (req, res) => {
  send(res, await addPersonToPhoto(Number(req.params.id), req.body));
}));

router.delete('/photos/:id/people/:personId', need('people.manage'), asyncRoute(async (req, res) => {
  send(res, await removePersonFromPhoto(Number(req.params.id), req.params.personId));
}));

// --- Geo API ---
router.get('/geo/settings', need('library.view'), (req, res) => {
  res.json(getGeoSettings());
});

router.get('/geo/points', need('library.view'), asyncRoute(async (req, res) => {
  res.json(await listGeoPoints(req.query));
}));

router.get('/geo/places', need('library.view'), asyncRoute(async (req, res) => {
  send(res, await listPlaces(req.query));
}));

router.get('/geo/search', need('library.view'), asyncRoute(async (req, res) => {
  send(res, await searchPlaces(req.query.q, req.query.lang));
}));

// --- Memories API ---
router.get('/memories', need('library.view'), asyncRoute(async (req, res) => {
  send(res, await listMemories(req.query.date));
}));

// --- Albums API ---
router.get('/albums', need('library.view'), asyncRoute(async (req, res) => {
  res.json(await listAlbums());
}));

router.post('/albums', need('albums.manage'), asyncRoute(async (req, res) => {
  const result = await createAlbumFromPhotos(req.body);
  // A user with limited access keeps access to the album they made
  const { user, access } = principalOf(res);
  if (result.status === 200 && user && !access.all) await grantAlbum(user.id, result.body.token);
  send(res, result);
}));

router.patch('/albums/:token', need('albums.manage'), asyncRoute(async (req, res) => {
  send(res, await editAlbumProperties(req.params.token, req.body));
}));

router.delete('/albums/:token', need('albums.manage'), asyncRoute(async (req, res) => {
  send(res, await deleteAlbumEverywhere(req.params.token));
}));

router.post('/albums/:token/photos', need('albums.manage'), asyncRoute(async (req, res) => {
  send(res, await addAlbumPhotos(req.params.token, req.body));
}));

router.delete('/albums/:token/photos', need('albums.manage'), asyncRoute(async (req, res) => {
  send(res, await removeAlbumPhotos(req.params.token, req.body));
}));

// --- Plugins API ---
router.get('/plugins', need('library.view'), asyncRoute(async (req, res) => {
  res.json(await listPlugins(req.query.lang));
}));

router.get('/plugins/:id/filters/:name/icon', need('library.view'), asyncRoute(async (req, res, next) => {
  const result = await filterIcon(req.params.id, req.params.name);
  if (result.status !== 200) return res.status(result.status).json(result.body);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // The URL carries the plugin version; a day is enough for an edited icon to show up without a version bump
  res.setHeader('Cache-Control', 'public, max-age=86400');
  sendFileOr404(res, next, result.file, 'file_not_found', 'Icon not found');
}));

router.patch('/plugins/:id', need('plugins.manage'), asyncRoute(async (req, res) => {
  send(res, await switchPlugin(req.params.id, req.body, req.query.lang));
}));

export default router;
