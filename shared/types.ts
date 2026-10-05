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
  tags?: string[];
  facesCount?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
}

export interface Person {
  id: number;
  name: string;
  avatarCropPath: string | null;
  photoCount?: number;
}

export interface FaceAnnotation {
  id: number;
  photoId: number;
  personId: number | null;
  personName?: string | null;
  boundingBox: [number, number, number, number]; // [x, y, width, height]
  descriptorVector: number[] | null;
  isConfirmed: boolean;
}

export interface Tag {
  id: number;
  name: string;
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
  /** Location set in Paloma or imported from Picasa; null means the location was removed */
  geotag?: Geotag | null;
  /** Non-destructive edit chain, applied from first to last */
  edits?: EditStep[];
  /** UTC ISO 8601 time of the last change made in Paloma; absent for entries only imported from .picasa.ini */
  modified?: string;
  [key: string]: unknown;
}

/** `.paloma.json`, the per-folder sidecar (format v2). Unknown top-level sections are preserved. */
export interface PalomaFolderFile {
  format: 'paloma-folder';
  version: 2;
  /** Lowercase hex SHA-256 of the Picasa .ini the entries were last imported from */
  iniHash?: string;
  albums?: Record<string, PalomaAlbumDefinition>;
  photos: Record<string, PalomaPhotoEntry>;
  [key: string]: unknown;
}

/** Stable, machine-readable reason of an API error; the client shows a translated message for it. */
export type ApiErrorCode =
  | 'invalid_body'
  | 'invalid_field'
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
