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
  /** Auth providers the plugin provides; empty unless it is active */
  authProviders: AuthProviderInfo[];
  /** AI providers the plugin provides; empty unless it is active */
  aiProviders: AiProviderSummary[];
}

/** `credentials`: a login form with the fields it declares; `bearer`: a credential sent with each request. */
export type AuthProviderKind = 'credentials' | 'bearer';

/** A form field of a `credentials` auth provider, with its label in the requested language. */
export interface AuthProviderField {
  name: string;
  label: string;
  type: 'text' | 'password';
}

/** An auth provider of an active plugin, with its label in the requested language. */
export interface AuthProviderInfo {
  id: string;
  kind: AuthProviderKind;
  label: string;
  /** Form fields; empty for a `bearer` provider */
  fields: AuthProviderField[];
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
  /** The Paloma user this person is, when users are on and one is linked */
  user?: { username: string; displayName: string } | null;
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

/** `GET /api/photos/stats`: totals over every photo of a library selection; computed, never stored. */
export interface PhotoStats {
  photoCount: number;
  /** Sum of the file sizes in bytes, as of the last scan */
  totalSize: number;
  /** Earliest and latest date taken; null when no photo has one */
  takenFrom: string | null;
  takenTo: string | null;
  undatedCount: number;
  starredCount: number;
  geotaggedCount: number;
  /** Photos with a saved edit chain of at least one step */
  modifiedCount: number;
  /** Most photos first, then by name */
  folders: { id: number; name: string; path: string; photoCount: number }[];
  /** `name` is null for an untitled album */
  albums: { token: string; name: string | null; photoCount: number }[];
  /** `name` is null for an unknown person */
  people: { id: string; name: string | null; photoCount: number }[];
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
  | 'unauthenticated'
  | 'permission_required'
  | 'session_required'
  | 'login_failed'
  | 'login_throttled'
  | 'provider_not_found'
  | 'setup_done'
  | 'setup_code_wrong'
  | 'password_too_short'
  | 'password_wrong'
  | 'password_unsupported'
  | 'username_invalid'
  | 'username_taken'
  | 'user_not_found'
  | 'last_admin'
  | 'self_change'
  | 'role_not_found'
  | 'role_name_taken'
  | 'role_builtin'
  | 'role_in_use'
  | 'token_not_found'
  | 'token_scope_exceeded'
  | 'session_not_found'
  | 'last_login_provider'
  | 'quota_exceeded'
  | 'album_not_granted'
  | 'outside_access'
  | 'person_linked'
  | 'avatar_invalid'
  | 'rate_limited'
  | 'ai_provider_not_found'
  | 'ai_provider_failed'
  | 'ai_task_not_found'
  | 'ai_task_builtin'
  | 'ai_task_not_builtin'
  | 'ai_task_not_ready'
  | 'ai_run_in_progress'
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

/**
 * What a user may do. `library.view`: see the library; `photos.edit`: stars, descriptions, tags, edits and
 * locations; `albums.manage`: albums; `people.manage`: people and faces; `ai.run`: running AI tasks on photos; `export`: exports and movies;
 * `account.tokens`: personal API tokens; `plugins.manage`: switching plugins and configuring AI; `users.manage`: users, roles,
 * sessions and tokens of everyone.
 */
export type Permission =
  | 'library.view'
  | 'photos.edit'
  | 'albums.manage'
  | 'people.manage'
  | 'ai.run'
  | 'export'
  | 'account.tokens'
  | 'plugins.manage'
  | 'users.manage';

/** `GET /api/admin/permissions`: one permission with its texts in the requested language. */
export interface PermissionInfo {
  id: Permission;
  label: string;
  description: string;
}

export type BuiltInRoleId = 'admin' | 'editor' | 'viewer';

/** A role: built-in (`admin`, `editor`, `viewer`; read-only) or created by an administrator. */
export interface RoleInfo {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  permissions: Permission[];
  /** Number of users with this role; only in `GET /api/admin/roles` */
  userCount?: number;
}

/** The part of the library a user sees: everything, or folders (with subfolders) and albums. */
export type LibraryAccess =
  | { all: true }
  | { all: false; folders: string[]; albums: string[] };

export type QuotaKind = 'export_bytes' | 'requests_per_minute';

/** One quota of a user: `limit` null means unlimited (or, for the request rate, the default from `.env`). */
export interface QuotaInfo {
  kind: QuotaKind;
  limit: number | null;
  /** The limit that applies: for the request rate, `limit` or the default; null when unlimited */
  effectiveLimit: number | null;
  /** Bytes used for `export_bytes`; absent for kinds without a stored usage */
  used?: number;
}

/** A user as an administrator sees them in `GET /api/admin/users`. */
export interface UserInfo {
  id: string;
  username: string;
  displayName: string;
  roleId: string;
  enabled: boolean;
  mustChangePassword: boolean;
  access: LibraryAccess;
  quotas: QuotaInfo[];
  /** Contact id of the person the user is in the library; null when not linked */
  personId: string | null;
  personName: string | null;
  /** The uploaded avatar, else the linked person's face; null for initials */
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Fields an administrator sends to create (`password` required) or change a user. */
export interface UserInput {
  username?: string;
  displayName?: string;
  roleId?: string;
  enabled?: boolean;
  password?: string;
  access?: LibraryAccess;
  /** Limits by kind; null for unlimited or the default */
  quotas?: Partial<Record<QuotaKind, number | null>>;
  /** Contact id of the person to link with; null to unlink */
  personId?: string | null;
}

/** A browser session of a user. */
export interface SessionInfo {
  id: string;
  userId: string;
  username: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string | null;
  ip: string | null;
  /** The session the request was made with */
  current: boolean;
}

/** A personal API token; its value is never listed. */
export interface ApiTokenInfo {
  id: string;
  userId: string;
  username: string;
  name: string;
  permissions: Permission[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

/** `POST /api/auth/tokens`: the new token with its value, shown this once. */
export interface CreatedApiToken extends ApiTokenInfo {
  value: string;
}

export type AuthMode = 'off' | 'on';

/** `GET /api/auth/status`, answered without authentication. */
export interface AuthStatus {
  mode: AuthMode;
  /** Auth is on and no user exists yet: the first administrator must be created with the setup code */
  setupPending: boolean;
  /** Login forms of the enabled `credentials` providers */
  providers: AuthProviderInfo[];
}

/** How the current request was authenticated. */
export type AuthVia = 'off' | 'session' | 'token';

/** `GET /api/auth/me`: the current user, or the single user of an install with auth off. */
export interface MeResponse {
  mode: AuthMode;
  via: AuthVia;
  /** Null when auth is off */
  user: {
    id: string;
    username: string;
    displayName: string;
    roleId: string;
    roleName: string;
    mustChangePassword: boolean;
    personId: string | null;
    personName: string | null;
    /** Whether the user may see their linked person (for My photos) */
    personVisible: boolean;
    /** The uploaded avatar, else the face of the linked person when the user may see them; null for initials */
    avatarUrl: string | null;
  } | null;
  permissions: Permission[];
  access: LibraryAccess;
  quotas: QuotaInfo[];
}


/** `GET /api/server/info`: the server's configuration from `.env`, read-only. */
export interface ServerInfo {
  version: string;
  authMode: AuthMode;
  photosDirs: string[];
  excludeDirs: string[];
  exportDir: string;
  dataDir: string;
  pluginsDir: string;
  /** Days a login lasts without use */
  sessionDays: number;
  /** Default API requests per minute per user and token; null when unlimited */
  rateLimit: number | null;
}

// --- AI providers, tasks and runs ---

/** What an AI task asks for: tags for the photo, objects with boxes, or a text. */
export type AiOutputKind = 'tags' | 'objects' | 'text';

/** An AI provider as `GET /api/plugins` lists it, with its label in the requested language. */
export interface AiProviderSummary {
  id: string;
  label: string;
}

export type AiSettingType = 'text' | 'secret' | 'number' | 'boolean' | 'choice';

/**
 * A setting of an AI provider as `GET /api/ai/providers` lists it. A secret's value is never sent: `set` says
 * whether one is saved, `fromEnv` that the server environment gives it instead.
 */
export interface AiSettingInfo {
  name: string;
  label: string;
  type: AiSettingType;
  required: boolean;
  help?: string;
  default?: string | number | boolean;
  min?: number;
  max?: number;
  options?: { value: string | number; label: string }[];
  /** The saved value; null when none is saved (and always for a secret) */
  value: string | number | boolean | null;
  /** Secrets only: whether a value is saved */
  set?: boolean;
  /** No value is saved and the provider uses one from the server environment */
  fromEnv?: boolean;
}

/** A model option of a provider: like a filter parameter, without rectangles. */
export type AiModelOptionInfo = Exclude<FilterParamInfo, { type: 'rect' }>;

/** `GET /api/ai/providers`: an AI provider of an active plugin with its settings and status. */
export interface AiProviderInfo {
  id: string;
  pluginId: string;
  label: string;
  settings: AiSettingInfo[];
  status: 'configured' | 'not_configured';
  /** Names of the settings that still need a value */
  missing: string[];
  modelOptions: AiModelOptionInfo[];
}

/** `GET /api/ai/providers/:id/models`: one model of a provider. */
export interface AiModelInfo {
  id: string;
  label: string;
}

/** Where the text of a `text` task goes. */
export type AiTextTarget = 'description-if-empty' | 'description-always' | 'none';

export interface AiTaskOptions {
  /** Long edge of the image sent, in pixels */
  imageSize: number;
  /** `user`: the UI language of who starts the run; otherwise a language tag */
  language: string;
  /** Photos processed at once */
  parallel: number;
  /** `tags` tasks */
  maxTags?: number;
  /** `tags` and `objects` tasks: answers with a lower confidence are not applied */
  minConfidence?: number;
  /** `objects` tasks: object labels are also added as tags */
  labelsAsTags?: boolean;
  /** `text` tasks */
  textTarget?: AiTextTarget;
}

/** Why a task cannot run. */
export type AiTaskProblem = 'no_provider' | 'provider_unavailable' | 'provider_not_configured' | 'no_model';

/** `GET /api/ai/tasks`: one AI task. */
export interface AiTask {
  id: string;
  builtIn: boolean;
  /** Null for a built-in task whose name was never changed; the client shows its name in the UI language */
  name: string | null;
  output: AiOutputKind;
  /** Offered in the AI menus */
  inMenu: boolean;
  provider: string | null;
  model: string | null;
  prompt: string;
  modelOptions: Record<string, string | number | boolean>;
  options: AiTaskOptions;
  ready: boolean;
  problem: AiTaskProblem | null;
}

/** `POST /api/ai/tasks` and `PATCH /api/ai/tasks/:id`: the fields to set. */
export type AiTaskInput = Partial<Pick<AiTask, 'name' | 'output' | 'inMenu' | 'provider' | 'model' | 'prompt' | 'modelOptions'>>
  & { options?: Partial<AiTaskOptions> };

export interface AiTag {
  name: string;
  confidence: number | null;
}

/** An object found on a photo, its rectangle in the unedited, upright photo. */
export interface AiObject {
  label: string;
  rect: RelativeRect;
  confidence: number | null;
}

/** `GET /api/photos/:id/ai`: the last result of one task on the photo's current content. */
export interface PhotoAiResult {
  taskId: string;
  /** As `AiTask.name` */
  taskName: string | null;
  output: AiOutputKind;
  provider: string;
  model: string;
  createdAt: string;
  tags?: AiTag[];
  objects?: AiObject[];
  text?: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type AiRunState = 'running' | 'cancelling' | 'finished' | 'cancelled' | 'stopped';

/** An AI run: the one in progress, or how the last one ended. */
export interface AiRunInfo {
  id: string;
  taskId: string;
  taskName: string | null;
  output: AiOutputKind;
  state: AiRunState;
  /** Photos the run has to process */
  total: number;
  /** Photos done, failed ones included */
  done: number;
  failed: number;
  tagsAdded: number;
  descriptionsSet: number;
  inputTokens: number;
  outputTokens: number;
  /** Why the run stopped early */
  error: string | null;
  /** The first failures, with the photo and the message */
  failures: { photoId: number; message: string }[];
  /** Ids of the photos processed, so views showing them can reload */
  photoIds: number[];
  startedAt: string;
  endedAt: string | null;
}

/** `GET /api/ai/runs/current`. */
export interface AiRunStatus {
  current: AiRunInfo | null;
  last: AiRunInfo | null;
}

/** `POST /api/ai/runs`. */
export interface AiRunRequest {
  taskId: string;
  photoIds: number[];
  /** Process photos already processed with the same task configuration, too */
  again?: boolean;
}
