import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { addMissingPhotoColumns } from './columns.js';

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
