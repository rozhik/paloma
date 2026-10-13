import chokidar, { FSWatcher } from 'chokidar';
import crypto from 'node:crypto';
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
import type { PalomaAlbumDefinition, PalomaPerson, ScanTaskDetails } from '../../../shared/types.js';
import { effectiveText, parseKeywords, peopleOfFaces, textKey, type FileText } from './libraryText.js';
import { config } from '../config.js';
import { isIgnoredName, isExcluded, isPathCovered, collapseRoots, isFolderMetaFile } from './scanPaths.js';
import { withFolderLock } from './folderLock.js';
import { isEnded, TaskFailed, taskQueue, type TaskRecord, type TaskRun } from '../tasks/queue.js';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp', '.heic']);

type IndexEvent = 'add' | 'change' | 'scan';

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

/** What a scan task works on; `items` are the watcher's changes not yet applied (changes mode). */
interface ScanParams {
  root: string;
  mode: 'full' | 'changes';
  /** Full mode: the last folder done, relative to the root, in scan order */
  doneDir?: string;
  /** Changes mode: paths with what happened to them, in the order they happened */
  items?: Array<[string, ChangeEvent]>;
}

/** A watcher change: a photo added, changed or deleted, or a folder's sidecar or Picasa file changed. */
type ChangeEvent = 'add' | 'change' | 'unlink' | 'meta';

/** A configured folder: its watcher, the changes waiting for a scan task, and the folders and sidecars seen. */
interface Root {
  path: string;
  watcher: FSWatcher | null;
  pending: Map<string, ChangeEvent>;
  /** The waiting scan task the pending changes go to */
  pendingTask: string | null;
  /** That task is being added */
  adding: boolean;
  folderIds: Map<string, number>;
  folderStates: Map<string, FolderState>;
}

const isPhotoFile = (filePath: string) => SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());

export interface StartOptions {
  /** Resolve only when the start-up scans have ended (default); the server does not wait, as it holds the queue */
  wait?: boolean;
}

export class FolderScannerService {
  private static roots: Map<string, Root> = new Map();

  /**
   * Removes folders the configuration no longer covers, starts watching the configured folders, and adds a scan
   * task for each. Resolves once those scans have ended, unless `wait` is false.
   */
  public static async startConfiguredFolders(options: ScanOptions = config, { wait = true }: StartOptions = {}): Promise<void> {
    excludeDirs = options.excludeDirs;
    await this.pruneFolders(options);
    const roots = collapseRoots(options.photosDirs);

    // Scans left from before a restart: a full scan of a configured folder goes on, the rest is redone by it
    const kept = new Map<string, TaskRecord<ScanParams>>();
    for (const task of (await taskQueue.list()).filter((t) => t.kind === 'scan' && !isEnded(t.state)) as TaskRecord<ScanParams>[]) {
      if (task.params.mode === 'full' && roots.includes(task.params.root) && !kept.has(task.params.root) && task.state !== 'running') kept.set(task.params.root, task);
      else if (task.state !== 'running') await taskQueue.cancel(task.id);
    }

    // Only outer roots get a watcher, so nested roots don't index the same files twice
    const scans: string[] = [];
    for (const dir of roots) {
      try {
        await this.watchRoot(dir);
      } catch (err) {
        console.error(`Failed to scan photos folder ${dir}:`, err);
        continue;
      }
      scans.push(kept.get(dir)?.id ?? (await this.addScan(dir, 'full')).id);
    }
    if (wait) await Promise.all(scans.map((id) => taskQueue.whenEnded(id)));
  }

  /** Adds a scan task started by Paloma; it goes before waiting user tasks. */
  private static addScan(root: string, mode: ScanParams['mode'], id?: string): Promise<TaskRecord<ScanParams>> {
    return taskQueue.add<ScanParams, ScanTaskDetails>({
      id, kind: 'scan', system: true, subject: { folder: root }, params: { root, mode, ...(mode === 'changes' ? { items: [] } : {}) },
      details: { kind: 'scan', mode, indexed: 0, removed: 0 },
    });
  }

