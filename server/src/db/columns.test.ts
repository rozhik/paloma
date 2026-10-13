import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { addMissingPhotoColumns, createAiTables, createAuthTables, createPeopleTables, createTaskTables, createTextTables, createKeymapTables, dropMvpEdits, migrateAlbumTables } from './columns.js';

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

  it('adds the person and avatar columns to users tables of the first version, keeping users', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
        role_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, must_change_password INTEGER NOT NULL DEFAULT 0,
        access_all INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login_at TEXT);
      INSERT INTO users (id, username, username_key, display_name, role_id, created_at) VALUES ('u1', 'anna', 'anna', 'Anna', 'admin', '');
    `);
    createAuthTables(sqlite);
    createAuthTables(sqlite);
    expect(sqlite.prepare('SELECT username, person_id, avatar_version FROM users').all()).toEqual([{ username: 'anna', person_id: null, avatar_version: null }]);
    sqlite.exec("INSERT INTO users (id, username, username_key, display_name, role_id, created_at, person_id) VALUES ('u2', 'ben', 'ben', 'Ben', 'viewer', '', 'aaaaaaaaaaaaaaaa')");
    expect(() => sqlite.exec("UPDATE users SET person_id = 'aaaaaaaaaaaaaaaa' WHERE id = 'u1'")).toThrow(/UNIQUE/);
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

describe('createTextTables', () => {
  it('adds the text columns and tables, drops the MVP tag tables and keeps photos', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, caption TEXT);
      INSERT INTO photos (filename, caption) VALUES ('a.jpg', 'Sunrise');
      CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
      CREATE TABLE photo_tags (photo_id INTEGER NOT NULL, tag_id INTEGER NOT NULL);
      INSERT INTO tags (name) VALUES ('old');
      INSERT INTO photo_tags VALUES (1, 1);
    `);

    for (let i = 0; i < 2; i++) { // idempotent
      addMissingPhotoColumns(sqlite);
      createTextTables(sqlite);
    }

    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
      .map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(['photo_keywords', 'folder_people', 'photo_people']));
    expect(tables).not.toContain('tags');
    expect(tables).not.toContain('photo_tags');
    expect(sqlite.prepare(
      'SELECT filename, caption, embedded_caption, embedded_keywords, camera_make, camera_model, search_text FROM photos',
    ).all()).toEqual([{
      filename: 'a.jpg', caption: 'Sunrise', embedded_caption: null, embedded_keywords: null,
      camera_make: null, camera_model: null, search_text: null,
    }]);
    const indexes = (sqlite.pragma('index_list(photo_keywords)') as Array<{ name: string }>).map((i) => i.name);
    expect(indexes).toContain('photo_keywords_key');
  });
});

