import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';
import * as schema from './schema.js';
import { addMissingPhotoColumns, createAiTables, createAuthTables, createGeoTables, createPeopleTables, createTextTables, dropMvpEdits, migrateAlbumTables } from './columns.js';

export type Db = BetterSQLite3Database<typeof schema>;

/** The library database; set by openDatabase(), which runs before anything queries it. */
export let db: Db;

let sqlite: Database.Database | undefined;

/** The open SQLite connection, for the transaction gate in query.ts. */
export function connection(): Database.Database {
  if (!sqlite) throw new Error('The database is not open; call openDatabase() first');
  return sqlite;
}

/** Opens the library database in PALOMA_DATA_DIR and brings its tables up to date. Safe to call again. */
export async function openDatabase(): Promise<void> {
  if (sqlite) return;
  await fs.promises.mkdir(config.dataDir, { recursive: true });

  const opened = new Database(path.join(config.dataDir, 'paloma.db'));
  opened.pragma('journal_mode = WAL');

  // Auto initialize tables if not present
  opened.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      indexed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      file_size INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      latitude REAL,
      longitude REAL,
      date_taken TEXT,
      created_at TEXT NOT NULL,
      caption TEXT,
      keywords TEXT,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      exif_latitude REAL,
      exif_longitude REAL,
      location_source TEXT,
      geo_cell TEXT,
      metadata_version INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER NOT NULL UNIQUE REFERENCES photos(id) ON DELETE CASCADE,
      edit_instructions_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  addMissingPhotoColumns(opened);
  migrateAlbumTables(opened);
  createGeoTables(opened);
  dropMvpEdits(opened);
  createTextTables(opened);
  createPeopleTables(opened);
  createAuthTables(opened);
  createAiTables(opened);

  sqlite = opened;
  db = drizzle(opened, { schema });
}