  private static async watchRoot(folderPath: string): Promise<Root> {
    const absPath = path.resolve(folderPath);
    try {
      await fs.promises.access(absPath);
    } catch {
      throw new Error(`Directory does not exist: ${absPath}`);
    }
    await this.roots.get(absPath)?.watcher?.close();
    const root: Root = { path: absPath, watcher: null, pending: new Map(), pendingTask: null, adding: false, folderIds: new Map(), folderStates: new Map() };
    this.roots.set(absPath, root);

    // The scan task looks at the files already there; the watcher reports what changes after
    const watcher = chokidar.watch(absPath, { ignored: isIgnored, persistent: true, ignoreInitial: true });
    root.watcher = watcher;

    // Live events can arrive while a file is still being copied; it is recorded once writing stops
    const settling = new Set<string>();
    const onFile = (event: 'add' | 'change') => async (filePath: string) => {
      if (isFolderMetaFile(path.basename(filePath))) return this.recordChange(root, path.dirname(filePath), 'meta');
      if (!isPhotoFile(filePath) || settling.has(filePath)) return;
      settling.add(filePath);
      const stable = await waitUntilStable(filePath);
      settling.delete(filePath);
      if (stable) await this.recordChange(root, filePath, event);
    };
    watcher.on('add', onFile('add'));
    watcher.on('change', onFile('change'));
    watcher.on('unlink', (filePath) => {
      const meta = isFolderMetaFile(path.basename(filePath));
      if (meta || isPhotoFile(filePath)) void this.recordChange(root, meta ? path.dirname(filePath) : filePath, meta ? 'meta' : 'unlink');
    });
    await new Promise<void>((resolve) => watcher.once('ready', resolve));
    return root;
  }

  /** Keeps a watcher change for the root's waiting scan task, adding one when none waits. */
  private static async recordChange(root: Root, target: string, event: ChangeEvent): Promise<void> {
    if (this.roots.get(root.path) !== root) return;
    // A photo added and changed before the scan is still an add
    root.pending.set(target, event === 'change' && root.pending.get(target) === 'add' ? 'add' : event);
    if (root.adding) return;
    const waiting = root.pendingTask ? await taskQueue.find((t) => t.id === root.pendingTask) : undefined;
    if (waiting && (waiting.state === 'waiting' || waiting.state === 'paused')) {
      waiting.total = waiting.done + root.pending.size + ((waiting.params as ScanParams).items?.length ?? 0);
      return;
    }
    // Known before the task is added, so the task itself finds the changes recorded meanwhile
    root.pendingTask = crypto.randomUUID();
    root.adding = true;
    try {
      await this.addScan(root.path, 'changes', root.pendingTask);
    } finally {
      root.adding = false;
    }
  }

  /** The root a scan task works on; one that is no longer watched still gets its folders looked up. */
  private static rootOf(rootPath: string): Root {
    let root = this.roots.get(rootPath);
    if (!root) {
      root = { path: rootPath, watcher: null, pending: new Map(), pendingTask: null, adding: false, folderIds: new Map(), folderStates: new Map() };
      this.roots.set(rootPath, root);
    }
    return root;
  }

  /** Runs a scan task: the whole configured folder, or the changes the watcher found in it. */
  public static async runScan(run: TaskRun<ScanParams, ScanTaskDetails>): Promise<void> {
    const { task } = run;
    const root = this.rootOf(task.params.root);
    if (task.params.mode === 'changes') return this.runChanges(run, root);
    try {
      await fs.promises.access(root.path);
    } catch {
      console.error(`Failed to scan photos folder ${root.path}: Directory does not exist`);
      throw new TaskFailed(`Directory does not exist: ${root.path}`);
    }
    root.folderIds.set(root.path, await this.upsertFolder(root.path));
    const getFolderId = this.folderIdGetter(root);
    const getFolderState = this.folderStateGetter(root);
    // Each folder's files are read afresh by a full scan
    root.folderStates.clear();

    const dirs = await this.listPhotoDirs(root.path);
    task.total = [...dirs.values()].reduce((sum, files) => sum + files.length, 0);
    task.done = 0;
    for (const [dir, files] of dirs) {
      const relative = path.relative(root.path, dir);
      if (task.params.doneDir !== undefined && relative.localeCompare(task.params.doneDir) <= 0) {
        task.done += files.length;
        continue;
      }
      for (const filePath of files) {
        if (run.stopping()) return;
        if (await this.indexPhoto(filePath, 'scan', getFolderId, getFolderState)) task.details.indexed += 1;
        task.done += 1;
        run.progress();
      }
      if (run.stopping()) return;
      // Photos already in the library skip indexing; bring their fields and albums in line with the folder files
      if (files.length > 0 || dir === root.path) await this.refreshFolder(root, dir);
      task.params.doneDir = relative;
      run.progress();
    }
  }

