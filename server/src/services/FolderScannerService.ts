import chokidar, { FSWatcher } from 'chokidar';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { folders, photos, edits } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { MetadataService } from './MetadataService.js';
import { ThumbnailService } from './ThumbnailService.js';
import { SidecarService } from './SidecarService.js';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp', '.heic']);

export class FolderScannerService {
  private static watchers: Map<string, FSWatcher> = new Map();

  public static async scanAndWatchFolder(folderPath: string): Promise<number> {
    const absPath = path.resolve(folderPath);
    const folderName = path.basename(absPath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`Directory does not exist: ${absPath}`);
    }

    // Insert or fetch folder in DB
    const existingFolders = db.select().from(folders).where(eq(folders.path, absPath)).all();
    let folderId: number;

    if (existingFolders.length > 0) {
      folderId = existingFolders[0].id;
      db.update(folders)
        .set({ indexedAt: new Date().toISOString() })
        .where(eq(folders.id, folderId))
        .run();
    } else {
      const res = db.insert(folders)
        .values({
          path: absPath,
          name: folderName,
          indexedAt: new Date().toISOString(),
        })
        .returning({ id: folders.id })
        .get();
      folderId = res.id;
    }

    // Read sidecar metadata if available
    const sidecar = SidecarService.readSidecar(absPath);

    // Watch folder using chokidar
    if (this.watchers.has(absPath)) {
      this.watchers.get(absPath)?.close();
    }

    const watcher = chokidar.watch(absPath, {
      ignored: /(^|[\/\\])\..*/, // ignore dotfiles EXCEPT .paloma.json
      persistent: true,
      depth: 0,
      ignoreInitial: false,
    });

    watcher.on('add', async (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) return;

      const filename = path.basename(filePath);
      try {
        const meta = await MetadataService.extractMetadata(filePath);
        await ThumbnailService.generateThumbnails(filePath, meta.fileHash);

        const sidecarPhoto = sidecar?.photos?.[filename];
        const isStarred = sidecarPhoto?.is_starred ?? false;

        const existingPhoto = db.select()
          .from(photos)
          .where(and(eq(photos.folderId, folderId), eq(photos.filename, filename)))
          .all();

        if (existingPhoto.length === 0) {
          const inserted = db.insert(photos).values({
            folderId,
            filename,
            fileHash: meta.fileHash,
            width: meta.width,
            height: meta.height,
            fileSize: meta.fileSize,
            isStarred,
            latitude: sidecarPhoto?.geo?.latitude ?? meta.latitude,
            longitude: sidecarPhoto?.geo?.longitude ?? meta.longitude,
            dateTaken: meta.dateTaken,
            createdAt: new Date().toISOString(),
          }).returning({ id: photos.id }).get();

          if (sidecarPhoto?.edits) {
            db.insert(edits).values({
              photoId: inserted.id,
              editInstructionsJson: JSON.stringify(sidecarPhoto.edits),
              updatedAt: new Date().toISOString(),
            }).run();
          }
        }
      } catch (err) {
        console.error(`Error scanning ${filePath}:`, err);
      }
    });

    watcher.on('unlink', (filePath) => {
      const filename = path.basename(filePath);
      db.delete(photos)
        .where(and(eq(photos.folderId, folderId), eq(photos.filename, filename)))
        .run();
    });

    this.watchers.set(absPath, watcher);
    return folderId;
  }

  public static stopWatching(folderPath: string): void {
    const watcher = this.watchers.get(folderPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(folderPath);
    }
  }
}
