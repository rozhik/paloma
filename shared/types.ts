export interface Folder {
  id: number;
  path: string;
  name: string;
  indexedAt: string;
  photoCount?: number;
}

/**
 * One step of a photo's non-destructive edit chain, as stored in `.paloma.json` `edits`:
 * the filter name, `enabled: false` for a step that is kept but not applied, and the filter's parameters.
 */
export interface EditStep {
  filter: string;
  enabled?: false;
  [param: string]: unknown;
}

/** A text in several languages (language tag to text, with `en`), or one text for all languages. */
export type LocalizedText = string | Record<string, string>;

/** A rectangle as fractions 0..1 of the image's width and height, from its top left corner. */
export interface RelativeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type FilterGroup = 'basic' | 'tuning' | 'effects';

/**
 * How much of the UI a user sees, lowest first: `child`, `easy`, `normal`, `pro`, `developer`.
 * Something with a level is available at that level and every higher one.
 */
export type ComplexityLevel = 'child' | 'easy' | 'normal' | 'pro' | 'developer';

/** A filter parameter as listed by `GET /api/plugins`, with its label in the requested language. */
export type FilterParamInfo =
  | { name: string; label: string; type: 'number'; min: number; max: number; step: number; default: number }
  | { name: string; label: string; type: 'boolean'; default: boolean }
  | { name: string; label: string; type: 'choice'; options: { value: string | number; label: string }[]; default: string | number }
  | { name: string; label: string; type: 'rect'; default: RelativeRect };

export interface FilterInfo {
  name: string;
  label: string;
  group: FilterGroup;
  params: FilterParamInfo[];
  /** URL of the filter's SVG icon; absent when it has none and the editor shows a generic icon */
  iconUrl?: string;
  /** The lowest level the editor offers it at: its own, else its plugin's */
  level: ComplexityLevel;
}

export type PluginSource = 'bundled' | 'external';
export type PluginStatus = 'active' | 'off' | 'error';

/** `GET /api/plugins`: one plugin, with texts in the requested language. */
export interface PluginInfo {
  /** The manifest id, or the folder name when the manifest has none */
  id: string;
  name: string;
  description: string;
  version: string | null;
  source: PluginSource;
  /** From the manifest; `normal` when it declares none */
  level: ComplexityLevel;
  enabled: boolean;
  status: PluginStatus;
  error: string | null;
  warnings: string[];
  /** Filters the plugin provides; empty unless it is active */
  filters: FilterInfo[];
}

export interface Photo {
  id: number;
  folderId: number;
  folderPath?: string;
  filename: string;
  filePath: string;
  fileHash: string;
  width: number;
  height: number;
  fileSize: number;
  isStarred: boolean;
  /** Effective location in decimal degrees; null without a location */
  latitude: number | null;
  longitude: number | null;
  /** `exif` from the camera, `user` from the sidecar or the Picasa .ini, null without a location */
  locationSource: LocationSource | null;
  /** Place name in the requested language; null until resolved, or without a location */
  place?: string | null;
  dateTaken: string | null;
  createdAt: string;
  /** The photo's edit chain; null without edits */
  edits?: EditStep[] | null;
  caption: string | null;
  keywords: string[];
  isHidden: boolean;
  /** Tokens of the albums this photo is in */
  albums: string[];
  facesCount?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
}

export type Gender = 'female' | 'male';

/** `GET /api/people`: one person of the library. Known people have a name; unknown people have none. */
export interface PersonSummary {
  /** Contact id: 16 lowercase hex digits */
  id: string;
  /** Shown name; null for an unknown person */
  name: string | null;
  alias: string | null;
  /** Changes whenever the avatar changes; null when the person has no avatar */
  avatarVersion: string | null;
  /** Photos with a face of the person that are not hidden */
  photoCount: number;
}

/** `GET /api/people/:id`: a person with the whole profile. Hidden face data is never sent. */
export interface Person extends PersonSummary {
  comment: string | null;
  links: string[];
  /** `YYYY` or `YYYY-MM-DD` */
  birth: string | null;
  gender: Gender | null;
  /** The face the user chose as avatar while it is still theirs; null for the default, their first face with a rectangle */
  avatar: PersonFace | null;
}

/** Body of `POST /api/people` and `PATCH /api/people/:id`; `null` clears a field. */
export interface PersonInput {
  name?: string;
  alias?: string | null;
  comment?: string | null;
  links?: string[];
  birth?: string | null;
  gender?: Gender | null;
  /** A face of the person with a rectangle on that photo; null goes back to the default avatar */
  avatar?: { photoId: number; rect: RelativeRect } | null;
}