  private static async runChanges(run: TaskRun<ScanParams, ScanTaskDetails>, root: Root): Promise<void> {
    const { task } = run;
    // The changes found until now are this task's; later ones go to a new task
    if (root.pendingTask === task.id) {
      task.params.items = [...(task.params.items ?? []), ...root.pending];
      root.pending = new Map();
      root.pendingTask = null;
    }
    const items = task.params.items ?? [];
    task.total = task.done + items.length;
    const getFolderId = this.folderIdGetter(root);
    const getFolderState = this.folderStateGetter(root);
    while (items.length > 0 && !run.stopping()) {
      const [target, event] = items[0];
      try {
        if (event === 'meta') {
          await this.refreshFolder(root, target);
        } else if (event === 'unlink') {
          if (await this.removeFile(target)) task.details.removed += 1;
        } else if (await this.indexPhoto(target, event, getFolderId, getFolderState)) {
          task.details.indexed += 1;
        }
      } catch (err) {
        console.error(`Failed to update the library from ${target}:`, err);
      }
      items.shift();
      task.done += 1;
      run.progress();
    }
  }

  /** The folders under a root that are scanned, each with its photo files, in a stable order. */
  private static async listPhotoDirs(rootPath: string): Promise<Map<string, string[]>> {
    const dirs = new Map<string, string[]>();
    const walk = async (dir: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (err) {
        console.error(`Failed to read folder ${dir}:`, err);
        return;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      dirs.set(dir, entries.filter((e) => e.isFile() && isPhotoFile(e.name) && !isIgnored(path.join(dir, e.name))).map((e) => path.join(dir, e.name)));
      for (const entry of entries) {
        if (entry.isDirectory() && !isIgnored(path.join(dir, entry.name))) await walk(path.join(dir, entry.name));
      }
    };
    await walk(rootPath);
    return new Map([...dirs].sort(([a], [b]) => path.relative(rootPath, a).localeCompare(path.relative(rootPath, b))));
  }

  private static folderIdGetter(root: Root): (dir: string) => Promise<number> {
    return async (dir) => {
      let id = root.folderIds.get(dir);
      if (id === undefined) {
        id = await this.upsertFolder(dir);
        root.folderIds.set(dir, id);
      }
      return id;
    };
  }

  /** Photo fields per folder from .paloma.json or the Picasa .ini; refreshed when either file changes. */
  private static folderStateGetter(root: Root): (dir: string) => Promise<FolderState> {
    return async (dir) => {
      let state = root.folderStates.get(dir);
      if (!state) {
        state = await SidecarService.getFolderState(dir);
        root.folderStates.set(dir, state);
        // The folder's album definitions enter the library with the first look at its files
        const folderId = root.folderIds.get(dir);
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
  }

  /** Reads the folder files afresh and applies them, under the folder's lock so a change saved meanwhile is not undone. */
  private static refreshFolder(root: Root, dir: string): Promise<void> {
    return withFolderLock(dir, async () => {
      root.folderStates.delete(dir);
      const state = await SidecarService.getFolderState(dir);
      root.folderStates.set(dir, state);
      await this.applyFolderState(dir, state);
    });
  }

  /** Removes a deleted file's photo from the library. */
  private static async removeFile(filePath: string): Promise<boolean> {
    const folder = await get(db.select().from(folders).where(eq(folders.path, path.dirname(filePath))));
    if (!folder) return false;

    const removed = await all(db.select({ id: photos.id })
      .from(photos)
      .where(and(eq(photos.folderId, folder.id), eq(photos.filename, path.basename(filePath)))));
    await this.removePhotos(removed.map((p) => p.id));
    return removed.length > 0;
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

  /**
   * 'add' indexes new files only; 'change' also refreshes an indexed photo whose content changed; 'scan' refreshes
   * it only when its size or modification time changed. True when the photo was indexed or updated.
   */
  private static async indexPhoto(
    filePath: string,
    event: IndexEvent,
    getFolderId: (dir: string) => Promise<number>,
    getFolderState: (dir: string) => Promise<FolderState>,
  ): Promise<boolean> {
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);
    try {
      const folderId = await getFolderId(dir);
      const existingPhoto = await get(db.select()
        .from(photos)
        .where(and(eq(photos.folderId, folderId), eq(photos.filename, filename))));
      const outdated = existingPhoto !== undefined && existingPhoto.metadataVersion < METADATA_VERSION;
      if (existingPhoto && event === 'add' && !outdated) return false;
      if (existingPhoto && event === 'scan' && !outdated) {
        const stat = await fs.promises.stat(filePath);
        if (existingPhoto.fileMtime === stat.mtimeMs && existingPhoto.fileSize === stat.size) return false;
        // Indexed before modification times were kept: taken as unchanged, as it was before
        if (existingPhoto.fileMtime === null) {
          await run(db.update(photos).set({ fileMtime: stat.mtimeMs, fileSize: stat.size }).where(eq(photos.id, existingPhoto.id)));
          return false;
        }
      }

      const [meta, stat] = await Promise.all([MetadataService.extractMetadata(filePath), fs.promises.stat(filePath)]);
      const sameContent = existingPhoto?.fileHash === meta.fileHash;
      if (sameContent && !outdated) {
        if (existingPhoto.fileMtime !== stat.mtimeMs) {
          await run(db.update(photos).set({ fileMtime: stat.mtimeMs, fileSize: stat.size }).where(eq(photos.id, existingPhoto.id)));
        }
        return false;
      }
      if (!sameContent) await ThumbnailService.generateThumbnails(filePath, meta.fileHash);

      const exif = { latitude: meta.latitude, longitude: meta.longitude };
      const fromContent = {
        fileHash: meta.fileHash,
        width: meta.width,
        height: meta.height,
        fileSize: meta.fileSize,
        fileMtime: stat.mtimeMs,
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
      return true;
    } catch (err) {
      console.error(`Error scanning ${filePath}:`, err);
      return false;
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

  /** Stops watching a configured folder and cancels its scans. */
  public static async stopWatching(folderPath: string): Promise<void> {
    const root = this.roots.get(folderPath);
    if (!root) return;
    this.roots.delete(folderPath);
    await root.watcher?.close();
    await this.cancelScans((task) => task.params.root === folderPath);
  }

  /** Stops every watcher and cancels the scans not yet ended (waiting for a running one to stop). */
  public static async stopAll(): Promise<void> {
    const roots = [...this.roots.values()];
    this.roots.clear();
    await Promise.all(roots.map((root) => root.watcher?.close()));
    await this.cancelScans(() => true);
  }

  private static async cancelScans(match: (task: TaskRecord<ScanParams>) => boolean): Promise<void> {
    const scans = (await taskQueue.list()).filter((t) => t.kind === 'scan' && !isEnded(t.state) && match(t as TaskRecord<ScanParams>));
    for (const task of scans) await taskQueue.cancel(task.id);
    await Promise.all(scans.map((task) => taskQueue.whenEnded(task.id)));
  }
}

taskQueue.register({ kind: 'scan', run: (run: TaskRun<ScanParams, ScanTaskDetails>) => FolderScannerService.runScan(run) });
