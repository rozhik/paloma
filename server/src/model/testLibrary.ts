import fs from 'node:fs';
import path from 'node:path';
import type { PalomaFolderFile } from '../../../shared/types.js';

/** A folder of a test library: photo rows by file name stem, and optionally the folder's `.paloma.json`. */
export interface TestFolder {
  photos: Record<string, Partial<{ dateTaken: string | null; width: number; height: number; fileSize: number; isHidden: boolean }>>;
  sidecar?: Partial<PalomaFolderFile> & Record<string, unknown>;
}

export interface TestLibrary {
  /** Folder paths by name */
  dir: Record<string, string>;
  folderId: Record<string, number>;
  /** Photo ids by file name stem (`a` for `a.jpg`) */
  id: Record<string, number>;
  readSidecar: (folder: string) => PalomaFolderFile;
  hasSidecar: (folder: string) => boolean;
}

/**
 * Builds a library under `root` as the scanner leaves it: folder and photo rows (empty `.jpg` files), each
 * folder's `.paloma.json`, and the library fields applied from it. Call after `openTestDatabase`; modules that
 * read the environment are imported here, not at the top.
 */
export async function buildLibrary(root: string, folders: Record<string, TestFolder>): Promise<TestLibrary> {
  const { db } = await import('../db/index.js');
  const { get, run } = await import('../db/query.js');
  const schema = await import('../db/schema.js');
  const { FolderScannerService } = await import('../services/FolderScannerService.js');
  const { SidecarService } = await import('../services/SidecarService.js');
  for (const table of [
    schema.aiObjects, schema.aiResults, schema.faceDismissals, schema.edits, schema.albumPhotos, schema.folderAlbums, schema.photoFaces, schema.photoPeople, schema.folderPeople, schema.photoKeywords,
    schema.detectedFaces, schema.faceDetections, schema.persons, schema.photos, schema.folders,
  ]) await run(db.delete(table));

  const library: TestLibrary = {
    dir: {}, folderId: {}, id: {},
    readSidecar: (folder) => JSON.parse(fs.readFileSync(path.join(library.dir[folder], '.paloma.json'), 'utf-8')),
    hasSidecar: (folder) => fs.existsSync(path.join(library.dir[folder], '.paloma.json')),
  };
  for (const [name, folder] of Object.entries(folders)) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    library.dir[name] = dir;
    library.folderId[name] = (await get(db.insert(schema.folders).values({ path: dir, name: path.basename(name), indexedAt: '' }).returning()))!.id;
    for (const [stem, values] of Object.entries(folder.photos)) {
      fs.writeFileSync(path.join(dir, `${stem}.jpg`), '');
      library.id[stem] = (await get(db.insert(schema.photos).values({
        folderId: library.folderId[name], filename: `${stem}.jpg`, fileHash: `hash-${name}-${stem}`, width: 400, height: 300, createdAt: '', ...values,
      }).returning()))!.id;
    }
    if (folder.sidecar) {
      fs.writeFileSync(path.join(dir, '.paloma.json'), JSON.stringify({ format: 'paloma-folder', version: 2, photos: {}, ...folder.sidecar }));
    }
  }
  for (const dir of Object.values(library.dir)) await FolderScannerService.applyFolderState(dir, await SidecarService.getFolderState(dir));
  return library;
}
