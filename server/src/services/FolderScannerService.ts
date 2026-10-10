import chokidar, { FSWatcher } from 'chokidar';
import path from 'node:path';
import fs from 'node:fs';
import { db, type Db } from '../db/index.js';
import { all, BATCH_SIZE, chunked, eachBatch, get, run, withTransaction } from '../db/query.js';
import {
  folders, photos, edits, photoKeywords, photoPeople, albumPhotos, folderAlbums, folderPeople,
  detectedFaces, faceDetections, faceDismissals, persons, photoFaces,
} from '../db/schema.js';
import { eq, and, asc, gt, inArray } from 'drizzle-orm';
import { METADATA_VERSION, MetadataService } from './MetadataService.js';
import { effectiveLocation } from './location.js';
import { ThumbnailService } from './ThumbnailService.js';
import { SidecarService, type FolderState, type PhotoFields } from './SidecarService.js';
import type { PalomaAlbumDefinition, PalomaPerson } from '../../../shared/types.js';
import { effectiveText, parseKeywords, peopleOfFaces, textKey, type FileText } from './libraryText.js';
import { config } from '../config.js';
import { isIgnoredName, isExcluded, isPathCovered, collapseRoots, isFolderMetaFile } from './scanPaths.js';
import { withFolderLock } from './folderLock.js';

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

/**
 * Library columns that come from the folder files, with the location resolved against the camera's and the
 * description and tags against the text embedded in the file.
 */
function toPhotoColumns(fields: PhotoFields | undefined, exif: ExifLocation, file: FileText) {
  const { caption, keywords, searchText } = effectiveText(fields, file);
  return {
    isStarred: fields?.star === true,
    isHidden: fields?.hidden === true,
    caption,
    keywords: keywords.length > 0 ? JSON.stringify(keywords) : null,
    searchText,
    ...effectiveLocation(fields?.geotag, exif),
  };
}

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

async function setFolderAlbums(tx: Db, folderId: number, albums: FolderState['albums']): Promise<void> {
  await run(tx.delete(folderAlbums).where(eq(folderAlbums.folderId, folderId)));
  for (const [token, definition] of Object.entries(albums)) {
    await run(tx.insert(folderAlbums).values(folderAlbumRow(folderId, token, definition)));
  }
}

async function setPhotoAlbums(tx: Db, photoId: number, fields: PhotoFields | undefined): Promise<void> {
  await run(tx.delete(albumPhotos).where(eq(albumPhotos.photoId, photoId)));
  for (const token of fields?.albums ?? []) {
    await run(tx.insert(albumPhotos).values({ photoId, token }));
  }
}

/** Indexes the photo's tags by their lowercased spelling; the columns hold the effective tags as JSON. */
async function setPhotoKeywords(tx: Db, photoId: number, keywordsJson: string | null): Promise<void> {
  await run(tx.delete(photoKeywords).where(eq(photoKeywords.photoId, photoId)));
  for (const keyword of parseKeywords(keywordsJson)) {
    await run(tx.insert(photoKeywords).values({ photoId, keyword, key: textKey(keyword) }).onConflictDoNothing());
  }
}

/**
 * Indexes the people of the photo's faces and every face of a person with its rectangle; a contact id seen for
 * the first time becomes a person.
 */
async function setPhotoPeople(tx: Db, photoId: number, fields: PhotoFields | undefined): Promise<void> {
  await run(tx.delete(photoPeople).where(eq(photoPeople.photoId, photoId)));
  await run(tx.delete(photoFaces).where(eq(photoFaces.photoId, photoId)));
  for (const [position, contactId] of peopleOfFaces(fields?.faces).entries()) {
    await run(tx.insert(photoPeople).values({ photoId, contactId, position }));
    await run(tx.insert(persons).values({ contactId, createdAt: new Date().toISOString() }).onConflictDoNothing());
  }
  for (const [position, face] of (fields?.faces ?? []).filter((f) => !f.ignored && f.person).entries()) {
    await run(tx.insert(photoFaces).values({
      photoId, position, contactId: face.person!, rect: face.rect ? JSON.stringify(face.rect) : null,
    }));
  }
}