/** A face of a person with a rectangle, as offered by the avatar picker (`GET /api/people/:id/faces`). */
export interface PersonFace {
  photoId: number;
  rect: RelativeRect;
}

/** A face found by face detection that belongs to no person, on a photo (`PhotoInfo.faces`). */
export interface DetectedFaceInfo {
  id: number;
  photoId: number;
  rect: RelativeRect;
}

/** One face of `GET /api/people/:id/similar`, the most similar first. */
export interface SimilarFace extends DetectedFaceInfo {
  distance: number;
}

export interface SimilarFaces {
  /** The person has no detected face to compare with */
  noReference: boolean;
  faces: SimilarFace[];
}

/** `GET /api/faces/unassigned`: detected faces that belong to no person, newest photos first. */
export interface UnassignedFaces {
  /** All of them, also beyond the faces listed */
  total: number;
  faces: DetectedFaceInfo[];
}

/** One detected face sent by the browser in `PUT /api/photos/:id/detected-faces`. */
export interface DetectedFaceInput {
  rect: RelativeRect;
  score: number;
  /** 128 numbers from the face recognition model */
  descriptor: number[];
}

/** The people and unassigned faces of a photo, as returned after a mark changes. */
export interface PhotoPeople {
  people: PhotoPerson[];
  faces: DetectedFaceInfo[];
}

/** Result of assigning faces in bulk (`POST /api/people/:id/faces`). */
export interface AssignFacesResult {
  assigned: number[];
  failed: number[];
}

/** `GET /api/tags`: a tag of at least one photo that is not hidden, under its most used spelling. */
export interface TagSummary {
  name: string;
  /** Photos that are not hidden and have the tag, compared ignoring case */
  photoCount: number;
}

/** A person on a photo; `name` is null for an unknown person. */
export interface PhotoPerson {
  /** Contact id: 16 lowercase hex digits */
  id: string;
  name: string | null;
  avatarVersion: string | null;
  /** Rectangles of the person's faces on the photo, as fractions of the unedited photo */
  rects: RelativeRect[];
}

/** An EXIF value as text, or the size of a binary value (maker note, thumbnail). */
export type ExifValue = string | { binary: number };

/** Where the photo's sidecar entry shown in the Info panel comes from. */
export type PhotoEntrySource = 'paloma' | 'ini' | 'none' | 'unreadable';

/** `GET /api/photos/:id/info`: everything the Info panel shows about a photo. */
export interface PhotoInfo {
  photo: Photo;
  file: { path: string; size: number; modifiedAt: string | null };
  albums: { token: string; name: string | null }[];
  people: PhotoPerson[];
  /** Detected faces that belong to no person */
  faces: DetectedFaceInfo[];
  /** Place name in the requested language; null when unknown */
  place: string | null;
  /** EXIF fields by group (`Image`, `Photo`, `GPSInfo`, `Iop`, ...); null without EXIF */
  exif: Record<string, Record<string, ExifValue>> | null;
  /** The photo's entry as stored in `.paloma.json`, or the fields read from the Picasa .ini */
  entry: { source: PhotoEntrySource; json?: Record<string, unknown> };
}

/** A library album, resolved from the definition copies in folder sidecars (or Picasa .ini files). */
export interface Album {
  token: string;
  /** null when no folder copy names the album */
  name: string | null;
  date: string | null;
  description: string | null;
  location: string | null;
  /** Photos in the album that are not hidden */
  photoCount: number;
  coverPhotoId: number | null;
  coverThumbnailUrl: string | null;
}

/** `GET /api/memories`: photos taken around the given date in one earlier year; computed, never stored. */
export interface Memory {
  year: number;
  /** The given date's year minus `year` */
  yearsAgo: number;
  /** First and last day of the memory's window, `YYYY-MM-DD` */
  from: string;
  to: string;
  /** Photos in the memory that are not hidden */
  photoCount: number;
  /** The smallest named album holding every photo of the memory, which names it; null when there is none */
  album: { token: string; name: string } | null;
  /** Reserved for a generated name; the client prefers it when set */
  title: string | null;
  coverPhotoId: number;
  coverThumbnailUrl: string;
}

