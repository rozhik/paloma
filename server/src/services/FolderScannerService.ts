import chokidar, { FSWatcher } from 'chokidar';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { folders, photos, edits } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { MetadataService } from './MetadataService.js';
import { ThumbnailService } from './ThumbnailService.js';
import { SidecarService } from './SidecarService.js';
import { config } from '../config.js';
import type { SidecarFile } from '../../../shared/types.js';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp', '.heic']);
// Skip dotfiles/dot-directories (incl. .paloma.json) and dependency trees
const IGNORED_NAMES = /(^|[\/\\])(\..*|node_modules)$/;

function isIgnored(filePath: string): boolean {
  if (IGNORED_NAMES.test(filePath)) return true;
  const absPath = path.resolve(filePath);
  return config.excludeDirs.some((dir) => absPath === dir || absPath.startsWith(dir + path.sep));
}

export class FolderScannerService {
  private static watchers: Map<string, FSWatcher> = new Map();

  public static async scanAndWatchFolder(folderPath: string): Promise<number> {
    const absPath = path.resolve(folderPath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`Directory does not exist: ${absPath}`);
    }

    const rootFolderId = this.upsertFolder(absPath);

    // Each subdirectory with photos becomes its own folder, with its own sidecar
    const folderIds = new Map<string, number>([[absPath, rootFolderId]]);
    const sidecars = new Map<string, SidecarFile | null>();
    const getFolderId = (dir: string): number => {
      let id = folderIds.get(dir);
      if (id === undefined) {
        id = this.upsertFolder(dir);
        folderIds.set(dir, id);
      }
      return id;
    };
    const getSidecar = (dir: string): SidecarFile | null => {
      if (!sidecars.has(dir)) sidecars.set(dir, SidecarService.readSidecar(dir));
      return sidecars.get(dir) ?? null;
    };

    // Watch folder using chokidar
    if (this.watchers.has(absPath)) {
      this.watchers.get(absPath)?.close();
    }

    const watcher = chokidar.watch(absPath, {
      ignored: isIgnored,
      persistent: true,
      ignoreInitial: false,
    });

    // Index files one at a time so a large tree doesn't spawn thousands of concurrent sharp jobs
    let queue: Promise<void> = Promise.resolve();

    watcher.on('add', (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) return;

      queue = queue.then(() => this.indexPhoto(filePath, getFolderId, getSidecar));
    });

    watcher.on('unlink', (filePath) => {
      const folderId = folderIds.get(path.dirname(filePath));
      if (folderId === undefined) return;

      const filename = path.basename(filePath);
      db.delete(photos)
        .where(and(eq(photos.folderId, folderId), eq(photos.filename, filename)))
        .run();
    });

    this.watchers.set(absPath, watcher);
    return rootFolderId;
  }

  private static upsertFolder(dirPath: string): number {
    const existing = db.select().from(folders).where(eq(folders.path, dirPath)).get();
    if (existing) {
      db.update(folders)
        .set({ indexedAt: new Date().toISOString() })
        .where(eq(folders.id, existing.id))
        .run();
      return existing.id;
    }

    return db.insert(folders)
      .values({
        path: dirPath,
        name: path.basename(dirPath),
        indexedAt: new Date().toISOString(),
      })
      .returning({ id: folders.id })
      .get().id;
  }

  private static async indexPhoto(
    filePath: string,
    getFolderId: (dir: string) => number,
    getSidecar: (dir: string) => SidecarFile | null,
  ): Promise<void> {
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);
    try {
      const folderId = getFolderId(dir);
      const existingPhoto = db.select()
        .from(photos)
        .where(and(eq(photos.folderId, folderId), eq(photos.filename, filename)))
        .all();
      if (existingPhoto.length > 0) return;

      const meta = await MetadataService.extractMetadata(filePath);
      await ThumbnailService.generateThumbnails(filePath, meta.fileHash);

      const sidecarPhoto = getSidecar(dir)?.photos?.[filename];
      const isStarred = sidecarPhoto?.is_starred ?? false;

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
    } catch (err) {
      console.error(`Error scanning ${filePath}:`, err);
    }
  }

  public static stopWatching(folderPath: string): void {
    const watcher = this.watchers.get(folderPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(folderPath);
    }
  }
}