async function setFolderPeople(tx: Db, folderId: number, people: Record<string, PalomaPerson>): Promise<void> {
  await run(tx.delete(folderPeople).where(eq(folderPeople.folderId, folderId)));
  for (const [contactId, person] of Object.entries(people)) {
    await run(tx.insert(folderPeople).values({ folderId, contactId, ...person }));
  }
}

/** Stores the photo's edit chain from its folder files: one row with the chain, none without edits. */
async function setPhotoEdits(tx: Db, photoId: number, fields: PhotoFields | undefined): Promise<void> {
  if (!fields?.edits?.length) {
    await run(tx.delete(edits).where(eq(edits.photoId, photoId)));
    return;
  }
  const json = JSON.stringify(fields.edits);
  const existing = await get(tx.select({ json: edits.editInstructionsJson }).from(edits).where(eq(edits.photoId, photoId)));
  if (existing?.json === json) return;
  const updatedAt = new Date().toISOString();
  if (existing) await run(tx.update(edits).set({ editInstructionsJson: json, updatedAt }).where(eq(edits.photoId, photoId)));
  else await run(tx.insert(edits).values({ photoId, editInstructionsJson: json, updatedAt }));
}

/** Sets a library photo's user fields, albums, edits, tags and people from its folder files. */
async function setPhotoFields(tx: Db, photoId: number, fields: PhotoFields | undefined, keywordsJson: string | null): Promise<void> {
  await setPhotoAlbums(tx, photoId, fields);
  await setPhotoEdits(tx, photoId, fields);
  await setPhotoKeywords(tx, photoId, keywordsJson);
  await setPhotoPeople(tx, photoId, fields);
}

export class FolderScannerService {
  private static watchers: Map<string, FSWatcher> = new Map();

  /**
   * Removes folders the configuration no longer covers, then scans and watches the configured
   * folders. Resolves once the initial scan is indexed.
   */
  public static async startConfiguredFolders(options: ScanOptions = config): Promise<void> {
    excludeDirs = options.excludeDirs;
    await this.pruneFolders(options);

    // Only outer roots get a watcher, so nested roots don't index the same files twice
    await Promise.all(collapseRoots(options.photosDirs).map((dir) =>
      this.scanAndWatchFolder(dir).catch((err) => {
        console.error(`Failed to scan photos folder ${dir}:`, err);
      }),
    ));
  }