/** An album definition in `.paloma.json` `albums`, keyed by token. Keys Paloma does not interpret are preserved. */
export interface PalomaAlbumDefinition {
  name?: string;
  /** ISO 8601 with the offset, as Picasa writes it */
  date?: string;
  location?: string;
  description?: string;
  /** File name of the album's cover photo; only in the copy in that photo's folder */
  cover?: string;
  /** UTC ISO 8601 time of the last change made in Paloma; absent for definitions only imported from .picasa.ini */
  modified?: string;
  [key: string]: unknown;
}

/** A location in decimal degrees, as stored in `.paloma.json` (`geotag`) and sent to the API (`location`). */
export interface Geotag {
  lat: number;
  lon: number;
}

export type LocationSource = 'exif' | 'user';

/** One photo's entry in `.paloma.json`. Keys Paloma does not interpret are preserved as is. */
export interface PalomaPhotoEntry {
  star?: boolean;
  hidden?: boolean;
  caption?: string;
  keywords?: string[];
  /** Tokens of the albums this photo is in */
  albums?: string[];
  /** People's faces: marks from Picasa or made in Paloma */
  faces?: PalomaFace[];
  /** Location set in Paloma or imported from Picasa; null means the location was removed */
  geotag?: Geotag | null;
  /** Non-destructive edit chain, applied from first to last */
  edits?: EditStep[];
  /** UTC ISO 8601 time of the last change made in Paloma; absent for entries only imported from .picasa.ini */
  modified?: string;
  [key: string]: unknown;
}

/**
 * A face on a photo in `.paloma.json` `faces`: a contact's, with or without a rectangle, or one marked as
 * ignored, which always has a rectangle.
 */
export interface PalomaFace {
  /** As fractions of the unedited photo */
  rect?: RelativeRect;
  /** Contact id: 16 lowercase hex digits */
  person?: string;
  ignored?: true;
}

/** A person in `.paloma.json` `people`, keyed by contact id; from Picasa `[Contacts2]`. */
export interface PalomaPerson {
  name: string | null;
  email: string | null;
  googleId: string | null;
}

/** `.paloma.json`, the per-folder sidecar (format v2). Unknown top-level sections are preserved. */
export interface PalomaFolderFile {
  format: 'paloma-folder';
  version: 2;
  /** Lowercase hex SHA-256 of the Picasa .ini the entries were last imported from */
  iniHash?: string;
  albums?: Record<string, PalomaAlbumDefinition>;
  people?: Record<string, PalomaPerson>;
  photos: Record<string, PalomaPhotoEntry>;
  [key: string]: unknown;
}

/** Stable, machine-readable reason of an API error; the client shows a translated message for it. */
export type ApiErrorCode =
  | 'invalid_body'
  | 'invalid_field'
  | 'invalid_date'
  | 'album_name_required'
  | 'photo_ids_required'
  | 'no_album_fields'
  | 'no_photo_fields'
  | 'photo_not_found'
  | 'album_not_found'
  | 'file_not_found'
  | 'cover_not_in_album'
  | 'sidecar_unreadable'
  | 'sidecar_write_failed'
  | 'album_empty'
  | 'export_params_required'
  | 'person_name_required'
  | 'person_not_found'
  | 'face_not_found'
  | 'invalid_location'
  | 'query_required'
  | 'geocoder_disabled'
  | 'geocoder_failed'
  | 'plugin_not_found'
  | 'plugin_unavailable'
  | 'plugin_invalid_body'
  | 'filter_not_found'
  | 'edits_invalid'
  | 'render_failed'
  | 'internal';

/** Body of every API error response. `error` is English text for clients that do not know the code. */
export interface ApiError {
  error: string;
  code: ApiErrorCode;
  /** Values the message refers to, e.g. `field`, `files` or `folders` */
  params?: Record<string, string | number>;
  /** Folders an album change could not be saved to */
  failedFolders?: string[];
}

/** `GET /api/geo/settings`: the map and geocoder settings from `.env`. */
export interface GeoSettings {
  geocoding: boolean;
  tileUrl: string;
  tileAttribution: string;
}

/** `GET /api/geo/points`: one geotagged photo on the map. */
export interface GeoPoint {
  id: number;
  lat: number;
  lon: number;
  thumbnailUrl: string;
}

export interface GeoBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** One result of `GET /api/geo/search`. */
export interface GeoSearchResult {
  name: string;
  lat: number;
  lon: number;
  bounds: GeoBounds;
}

/** One place of `GET /api/geo/places`. */
export interface GeoPlace {
  name: string;
  count: number;
  bounds: GeoBounds;
}

export interface GeoPlaces {
  places: GeoPlace[];
  /** Matching geotagged photos whose place is not resolved yet */
  pending: number;
}
