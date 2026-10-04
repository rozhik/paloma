export interface Folder {
  id: number;
  path: string;
  name: string;
  indexedAt: string;
  photoCount?: number;
}

export interface PhotoTuning {
  fillLight?: number; // 0..100
  contrast?: number; // -100..100
  temperature?: number; // 2000..10000
  straighten?: number; // -45..45 degrees
  sharpness?: number; // 0..100
  vignette?: number; // 0..100
  sepia?: boolean;
  bw?: boolean;
}

export interface EditDAG {
  crop?: [number, number, number, number]; // [x, y, width, height]
  straighten?: number;
  tuning?: PhotoTuning;
  updatedAt?: string;
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
  latitude: number | null;
  longitude: number | null;
  dateTaken: string | null;
  createdAt: string;
  edits?: EditDAG | null;
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

/** One photo's entry in `.paloma.json`. Keys Paloma does not interpret are preserved as is. */
export interface PalomaPhotoEntry {
  star?: boolean;
  hidden?: boolean;
  caption?: string;
  keywords?: string[];
  /** Tokens of the albums this photo is in */
  albums?: string[];
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
