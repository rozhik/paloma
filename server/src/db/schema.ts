import { sqliteTable, integer, text, real, blob, primaryKey, index } from 'drizzle-orm/sqlite-core';

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
  // Text embedded in the photo file (XMP, IPTC, EXIF); caption and keywords above are the effective values
  embeddedCaption: text('embedded_caption'),
  embeddedKeywords: text('embedded_keywords'), // JSON array of strings
  cameraMake: text('camera_make'),
  cameraModel: text('camera_model'),
  // Lowercased file name, folder path, caption, keywords, camera make and model, one per line
  searchText: text('search_text'),
});

export const edits = sqliteTable('edits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  photoId: integer('photo_id').notNull().unique().references(() => photos.id, { onDelete: 'cascade' }),
  editInstructionsJson: text('edit_instructions_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// A person of the library, keyed by contact id. Profiles exist only here, never in folder files.
// `edited` = 0: never edited in Paloma, so the shown name comes from the folder files (folder_people)
export const persons = sqliteTable('persons', {
  contactId: text('contact_id').primaryKey(),
  name: text('name'),
  alias: text('alias'),
  comment: text('comment'),
  links: text('links'), // JSON array of URLs
  birth: text('birth'), // YYYY or YYYY-MM-DD
  gender: text('gender', { enum: ['female', 'male'] }),
  // The chosen avatar face: the photo's folder path and file name (photo ids change), and its rectangle as JSON
  avatarFolder: text('avatar_folder'),
  avatarFile: text('avatar_file'),
  avatarRect: text('avatar_rect'),
  edited: integer('edited', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

// Every face of a person on a photo, in face order, with its rectangle as JSON (null for a mark without one);
// rebuilt from disk like photo_people
export const photoFaces = sqliteTable('photo_faces', {
  photoId: integer('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  contactId: text('contact_id').notNull(),
  rect: text('rect'),
}, (table) => ({
  pk: primaryKey({ columns: [table.photoId, table.position] }),
  byContact: index('photo_faces_contact').on(table.contactId),
}));

// Photos face detection has run on: done while `detector` and `file_hash` match the current ones
export const faceDetections = sqliteTable('face_detections', {
  photoId: integer('photo_id').primaryKey().references(() => photos.id, { onDelete: 'cascade' }),
  detector: text('detector').notNull(),
  fileHash: text('file_hash').notNull(),
  detectedAt: text('detected_at').notNull(),
});

// Faces found by face detection; the descriptor is hidden data for matching, never sent to clients
export const detectedFaces = sqliteTable('detected_faces', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  photoId: integer('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  rect: text('rect').notNull(), // JSON RelativeRect of the unedited photo
  score: real('score').notNull(),
  descriptor: blob('descriptor', { mode: 'buffer' }).notNull(), // 128 little-endian float32
}, (table) => ({
  byPhoto: index('detected_faces_photo').on(table.photoId),
}));

// Detected faces the user said are not this person
export const faceDismissals = sqliteTable('face_dismissals', {
  faceId: integer('face_id').notNull().references(() => detectedFaces.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.faceId, table.contactId] }),
}));

// One row per tag of a photo; `key` is the tag lowercased in JS, so tags compare ignoring case beyond ASCII
export const photoKeywords = sqliteTable('photo_keywords', {
  photoId: integer('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  keyword: text('keyword').notNull(),
  key: text('key').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.photoId, table.key] }),
  byKey: index('photo_keywords_key').on(table.key),
}));

// One row per person definition in a folder's .paloma.json `people` (or Picasa [Contacts2]); rebuilt from disk
export const folderPeople = sqliteTable('folder_people', {
  folderId: integer('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').notNull(),
  name: text('name'),
  email: text('email'),
  googleId: text('google_id'),
}, (table) => ({
  pk: primaryKey({ columns: [table.folderId, table.contactId] }),
}));

// The distinct people of a photo's faces that are not ignored, in face order
export const photoPeople = sqliteTable('photo_people', {
  photoId: integer('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').notNull(),
  position: integer('position').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.photoId, table.contactId] }),
  byContact: index('photo_people_contact').on(table.contactId),
}));

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
