import type Database from 'better-sqlite3';

// Columns added after the first release; CREATE TABLE IF NOT EXISTS does not add them to existing databases
const PHOTO_COLUMNS: Array<[name: string, definition: string]> = [
  ['caption', 'TEXT'],
  ['keywords', 'TEXT'],
  ['is_hidden', 'INTEGER NOT NULL DEFAULT 0'],
  ['exif_latitude', 'REAL'],
  ['exif_longitude', 'REAL'],
  ['location_source', 'TEXT'],
  ['geo_cell', 'TEXT'],
  ['metadata_version', 'INTEGER NOT NULL DEFAULT 0'],
  ['embedded_caption', 'TEXT'],
  ['embedded_keywords', 'TEXT'],
  ['camera_make', 'TEXT'],
  ['camera_model', 'TEXT'],
  ['search_text', 'TEXT'],
];

export function addMissingPhotoColumns(sqlite: Database.Database): void {
  const existing = new Set(
    (sqlite.pragma('table_info(photos)') as Array<{ name: string }>).map((column) => column.name),
  );
  for (const [name, definition] of PHOTO_COLUMNS) {
    if (!existing.has(name)) sqlite.exec(`ALTER TABLE photos ADD COLUMN ${name} ${definition}`);
  }
  sqlite.exec('CREATE INDEX IF NOT EXISTS photos_geo_cell ON photos(geo_cell)');
}

/**
 * Replaces the MVP database-only album tables (numeric ids) with token-based tables filled from the
 * folder files. MVP rows are dropped: they never existed on disk.
 */
export function migrateAlbumTables(sqlite: Database.Database): void {
  const albumPhotoColumns = (sqlite.pragma('table_info(album_photos)') as Array<{ name: string }>).map((c) => c.name);
  if (albumPhotoColumns.includes('album_id')) sqlite.exec('DROP TABLE album_photos');
  sqlite.exec(`
    DROP TABLE IF EXISTS albums;

    CREATE TABLE IF NOT EXISTS folder_albums (
      folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      name TEXT,
      date TEXT,
      location TEXT,
      description TEXT,
      cover TEXT,
      modified TEXT,
      PRIMARY KEY (folder_id, token)
    );

    CREATE TABLE IF NOT EXISTS album_photos (
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      PRIMARY KEY (photo_id, token)
    );

    CREATE INDEX IF NOT EXISTS album_photos_token ON album_photos(token);
  `);
}

/** Caches of the geocoder's answers, kept across restarts. */
export function createGeoTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS geo_places (
      cell TEXT NOT NULL,
      lang TEXT NOT NULL,
      name TEXT,
      search_text TEXT,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      retry_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (cell, lang)
    );

    CREATE TABLE IF NOT EXISTS geo_search (
      lang TEXT NOT NULL,
      query TEXT NOT NULL,
      results_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (lang, query)
    );
  `);
}

/**
 * Drops MVP edit rows: they hold the database-only `EditDAG` object, which never existed on disk.
 * Edit rows are now the photo's edit chain from its sidecar, always a JSON array.
 */
export function dropMvpEdits(sqlite: Database.Database): void {
  sqlite.exec(`
    DELETE FROM edits
    WHERE CASE WHEN json_valid(edit_instructions_json) THEN json_type(edit_instructions_json) <> 'array' ELSE 1 END
  `);
}

/**
 * Library indexes of the photos' text, rebuilt from disk: tags (keyed by their lowercased spelling) and the
 * people named in folder sidecars and on photos. Drops the MVP database-only `tags` and `photo_tags`.
 */
export function createTextTables(sqlite: Database.Database): void {
  sqlite.exec(`
    DROP TABLE IF EXISTS photo_tags;
    DROP TABLE IF EXISTS tags;

    CREATE TABLE IF NOT EXISTS photo_keywords (
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      key TEXT NOT NULL,
      PRIMARY KEY (photo_id, key)
    );
    CREATE INDEX IF NOT EXISTS photo_keywords_key ON photo_keywords(key);

    CREATE TABLE IF NOT EXISTS folder_people (
      folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      contact_id TEXT NOT NULL,
      name TEXT,
      email TEXT,
      google_id TEXT,
      PRIMARY KEY (folder_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS photo_people (
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      contact_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (photo_id, contact_id)
    );
    CREATE INDEX IF NOT EXISTS photo_people_contact ON photo_people(contact_id);
  `);
}

/**
 * People and face detection: person profiles keyed by contact id, and the faces found on photos with their
 * hidden descriptors. Drops the MVP database-only `people` and `face_annotations`, which nothing real used.
 */
export function createPeopleTables(sqlite: Database.Database): void {
  sqlite.exec(`
    DROP TABLE IF EXISTS face_annotations;
    DROP TABLE IF EXISTS people;

    CREATE TABLE IF NOT EXISTS persons (
      contact_id TEXT PRIMARY KEY,
      name TEXT,
      alias TEXT,
      comment TEXT,
      links TEXT,
      birth TEXT,
      gender TEXT,
      avatar_folder TEXT,
      avatar_file TEXT,
      avatar_rect TEXT,
      edited INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS photo_faces (
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      contact_id TEXT NOT NULL,
      rect TEXT,
      PRIMARY KEY (photo_id, position)
    );
    CREATE INDEX IF NOT EXISTS photo_faces_contact ON photo_faces(contact_id);

    CREATE TABLE IF NOT EXISTS face_detections (
      photo_id INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
      detector TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      detected_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS detected_faces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      rect TEXT NOT NULL,
      score REAL NOT NULL,
      descriptor BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS detected_faces_photo ON detected_faces(photo_id);

    CREATE TABLE IF NOT EXISTS face_dismissals (
      face_id INTEGER NOT NULL REFERENCES detected_faces(id) ON DELETE CASCADE,
      contact_id TEXT NOT NULL,
      PRIMARY KEY (face_id, contact_id)
    );
  `);
}
