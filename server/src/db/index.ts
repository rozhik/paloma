import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';
import * as schema from './schema.js';

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
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id INTEGER NOT NULL UNIQUE REFERENCES photos(id) ON DELETE CASCADE,
    edit_instructions_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    avatar_crop_path TEXT
  );

  CREATE TABLE IF NOT EXISTS face_annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
    bounding_box TEXT NOT NULL,
    descriptor_vector TEXT,
    is_confirmed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS photo_tags (
    photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (photo_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS album_photos (
    album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL,
    PRIMARY KEY (album_id, photo_id)
  );
`);
