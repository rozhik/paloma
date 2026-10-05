import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { addMissingPhotoColumns, dropMvpEdits, migrateAlbumTables } from './columns.js';

describe('addMissingPhotoColumns', () => {
  it('adds caption, keywords and is_hidden to an old photos table and keeps its rows', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, is_starred INTEGER NOT NULL DEFAULT 0);
      INSERT INTO photos (filename, is_starred) VALUES ('a.jpg', 1);
    `);

    addMissingPhotoColumns(sqlite);
    addMissingPhotoColumns(sqlite); // idempotent

    const columns = (sqlite.pragma('table_info(photos)') as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['caption', 'keywords', 'is_hidden']));
    expect(sqlite.prepare('SELECT filename, is_starred, caption, keywords, is_hidden FROM photos').all())
      .toEqual([{ filename: 'a.jpg', is_starred: 1, caption: null, keywords: null, is_hidden: 0 }]);
  });
});

describe('addMissingPhotoColumns for locations', () => {
  it('adds the EXIF, effective-location and metadata version columns to an MVP photos table', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, latitude REAL, longitude REAL);
      INSERT INTO photos (filename, latitude, longitude) VALUES ('a.jpg', 48.1, 24.5);
    `);

    addMissingPhotoColumns(sqlite);
    addMissingPhotoColumns(sqlite);

    expect(sqlite.prepare(
      'SELECT filename, latitude, longitude, exif_latitude, exif_longitude, location_source, geo_cell, metadata_version FROM photos',
    ).all()).toEqual([{
      filename: 'a.jpg', latitude: 48.1, longitude: 24.5, exif_latitude: null, exif_longitude: null,
      location_source: null, geo_cell: null, metadata_version: 0,
    }]);
    const indexes = (sqlite.pragma('index_list(photos)') as Array<{ name: string }>).map((i) => i.name);
    expect(indexes).toContain('photos_geo_cell');
  });
});

describe('migrateAlbumTables', () => {
  it('replaces the MVP album tables with token-based ones and keeps photos', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE folders (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL);
      INSERT INTO folders (path) VALUES ('/photos');
      CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL);
      INSERT INTO photos (filename) VALUES ('a.jpg');
      CREATE TABLE albums (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL);
      CREATE TABLE album_photos (album_id INTEGER NOT NULL, photo_id INTEGER NOT NULL, added_at TEXT NOT NULL, PRIMARY KEY (album_id, photo_id));
      INSERT INTO albums (name, created_at) VALUES ('Old', '');
      INSERT INTO album_photos VALUES (1, 1, '');
    `);

    migrateAlbumTables(sqlite);
    sqlite.exec("INSERT INTO folder_albums (folder_id, token, name) VALUES (1, 'c9ea', 'Birds')");
    sqlite.exec("INSERT INTO album_photos (photo_id, token) VALUES (1, 'c9ea')");
    migrateAlbumTables(sqlite); // idempotent: keeps the new tables and their rows

    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
      .map((t) => t.name);
    expect(tables).not.toContain('albums');
    const columns = (sqlite.pragma('table_info(album_photos)') as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toEqual(['photo_id', 'token']);
    expect(sqlite.prepare('SELECT token, name FROM folder_albums').all()).toEqual([{ token: 'c9ea', name: 'Birds' }]);
    expect(sqlite.prepare('SELECT photo_id, token FROM album_photos').all()).toEqual([{ photo_id: 1, token: 'c9ea' }]);
    expect(sqlite.prepare('SELECT filename FROM photos').all()).toEqual([{ filename: 'a.jpg' }]);
  });
});

describe('dropMvpEdits', () => {
  it('deletes MVP edit objects and invalid JSON, keeping edit chains', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE edits (id INTEGER PRIMARY KEY AUTOINCREMENT, photo_id INTEGER NOT NULL UNIQUE, edit_instructions_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO edits (photo_id, edit_instructions_json, updated_at) VALUES
        (1, '{"crop":[0,0,10,10],"straighten":2}', 't'),
        (2, '[{"filter":"bw"}]', 't'),
        (3, 'not json', 't');
    `);
    dropMvpEdits(sqlite);
    dropMvpEdits(sqlite); // idempotent
    expect(sqlite.prepare('SELECT photo_id FROM edits').all()).toEqual([{ photo_id: 2 }]);
  });
});
