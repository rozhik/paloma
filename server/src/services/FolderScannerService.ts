import chokidar, { FSWatcher } from 'chokidar';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { folders, photos, edits, faceAnnotations, photoTags, albumPhotos, folderAlbums } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { METADATA_VERSION, MetadataService } from './MetadataService.js';
import { effectiveLocation } from './location.js';
import { ThumbnailService } from './ThumbnailService.js';
import { SidecarService, type FolderState, type PhotoFields } from './SidecarService.js';
import type { PalomaAlbumDefinition } from '../../../shared/types.js';
import { config } from '../config.js';
import { isIgnoredName, isExcluded, isPathCovered, collapseRoots, isFolderMetaFile } from './scanPaths.js';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp', '.heic']);

type IndexEvent = 'add' | 'change';

export interface ScanOptions {
  photosDirs: readonly string[];
  excludeDirs: readonly string[];
}

// Set by startConfiguredFolders(); read by the watchers' ignore filter
let excludeDirs: readonly string[] = config.excludeDirs;

function isIgnored(filePath: string): boolean {
  return isIgnoredName(path.basename(filePath)) || isExcluded(path.resolve(filePath), excludeDirs);
}

const STABLE_POLL_MS = 200;
const STABLE_FOR_MS = 1000;

/** Resolves true once size and mtime stop changing, or false if the file disappears. */
async function waitUntilStable(filePath: string): Promise<boolean> {
  let last = '';
  let stableSince = Date.now();
  for (;;) {
    let current: string;
    try {
      const stat = await fs.promises.stat(filePath);
      current = `${stat.size}:${stat.mtimeMs}`;
    } catch {
      return false;
    }
    if (current !== last) {
      last = current;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= STABLE_FOR_MS) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, STABLE_POLL_MS));
  }
}

type ExifLocation = { latitude: number | null; longitude: number | null };