  private static async scanAndWatchFolder(folderPath: string): Promise<number> {
    const absPath = path.resolve(folderPath);

    try {
      await fs.promises.access(absPath);
    } catch {
      throw new Error(`Directory does not exist: ${absPath}`);
    }

    const rootFolderId = await this.upsertFolder(absPath);

    // Each subdirectory with photos becomes its own folder, with its own sidecar
    const folderIds = new Map<string, number>([[absPath, rootFolderId]]);
    const folderStates = new Map<string, FolderState>();
    let ready = false;
    const getFolderId = async (dir: string): Promise<number> => {
      let id = folderIds.get(dir);
      if (id === undefined) {
        id = await this.upsertFolder(dir);
        folderIds.set(dir, id);
      }
      return id;
    };
    // Photo fields per folder from .paloma.json or the Picasa .ini; refreshed when either file changes
    const getFolderState = async (dir: string): Promise<FolderState> => {
      let state = folderStates.get(dir);
      if (!state) {
        state = await SidecarService.getFolderState(dir);
        folderStates.set(dir, state);
        // The folder's album definitions enter the library with the first look at its files
        const folderId = folderIds.get(dir);
        if (folderId !== undefined) {
          const { albums, people } = state;
          await withTransaction(async (tx) => {
            await setFolderAlbums(tx, folderId, albums);
            await setFolderPeople(tx, folderId, people);
          });
        }
      }
      return state;
    };
    // Reads the folder files afresh and applies them, under the folder's lock so a change saved meanwhile is not undone
    const refreshFolder = (dir: string): Promise<void> => withFolderLock(dir, async () => {
      folderStates.delete(dir);
      const state = await SidecarService.getFolderState(dir);
      folderStates.set(dir, state);
      await this.applyFolderState(dir, state);
    });

    // Watch folder using chokidar
    if (this.watchers.has(absPath)) {
      await this.watchers.get(absPath)?.close();
    }

    const watcher = chokidar.watch(absPath, {
      ignored: isIgnored,
      persistent: true,
      ignoreInitial: false,
    });

    // Index files one at a time so a large tree doesn't spawn thousands of concurrent sharp jobs
    let queue: Promise<void> = Promise.resolve();
    const later = (job: () => Promise<void>): void => {
      queue = queue.then(job).catch((err) => console.error(`Failed to update the library from ${absPath}:`, err));
    };

    // Live events can arrive while a file is still being copied; index it once writing stops.
    // Initial-scan events go straight to the queue so large libraries aren't slowed down.
    const settling = new Set<string>();
    // The initial scan reads these files lazily per folder; later changes re-apply the folder's fields
    const onFolderMetaFile = (filePath: string): void => {
      if (!ready) return;
      const dir = path.dirname(filePath);
      later(async () => {
        if (this.watchers.get(absPath) !== watcher) return;
        await refreshFolder(dir);
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
      later(async () => {
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
      this.removeFile(filePath).catch((err) => console.error(`Failed to remove ${filePath} from the library:`, err));
    });

    this.watchers.set(absPath, watcher);

    await new Promise<void>((resolve) => watcher.once('ready', resolve));
    await queue;
    // Photos already in the library skip indexing; bring their fields and albums in line with the folder files
    for (const dir of folderIds.keys()) await refreshFolder(dir);
    ready = true;
    return rootFolderId;
  }

  /** Removes a deleted file's photo from the library. */
  private static async removeFile(filePath: string): Promise<void> {
    const folder = await get(db.select().from(folders).where(eq(folders.path, path.dirname(filePath))));
    if (!folder) return;

    const removed = await all(db.select({ id: photos.id })
      .from(photos)
      .where(and(eq(photos.folderId, folder.id), eq(photos.filename, path.basename(filePath)))));
    await this.removePhotos(removed.map((p) => p.id));
  }

  // Only touches the catalog; files on disk are never modified
  private static async pruneFolders({ photosDirs, excludeDirs }: ScanOptions): Promise<void> {
    const pages = eachBatch(BATCH_SIZE, (afterId, size) =>
      db.select().from(folders).where(gt(folders.id, afterId)).orderBy(asc(folders.id)).limit(size));
    for await (const page of pages) {
      for (const folder of page) {
        if (isPathCovered(folder.path, photosDirs, excludeDirs)) continue;

        const folderPhotos = await all(db.select({ id: photos.id }).from(photos).where(eq(photos.folderId, folder.id)));
        await this.removePhotos(folderPhotos.map((p) => p.id));
        await withTransaction(async (tx) => {
          await run(tx.delete(folderAlbums).where(eq(folderAlbums.folderId, folder.id)));
          await run(tx.delete(folderPeople).where(eq(folderPeople.folderId, folder.id)));
          await run(tx.delete(folders).where(eq(folders.id, folder.id)));
        });
        console.log(`Removed folder from library (not in PALOMA_PHOTOS_DIRS or excluded): ${folder.path}`);
      }
    }
  }

  // Dependent rows are deleted explicitly so removal does not rely on the foreign_keys pragma
  private static async removePhotos(photoIds: number[]): Promise<void> {
    await chunked(photoIds, BATCH_SIZE, (ids) => withTransaction(async (tx) => {
      await run(tx.delete(edits).where(inArray(edits.photoId, ids)));
      const faceIds = tx.select({ id: detectedFaces.id }).from(detectedFaces).where(inArray(detectedFaces.photoId, ids));
      await run(tx.delete(faceDismissals).where(inArray(faceDismissals.faceId, faceIds)));
      await run(tx.delete(detectedFaces).where(inArray(detectedFaces.photoId, ids)));
      await run(tx.delete(faceDetections).where(inArray(faceDetections.photoId, ids)));
      await run(tx.delete(photoKeywords).where(inArray(photoKeywords.photoId, ids)));
      await run(tx.delete(photoPeople).where(inArray(photoPeople.photoId, ids)));
      await run(tx.delete(photoFaces).where(inArray(photoFaces.photoId, ids)));
      await run(tx.delete(albumPhotos).where(inArray(albumPhotos.photoId, ids)));
      await run(tx.delete(photos).where(inArray(photos.id, ids)));
    }));
  }

  private static async upsertFolder(dirPath: string): Promise<number> {
    const existing = await get(db.select().from(folders).where(eq(folders.path, dirPath)));
    if (existing) {
      await run(db.update(folders)
        .set({ indexedAt: new Date().toISOString() })
        .where(eq(folders.id, existing.id)));
      return existing.id;
    }

    return (await get(db.insert(folders)
      .values({
        path: dirPath,
        name: path.basename(dirPath),
        indexedAt: new Date().toISOString(),
      })
      .returning({ id: folders.id }))).id;
  }

  // 'add' indexes new files only; 'change' also refreshes an indexed photo whose content changed
  private static async indexPhoto(
    filePath: string,
    event: IndexEvent,
    getFolderId: (dir: string) => Promise<number>,
    getFolderState: (dir: string) => Promise<FolderState>,
  ): Promise<void> {
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);
    try {
      const folderId = await getFolderId(dir);
      const existingPhoto = await get(db.select()
        .from(photos)
        .where(and(eq(photos.folderId, folderId), eq(photos.filename, filename))));
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
        embeddedCaption: meta.caption,
        embeddedKeywords: meta.keywords.length > 0 ? JSON.stringify(meta.keywords) : null,
        cameraMake: meta.cameraMake,
        cameraModel: meta.cameraModel,
        metadataVersion: METADATA_VERSION,
      };
      // User fields come from the folder's sidecar (or Picasa .ini), so they survive a content change
      const fields = (await getFolderState(dir)).photos[filename];
      const fromSidecar = toPhotoColumns(fields, exif, {
        filename, folderPath: dir, embeddedCaption: meta.caption, embeddedKeywords: meta.keywords,
        cameraMake: meta.cameraMake, cameraModel: meta.cameraModel,
      });

      await withTransaction(async (tx) => {
        let photoId: number;
        if (existingPhoto) {
          await run(tx.update(photos).set({ ...fromContent, ...fromSidecar }).where(eq(photos.id, existingPhoto.id)));
          photoId = existingPhoto.id;
        } else {
          photoId = (await get(tx.insert(photos).values({
            folderId,
            filename,
            ...fromContent,
            ...fromSidecar,
            createdAt: new Date().toISOString(),
          }).returning({ id: photos.id }))).id;
        }
        await setPhotoFields(tx, photoId, fields, fromSidecar.keywords);
      });
    } catch (err) {
      console.error(`Error scanning ${filePath}:`, err);
    }
  }

  /**
   * Sets the user fields and albums of every library photo in a folder; a folder not in the library is left
   * alone. Works through the folder's photos in batches, letting other requests run between them.
   */
  public static async applyFolderState(dir: string, state: FolderState): Promise<void> {
    const folder = await get(db.select().from(folders).where(eq(folders.path, dir)));
    if (!folder) return;

    const pages = eachBatch(BATCH_SIZE, (afterId, size) => db.select({
      id: photos.id, filename: photos.filename, latitude: photos.exifLatitude, longitude: photos.exifLongitude,
      embeddedCaption: photos.embeddedCaption, embeddedKeywords: photos.embeddedKeywords,
      cameraMake: photos.cameraMake, cameraModel: photos.cameraModel,
    })
      .from(photos)
      .where(and(eq(photos.folderId, folder.id), gt(photos.id, afterId)))
      .orderBy(asc(photos.id))
      .limit(size));
    for await (const page of pages) {
      await withTransaction(async (tx) => {
        for (const photo of page) {
          const fields = state.photos[photo.filename];
          const columns = toPhotoColumns(fields, photo, {
            ...photo, folderPath: dir, embeddedKeywords: parseKeywords(photo.embeddedKeywords),
          });
          await run(tx.update(photos).set(columns).where(eq(photos.id, photo.id)));
          await setPhotoFields(tx, photo.id, fields, columns.keywords);
        }
      });
    }
    await withTransaction(async (tx) => {
      await setFolderAlbums(tx, folder.id, state.albums);
      await setFolderPeople(tx, folder.id, state.people);
    });
  }

  public static async stopWatching(folderPath: string): Promise<void> {
    const watcher = this.watchers.get(folderPath);
    if (watcher) {
      this.watchers.delete(folderPath);
      await watcher.close();
    }
  }

  public static async stopAll(): Promise<void> {
    await Promise.all([...this.watchers.values()].map((watcher) => watcher.close()));
    this.watchers.clear();
  }
}
