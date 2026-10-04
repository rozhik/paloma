import { sqliteTable, integer, text, real, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const folders = sqliteTable('folders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  name: text('name').notNull(),
  indexedAt: text('indexed_at').notNull(),
});

export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  folderId: integer('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  fileHash: text('file_hash').notNull(),
  width: integer('width').notNull().default(0),
  height: integer('height').notNull().default(0),
  fileSize: integer('file_size').notNull().default(0),
  isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
  // Effective location: the folder files' geotag, else the camera's EXIF GPS
  latitude: real('latitude'),
  longitude: real('longitude'),
  exifLatitude: real('exif_latitude'),
  exifLongitude: real('exif_longitude'),
  locationSource: text('location_source', { enum: ['exif', 'user'] }),
  // "<round(lat*100)>:<round(lon*100)>" of the effective location; joins the place name cache
  geoCell: text('geo_cell'),
  // Version of MetadataService that last read the file; older rows are re-read on the next scan
  metadataVersion: integer('metadata_version').notNull().default(0),
  dateTaken: text('date_taken'),
  createdAt: text('created_at').notNull(),
  caption: text('caption'),
  keywords: text('keywords'), // JSON array of strings
  isHidden: integer('is_hidden', { mode: 'boolean' }).notNull().default(false),
});

export const edits = sqliteTable('edits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  photoId: integer('photo_id').notNull().unique().references(() => photos.id, { onDelete: 'cascade' }),
  editInstructionsJson: text('edit_instructions_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const people = sqliteTable('people', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  avatarCropPath: text('avatar_crop_path'),
});

export const faceAnnotations = sqliteTable('face_annotations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  photoId: integer('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  personId: integer('person_id').references(() => people.id, { onDelete: 'set null' }),
  boundingBox: text('bounding_box').notNull(), // JSON string [x, y, w, h]
  descriptorVector: text('descriptor_vector'), // JSON string array
  isConfirmed: integer('is_confirmed', { mode: 'boolean' }).notNull().default(false),
});

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const photoTags = sqliteTable('photo_tags', {
  photoId: integer('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
});

// One row per album definition copy in a folder's .paloma.json (or Picasa .ini); rebuilt from disk
export const folderAlbums = sqliteTable('folder_albums', {
  folderId: integer('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  name: text('name'),
  date: text('date'),
  location: text('location'),
  description: text('description'),
  cover: text('cover'),
  modified: text('modified'),
}, (table) => ({
  pk: primaryKey({ columns: [table.folderId, table.token] }),
}));

export const albumPhotos = sqliteTable('album_photos', {
  photoId: integer('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.photoId, table.token] }),
  byToken: index('album_photos_token').on(table.token),
}));

// Reverse-geocoded place names per 0.01° cell ("<lat*100>:<lon*100>") and language; a cache, safe to delete
export const geoPlaces = sqliteTable('geo_places', {
  cell: text('cell').notNull(),
  lang: text('lang').notNull(),
  name: text('name'),
  // Lowercased name for case-insensitive search beyond ASCII
  searchText: text('search_text'),
  // ok: name found; none: the geocoder knows no place there; failed: retry after retry_at
  status: text('status', { enum: ['ok', 'none', 'failed'] }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  retryAt: text('retry_at'),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.cell, table.lang] }),
}));

// Address search results per language and normalized query; a cache, safe to delete
export const geoSearch = sqliteTable('geo_search', {
  lang: text('lang').notNull(),
  query: text('query').notNull(),
  resultsJson: text('results_json').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.lang, table.query] }),
}));