/** Library columns that come from the folder files, with the location resolved against the camera's. */
function toPhotoColumns(fields: PhotoFields | undefined, exif: ExifLocation) {
  return {
    isStarred: fields?.star === true,
    isHidden: fields?.hidden === true,
    caption: fields?.caption ?? null,
    keywords: fields?.keywords ? JSON.stringify(fields.keywords) : null,
    ...effectiveLocation(fields?.geotag, exif),
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function folderAlbumRow(folderId: number, token: string, definition: PalomaAlbumDefinition) {
  return {
    folderId,
    token,
    name: str(definition.name),
    date: str(definition.date),
    location: str(definition.location),
    description: str(definition.description),
    cover: str(definition.cover),
    modified: str(definition.modified),
  };
}

function setFolderAlbums(tx: Tx | typeof db, folderId: number, albums: FolderState['albums']): void {
  tx.delete(folderAlbums).where(eq(folderAlbums.folderId, folderId)).run();
  for (const [token, definition] of Object.entries(albums)) {
    tx.insert(folderAlbums).values(folderAlbumRow(folderId, token, definition)).run();
  }
}

function setPhotoAlbums(tx: Tx | typeof db, photoId: number, fields: PhotoFields | undefined): void {
  tx.delete(albumPhotos).where(eq(albumPhotos.photoId, photoId)).run();
  for (const token of fields?.albums ?? []) {
    tx.insert(albumPhotos).values({ photoId, token }).run();
  }
}

export class FolderScannerService {
  private static watchers: Map<string, FSWatcher> = new Map();

  /**
   * Removes folders the configuration no longer covers, then scans and watches the configured
   * folders. Resolves once the initial scan is indexed.
   */
  public static async startConfiguredFolders(options: ScanOptions = config): Promise<void> {
    excludeDirs = options.excludeDirs;
    this.pruneFolders(options);

    // Only outer roots get a watcher, so nested roots don't index the same files twice
    await Promise.all(collapseRoots(options.photosDirs).map((dir) =>
      this.scanAndWatchFolder(dir).catch((err) => {
        console.error(`Failed to scan photos folder ${dir}:`, err);
      }),
    ));
  }

  private static async scanAndWatchFolder(folderPath: string): Promise<number> {
    const absPath = path.resolve(folderPath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`Directory does not exist: ${absPath}`);
    }

    const rootFolderId = this.upsertFolder(absPath);

    // Each subdirectory with photos becomes its own folder, with its own sidecar
    const folderIds = new Map<string, number>([[absPath, rootFolderId]]);
    const folderStates = new Map<string, FolderState>();
    let ready = false;
    const getFolderId = (dir: string): number => {
      let id = folderIds.get(dir);
      if (id === undefined) {
        id = this.upsertFolder(dir);
        folderIds.set(dir, id);
      }
      return id;
    };
    // Photo fields per folder from .paloma.json or the Picasa .ini; refreshed when either file changes
    const getFolderState = (dir: string): FolderState => {
      let state = folderStates.get(dir);
      if (!state) {
        state = SidecarService.getFolderState(dir);
        folderStates.set(dir, state);
        // The folder's album definitions enter the library with the first look at its files
        const folderId = folderIds.get(dir);
        if (folderId !== undefined) setFolderAlbums(db, folderId, state.albums);
      }
      return state;
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

    // Live events can arrive while a file is still being copied; index it once writing stops.
    // Initial-scan events go straight to the queue so large libraries aren't slowed down.
    const settling = new Set<string>();
    // The initial scan reads these files lazily per folder; later changes re-apply the folder's fields
    const onFolderMetaFile = (filePath: string): void => {
      if (!ready) return;
      const dir = path.dirname(filePath);
      queue = queue.then(() => {
        if (this.watchers.get(absPath) !== watcher) return;
        folderStates.delete(dir);
        this.applyFolderState(dir, getFolderState(dir));
      });
    };
    const enqueue = (event: IndexEvent) => async (filePath: string) => {
      if (isFolderMetaFile(path.basename(filePath))) {
        onFolderMetaFile(filePath);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) return;

      if (ready) {
        if (settling.has(filePath)) return;
        settling.add(filePath);
        const stable = await waitUntilStable(filePath);
        settling.delete(filePath);
        if (!stable) return;
      }

      // A closed or replaced watcher drops work that was still pending
      queue = queue.then(async () => {
        if (this.watchers.get(absPath) !== watcher) return;
        await this.indexPhoto(filePath, event, getFolderId, getFolderState);
      });
    };
    watcher.on('add', enqueue('add'));
    watcher.on('change', enqueue('change'));

    watcher.on('unlink', (filePath) => {
      if (isFolderMetaFile(path.basename(filePath))) {
        onFolderMetaFile(filePath);
        return;
      }
      const folder = db.select().from(folders).where(eq(folders.path, path.dirname(filePath))).get();
      if (!folder) return;

      const removed = db.select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.folderId, folder.id), eq(photos.filename, path.basename(filePath))))
        .all();
      this.removePhotos(removed.map((p) => p.id));
    });

    this.watchers.set(absPath, watcher);

    await new Promise<void>((resolve) => watcher.once('ready', resolve));
    await queue;
    // Photos already in the library skip indexing; bring their fields and albums in line with the folder files
    for (const dir of folderIds.keys()) this.applyFolderState(dir, getFolderState(dir));
    ready = true;
    return rootFolderId;
  }

  // Only touches the catalog; files on disk are never modified
  private static pruneFolders({ photosDirs, excludeDirs }: ScanOptions): void {
    for (const folder of db.select().from(folders).all()) {
      if (isPathCovered(folder.path, photosDirs, excludeDirs)) continue;

      const folderPhotos = db.select({ id: photos.id }).from(photos).where(eq(photos.folderId, folder.id)).all();
      this.removePhotos(folderPhotos.map((p) => p.id));
      db.delete(folderAlbums).where(eq(folderAlbums.folderId, folder.id)).run();
      db.delete(folders).where(eq(folders.id, folder.id)).run();
      console.log(`Removed folder from library (not in PALOMA_PHOTOS_DIRS or excluded): ${folder.path}`);
    }
  }

  // Dependent rows are deleted explicitly so removal does not rely on the foreign_keys pragma
  private static removePhotos(photoIds: number[]): void {
    if (photoIds.length === 0) return;

    db.transaction((tx) => {
      tx.delete(edits).where(inArray(edits.photoId, photoIds)).run();
      tx.delete(faceAnnotations).where(inArray(faceAnnotations.photoId, photoIds)).run();
      tx.delete(photoTags).where(inArray(photoTags.photoId, photoIds)).run();
      tx.delete(albumPhotos).where(inArray(albumPhotos.photoId, photoIds)).run();
      tx.delete(photos).where(inArray(photos.id, photoIds)).run();
    });
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

  // 'add' indexes new files only; 'change' also refreshes an indexed photo whose content changed
  private static async indexPhoto(
    filePath: string,
    event: IndexEvent,
    getFolderId: (dir: string) => number,
    getFolderState: (dir: string) => FolderState,
  ): Promise<void> {
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);
    try {
      const folderId = getFolderId(dir);
      const existingPhoto = db.select()
        .from(photos)
        .where(and(eq(photos.folderId, folderId), eq(photos.filename, filename)))
        .get();
      const outdated = existingPhoto !== undefined && existingPhoto.metadataVersion < METADATA_VERSION;
      if (existingPhoto && event === 'add' && !outdated) return;

      const meta = await MetadataService.extractMetadata(filePath);
      const sameContent = existingPhoto?.fileHash === meta.fileHash;
      if (sameContent && !outdated) return;
      if (!sameContent) await ThumbnailService.generateThumbnails(filePath, meta.fileHash);

      const exif = { latitude: meta.latitude, longitude: meta.longitude };
      const fromContent = {
        fileHash: meta.fileHash,
        width: meta.width,
        height: meta.height,
        fileSize: meta.fileSize,
        exifLatitude: meta.latitude,
        exifLongitude: meta.longitude,
        dateTaken: meta.dateTaken,
        metadataVersion: METADATA_VERSION,
      };
      // User fields come from the folder's sidecar (or Picasa .ini), so they survive a content change
      const fields = getFolderState(dir).photos[filename];
      const fromSidecar = toPhotoColumns(fields, exif);

      db.transaction((tx) => {
        let photoId: number;
        if (existingPhoto) {
          tx.update(photos).set({ ...fromContent, ...fromSidecar }).where(eq(photos.id, existingPhoto.id)).run();
          photoId = existingPhoto.id;
        } else {
          photoId = tx.insert(photos).values({
            folderId,
            filename,
            ...fromContent,
            ...fromSidecar,
            createdAt: new Date().toISOString(),
          }).returning({ id: photos.id }).get().id;
        }
        setPhotoAlbums(tx, photoId, fields);
      });
    } catch (err) {
      console.error(`Error scanning ${filePath}:`, err);
    }
  }

  /** Sets the user fields and albums of every library photo in a folder; a folder not in the library is left alone. */
  public static applyFolderState(dir: string, state: FolderState): void {
    const folder = db.select().from(folders).where(eq(folders.path, dir)).get();
    if (!folder) return;

    const folderPhotos = db.select({
      id: photos.id, filename: photos.filename, latitude: photos.exifLatitude, longitude: photos.exifLongitude,
    })
      .from(photos)
      .where(eq(photos.folderId, folder.id))
      .all();
    db.transaction((tx) => {
      for (const photo of folderPhotos) {
        const fields = state.photos[photo.filename];
        tx.update(photos).set(toPhotoColumns(fields, photo)).where(eq(photos.id, photo.id)).run();
        setPhotoAlbums(tx, photo.id, fields);
      }
      setFolderAlbums(tx, folder.id, state.albums);
    });
  }

  public static stopWatching(folderPath: string): void {
    const watcher = this.watchers.get(folderPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(folderPath);
    }
  }

  public static async stopAll(): Promise<void> {
    await Promise.all([...this.watchers.values()].map((watcher) => watcher.close()));
    this.watchers.clear();
  }
}
