import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

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
  latitude: real('latitude'),
  longitude: real('longitude'),
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

export const albums = sqliteTable('albums', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull(),
});

export const albumPhotos = sqliteTable('album_photos', {
  albumId: integer('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  photoId: integer('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  addedAt: text('added_at').notNull(),
});
