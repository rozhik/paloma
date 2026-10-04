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