describe('createPeopleTables', () => {
  const tables = (sqlite: Database.Database) =>
    (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>)
      .map((t) => t.name);

  it('creates the people and face tables on an empty database', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec('CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL)');

    createPeopleTables(sqlite);
    createPeopleTables(sqlite); // idempotent

    expect(tables(sqlite)).toEqual(expect.arrayContaining(['persons', 'photo_faces', 'face_detections', 'detected_faces', 'face_dismissals']));
  });

  it('drops the MVP people and face_annotations tables and keeps persons across restarts', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL);
      CREATE TABLE people (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, avatar_crop_path TEXT);
      CREATE TABLE face_annotations (id INTEGER PRIMARY KEY AUTOINCREMENT, photo_id INTEGER NOT NULL, bounding_box TEXT NOT NULL);
      INSERT INTO people (name) VALUES ('Demo');
    `);

    createPeopleTables(sqlite);
    sqlite.exec("INSERT INTO persons (contact_id, name, created_at) VALUES ('b8e4117cf1d6615b', 'Roy', '')");
    createPeopleTables(sqlite);

    expect(tables(sqlite)).not.toContain('people');
    expect(tables(sqlite)).not.toContain('face_annotations');
    expect(sqlite.prepare('SELECT contact_id, name, edited FROM persons').all())
      .toEqual([{ contact_id: 'b8e4117cf1d6615b', name: 'Roy', edited: 0 }]);
  });
});

describe('createAuthTables', () => {
  it('adds the user tables to an existing library database and keeps its photos', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL);
      INSERT INTO photos (filename) VALUES ('a.jpg');
    `);

    createAuthTables(sqlite);
    createAuthTables(sqlite); // idempotent

    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining([
      'users', 'roles', 'role_permissions', 'user_access', 'user_identities', 'sessions', 'api_tokens', 'user_quotas',
    ]));
    expect(sqlite.prepare('SELECT filename FROM photos').all()).toEqual([{ filename: 'a.jpg' }]);
  });

  it('removes what belongs to a user with the user', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    createAuthTables(sqlite);
    sqlite.exec(`
      INSERT INTO users (id, username, username_key, display_name, role_id, created_at) VALUES ('u1', 'Anna', 'anna', 'Anna', 'admin', '');
      INSERT INTO user_access VALUES ('u1', 'album', 'c9ea');
      INSERT INTO user_identities VALUES ('password', 'u1', '{}');
      INSERT INTO sessions (id, token_hash, user_id, created_at, last_used_at) VALUES ('s1', 'h1', 'u1', '', '');
      INSERT INTO api_tokens (id, user_id, name, token_hash, permissions, created_at) VALUES ('t1', 'u1', 'frame', 'h2', '[]', '');
      INSERT INTO user_quotas VALUES ('u1', 'export_bytes', 100);
      DELETE FROM users WHERE id = 'u1';
    `);
    for (const table of ['user_access', 'user_identities', 'sessions', 'api_tokens', 'user_quotas']) {
      expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get(), table).toEqual({ n: 0 });
    }
  });
});

describe('createAiTables', () => {
  it('creates the AI tables on an existing database, once', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec('CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL); INSERT INTO photos (filename) VALUES (\'a.jpg\')');
    createAiTables(sqlite);
    createAiTables(sqlite);
    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(['ai_results', 'ai_objects']));
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`INSERT INTO ai_results VALUES (1, 'tags', 'f', 'h', 'openai', 'm', 'tags', '[]', NULL, NULL, '')`);
    sqlite.exec('DELETE FROM photos');
    expect(sqlite.prepare('SELECT count(*) AS n FROM ai_results').get()).toEqual({ n: 0 });
  });
});

describe('createTaskTables', () => {
  it('creates the task queue table, and again on an existing database without losing rows', () => {
    const sqlite = new Database(':memory:');
    createTaskTables(sqlite);
    sqlite.prepare(`INSERT INTO tasks (id, kind, state, position, subject, params, details, created_at)
      VALUES ('t1', 'export', 'waiting', 1, '{}', '{}', '{}', '2026-01-01')`).run();
    createTaskTables(sqlite);
    expect(sqlite.prepare('SELECT id, kind, state, system, total, done, failed FROM tasks').all())
      .toEqual([{ id: 't1', kind: 'export', state: 'waiting', system: 0, total: 0, done: 0, failed: 0 }]);
  });

  it('adds file_mtime to an existing photos table', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec('CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL)');
    addMissingPhotoColumns(sqlite);
    const columns = (sqlite.pragma('table_info(photos)') as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toContain('file_mtime');
  });
});

describe('createKeymapTables', () => {
  it('creates the keymaps table, and again on an existing database without losing rows', () => {
    const sqlite = new Database(':memory:');
    createKeymapTables(sqlite);
    sqlite.prepare(`INSERT INTO keymaps (owner, name, based_on, bindings, updated_at) VALUES ('u1', 'Mine', 'mac', '{}', '2026-01-01')`).run();
    createKeymapTables(sqlite);
    expect(sqlite.prepare('SELECT owner, name, based_on FROM keymaps').all()).toEqual([{ owner: 'u1', name: 'Mine', based_on: 'mac' }]);
  });
});
