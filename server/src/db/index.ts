import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';
import * as schema from './schema.js';
import { addMissingPhotoColumns, createGeoTables, createPeopleTables, createTextTables, dropMvpEdits, migrateAlbumTables } from './columns.js';

if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

const dbPath = path.join(config.dataDir, 'paloma.db');
const sqlite = new Database(dbPath);

sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// Auto initialize tables if not present
sqlite.exec(`
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

addMissingPhotoColumns(sqlite);
migrateAlbumTables(sqlite);
createGeoTables(sqlite);
dropMvpEdits(sqlite);
createTextTables(sqlite);
createPeopleTables(sqlite);
