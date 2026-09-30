import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { folders, photos, edits, people, faceAnnotations, tags, photoTags, albums, albumPhotos } from '../db/schema.js';
import { eq, like, and, inArray, desc } from 'drizzle-orm';
import { FolderScannerService } from '../services/FolderScannerService.js';
import { ThumbnailService } from '../services/ThumbnailService.js';
import { SidecarService } from '../services/SidecarService.js';
import { MetadataService } from '../services/MetadataService.js';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const router = Router();

// --- Folders API ---
router.get('/folders', (req, res) => {
  const allFolders = db.select().from(folders).all();
  const result = allFolders.map((f) => {
    const photoCountResult = db.select({ id: photos.id }).from(photos).where(eq(photos.folderId, f.id)).all();
    return {
      ...f,
      photoCount: photoCountResult.length,
    };
  });
  res.json(result);
});

router.post('/folders/scan', async (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'folderPath is required' });
  }

  try {
    const folderId = await FolderScannerService.scanAndWatchFolder(folderPath);
    res.json({ success: true, folderId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Photos API ---
router.get('/photos', (req, res) => {
  const { folderId, starred, query, limit = '500', offset = '0' } = req.query;

  let queryBuilder = db.select({
    photo: photos,
    folder: folders,
    edit: edits,
  })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .leftJoin(edits, eq(photos.id, edits.photoId));

  const conditions = [];
  if (folderId) {
    conditions.push(eq(photos.folderId, Number(folderId)));
  }
  if (starred === 'true') {
    conditions.push(eq(photos.isStarred, true));
  }
  if (query && typeof query === 'string') {
    conditions.push(like(photos.filename, `%${query}%`));
  }

  const rows = db.select({
    photo: photos,
    folder: folders,
    edit: edits,
  })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .leftJoin(edits, eq(photos.id, edits.photoId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(photos.dateTaken))
    .limit(Number(limit))
    .offset(Number(offset))
    .all();

  const result = rows.map(({ photo, folder, edit }) => {
    const fullPath = path.join(folder.path, photo.filename);
    const parsedEdits = edit ? JSON.parse(edit.editInstructionsJson) : null;
    return {
      ...photo,
      folderPath: folder.path,
      filePath: fullPath,
      edits: parsedEdits,
      thumbnailUrl: `/api/cache/thumbnail/${photo.fileHash}`,
      previewUrl: `/api/cache/preview/${photo.fileHash}`,
    };
  });

  res.json(result);
});

router.patch('/photos/:id/star', (req, res) => {
  const photoId = Number(req.params.id);
  const { isStarred } = req.body;

  const photo = db.select().from(photos).where(eq(photos.id, photoId)).get();
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  db.update(photos)
    .set({ isStarred: Boolean(isStarred) })
    .where(eq(photos.id, photoId))
    .run();

  const folder = db.select().from(folders).where(eq(folders.id, photo.folderId)).get();
  if (folder) {
    SidecarService.updatePhotoSidecar(folder.path, folder.name, photo.filename, {
      is_starred: Boolean(isStarred),
    });
  }

  res.json({ success: true, isStarred });
});

// --- Edits API ---
router.post('/photos/:id/edit', (req, res) => {
  const photoId = Number(req.params.id);
  const { editInstructions } = req.body; // EditDAG object

  const photo = db.select().from(photos).where(eq(photos.id, photoId)).get();
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

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

    SidecarService.updatePhotoSidecar(folder.path, folder.name, photo.filename, {
      edits: editInstructions,
    });
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
  res.status(404).send('Thumbnail not found');
});

router.get('/cache/preview/:fileHash', (req, res) => {
  const previewPath = ThumbnailService.getThumbnailPath(req.params.fileHash, 'preview');
  if (fs.existsSync(previewPath)) {
    res.setHeader('Content-Type', 'image/webp');
    return res.sendFile(previewPath);
  }
  res.status(404).send('Preview not found');
});

router.get('/raw/:photoId', (req, res) => {
  const photo = db.select().from(photos).where(eq(photos.id, Number(req.params.photoId))).get();
  if (!photo) return res.status(404).send('Not found');

  const folder = db.select().from(folders).where(eq(folders.id, photo.folderId)).get();
  if (!folder) return res.status(404).send('Folder not found');

  const fullPath = path.join(folder.path, photo.filename);
  if (fs.existsSync(fullPath)) {
    return res.sendFile(fullPath);
  }
  res.status(404).send('File missing');
});

// --- Export API ---
router.post('/export', async (req, res) => {
  const { photoIds, outputDir, quality = 85, resizeWidth, watermarkText } = req.body;

  if (!photoIds || !Array.isArray(photoIds) || !outputDir) {
    return res.status(400).json({ error: 'photoIds array and outputDir are required' });
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

  if (!photoIds || photoIds.length === 0) {
    return res.status(400).json({ error: 'At least one photoId is required' });
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
      res.status(500).json({ error: err.message });
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
  if (!name) return res.status(400).json({ error: 'Name is required' });

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

// --- Albums API ---
router.get('/albums', (req, res) => {
  const allAlbums = db.select().from(albums).all();
  res.json(allAlbums);
});

router.post('/albums', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const inserted = db.insert(albums).values({
    name,
    description,
    createdAt: new Date().toISOString(),
  }).returning().get();

  res.json(inserted);
});

router.post('/albums/:id/photos', (req, res) => {
  const albumId = Number(req.params.id);
  const { photoIds } = req.body;

  if (!Array.isArray(photoIds)) return res.status(400).json({ error: 'photoIds array required' });

  for (const pid of photoIds) {
    try {
      db.insert(albumPhotos).values({
        albumId,
        photoId: Number(pid),
        addedAt: new Date().toISOString(),
      }).run();
    } catch {
      // ignore duplicates
    }
  }

  res.json({ success: true, count: photoIds.length });
});

export default router;
