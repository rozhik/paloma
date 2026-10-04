import type Database from 'better-sqlite3';

// Columns added after the first release; CREATE TABLE IF NOT EXISTS does not add them to existing databases
const PHOTO_COLUMNS: Array<[name: string, definition: string]> = [
  ['caption', 'TEXT'],
  ['keywords', 'TEXT'],
  ['is_hidden', 'INTEGER NOT NULL DEFAULT 0'],
];

export function addMissingPhotoColumns(sqlite: Database.Database): void {
  const existing = new Set(
    (sqlite.pragma('table_info(photos)') as Array<{ name: string }>).map((column) => column.name),
  );
  for (const [name, definition] of PHOTO_COLUMNS) {
    if (!existing.has(name)) sqlite.exec(`ALTER TABLE photos ADD COLUMN ${name} ${definition}`);
  }
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
