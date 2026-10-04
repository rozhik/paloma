# Design

## Context

See proposal.md for the motivation. The current state:

- `MetadataService.extractMetadata` parses EXIF with `exif-reader` and writes `latitude`/`longitude` straight into `photos`. It looks for `gps`/`GPS` keys, but `exif-reader` 2.x returns GPS under `GPSInfo`, so in practice no photo gets a location today.
- `.paloma.json` fields go through `SidecarService` (`fieldsOf`, `updatePhotoFields`, `SUPPORTED_FIELDS`, `sameFields` for `.ini` re-import), and `picasaIni.ts` (`toFields`). `FolderScannerService` turns a folder's state into DB columns (`toPhotoColumns`) on index and on every sidecar or `.ini` change, and after the initial scan.
- Album changes across folders already have a folder-by-folder save with `409` / `failedFolders` (`albumApi.ts`); batch location saving follows the same shape.
- `PlacesMap.tsx` fetches `/api/photos?limit=1000` (all photos, first 1000), filters on the client, and draws one Leaflet marker per photo with icons from unpkg. `leaflet`, `react-leaflet` 4 and `leaflet.markercluster` are installed; no React wrapper for clustering is.
- There is no photo info panel; the grid card already shows a `MapPin` when `latitude !== null`.

## Goals / Non-Goals

**Goals:**
- One effective location per photo that can always be recomputed from disk (folder files + EXIF), as the specs require.
- Respect Nominatim's usage policy: one request per second, an identifying User-Agent, a durable cache, as few lookups as possible.
- Keep the map responsive for libraries with tens of thousands of geotagged photos.

**Non-Goals:**
- Writing GPS into photo files (EXIF/XMP), also not on export.
- "Restore camera location" after clearing (the user can set it again, or delete `"geotag": null` in the sidecar).
- GPX track import, time-based geotagging, altitude or direction.
- An offline geocoder, geocoding album `location` text, per-photo place name overrides.
- Location of videos.

## Decisions

### 1. Files touched in photo folders

- **Read**: `.paloma.json`; `.picasa.ini` / `picasa.ini` in any case (existing rules); the photo file itself, for EXIF GPS (read-only, as today).
- **Written**: only `.paloma.json`, through the existing atomic write (`.paloma.json.<pid>.<random>.tmp` + `rename`), and only on a user change or `.ini` re-import. No other file in a photo folder is created, changed or deleted. The geocoder cache lives in the library database under `PALOMA_DATA_DIR`.

### 2. Database: EXIF location and effective location kept apart

New `photos` columns: `exif_latitude`, `exif_longitude` (from the file's content), `location_source` (`'exif' | 'user' | NULL`) and `geo_cell` (text `"<round(lat*100)>:<round(lon*100)>"`, or NULL). `latitude`/`longitude` keep their names and become the **effective** location, so existing queries and the client's `Photo` type keep working.

One pure helper, `effectiveLocation(geotag, exif)`, used by both indexing and `applyFolderState`:
- `geotag` object → that, source `user`; `geotag === null` → none; absent → EXIF, source `exif`.

Indexing writes the EXIF columns from the content and the effective columns from content + folder state; `applyFolderState` recomputes only the effective ones from the stored EXIF columns, so a sidecar change never re-reads the photo file.

*Alternative*: compute the effective location in every query from a separate `geotag` column. Rejected: filtering, the map and place lookups all need the effective value; storing it once is simpler and indexable.

Migration (`db/columns.ts`): add the columns, plus `metadata_version INTEGER NOT NULL DEFAULT 0`. Because the MVP's GPS parsing never worked, the scanner re-reads EXIF (not thumbnails) of every photo whose `metadata_version` is below the current one, even when its hash is unchanged, and then sets it; later parser fixes bump the version the same way. The post-scan `applyFolderState` pass then computes the effective values. Rollback: older code ignores the new columns and keeps `geotag` in sidecars untouched (unknown keys are preserved).

### 3. Sidecar and `.ini` field

- `PhotoFields.geotag?: { lat: number; lon: number } | null` — `null` is a value, distinct from absent. `fieldsOf` accepts only `null` or an object with finite in-range numbers; anything else is treated as absent (and kept in the file by the existing preservation logic).
- `FieldPatch.geotag?: Geotag | null | false`: object sets, `null` writes `"geotag": null`, `false` deletes the key (the "false clears" convention of `FieldPatch`). `photoApi` chooses `null` vs `false` for `location: null` from the photo's stored EXIF columns.
- Rounding to 6 decimals (`Math.round(x * 1e6) / 1e6`) happens when writing, both for user changes and for `.ini` import.
- `geotag` joins `SUPPORTED_FIELDS` and `sameFields` (compare `lat`/`lon`/null), so `.ini` re-import and conflict logging cover it. An entry holding only `"geotag": null` is not empty.
- `picasaIni.toFields`: `geotag=lat,lon` → split on `,`, exactly two parts, `Number(part.trim())` finite and in range; otherwise ignored.
- `shared/types.ts`: `PalomaPhotoEntry.geotag?: { lat: number; lon: number } | null`; `Photo` gains `locationSource` and `place: string | null`.

### 4. API

- `PATCH /api/photos/:id`: `parsePhotoPatch` accepts `location`.
- `POST /api/photos/location` `{ photoIds, location }`: new function in `photoApi.ts` that groups photos by folder, checks every affected sidecar is readable first (`409 sidecar_unreadable`, nothing written), then writes one sidecar per folder with a new `SidecarService.updatePhotosFields(dir, Record<filename, FieldPatch>)` (one atomic write per folder; `updatePhotoFields` becomes a one-photo call of it). Partial write failures → error with `failedFolders`, as in `albumApi`.
- `GET /api/photos`: `geotagged=true|false`, `lang` (adds `place`), and `query` matching place names (§6).
- `GET /api/geo/settings` → `{ geocoding: boolean, tileUrl, tileAttribution }` so the client takes its map settings from `.env` through the server.
- `GET /api/geo/points` (same filters as `/api/photos`, no limit) → `[{ id, lat, lon, fileHash }]`: a compact list for the map, so the map is not capped by the photo list's page size.
- `GET /api/geo/places`, `GET /api/geo/search` as in the geocoding spec.
- New error codes: `invalid_location`, `query_required`, `geocoder_disabled` (503), `geocoder_failed` (502), with translations.

The filter parsing from `listPhotos` is extracted into one `photoFilters(query)` helper shared by `/api/photos`, `/api/geo/points` and `/api/geo/places`; on the client, the parameter building in `App.tsx` moves to a shared `libraryQueryParams()` used by the grid and the map.

### 5. Geocoder

`GeocoderService` (server) wraps Nominatim:
- **Config** (`config.ts`): `PALOMA_GEOCODER_URL` — unset → `https://nominatim.openstreetmap.org`, empty → off; `PALOMA_GEOCODER_CONTACT` (e-mail, added to the User-Agent `Paloma/<version> (+contact)`); `PALOMA_MAP_TILE_URL` (default `https://tile.openstreetmap.org/{z}/{x}/{y}.png`) and `PALOMA_MAP_TILE_ATTRIBUTION`.
- **Throttle**: one in-process promise queue; each request starts at least 1000 ms after the previous one started. Search requests from the user go to the front of the queue, background reverse lookups to the back. Node's built-in `fetch` with a 10 s timeout.
- **Search**: `/search?format=jsonv2&q=…&limit=10&accept-language=<lang>` → `name`, `lat`, `lon`, `bounds` (from `boundingbox`). Cached in a `geo_search` table keyed by `(lang, lowercased trimmed q)`.
- **Reverse**: `/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=<lang>` for the **centre of the 0.01° cell**, not the exact point: fewer requests, and the geocoder never sees a photo's exact position. The place name is `locality, state, country` from `address` (`city` → `town` → `village` → `municipality` → `hamlet`; missing parts skipped). Nominatim answers without a localised name use the local name, which covers the spec's fallback.
- **Cache table** `geo_places(cell, lang, name, search_text, status, attempts, retry_at)`, PK `(cell, lang)`. `status`: `ok`, `none` (geocoder found nothing, e.g. open sea — stored so it is not asked again), `failed` (network/HTTP error, retried with backoff 1 min × 2ⁿ up to 1 h). `search_text` is `name.toLowerCase()` computed in JS, because SQLite `LIKE`/`lower()` fold only ASCII and must match Cyrillic.

### 6. Background place resolution

`PlaceResolver` keeps the set of languages clients asked for (every `lang` seen on `/api/photos` or `/api/geo/*`; seeded on start from the languages already in `geo_places`). A loop picks one `(cell, lang)` that some photo has in `geo_cell` and that has no `ok`/`none` row (and whose `retry_at` has passed), resolves it, and repeats; it idles when nothing is missing and wakes when a location changes or a new language is seen. It never runs while geocoding is off.

`place` in `/api/photos` is a `LEFT JOIN geo_places ON cell = geo_cell AND lang = ?`. Search: `filename LIKE %q% OR geo_cell IN (SELECT cell FROM geo_places WHERE instr(search_text, lower_q) > 0)`, any language. `/api/geo/places` groups the matching photos by joined `name`, with `MIN`/`MAX` of `latitude`/`longitude` for bounds, and counts photos whose cell has no row as `pending`.

*Alternative*: resolve place names during indexing. Rejected: it would tie scanning to the network and to one language.

### 7. Map client

`PlacesMap.tsx` is rewritten; `leaflet`, `react-leaflet`, `leaflet.markercluster` are reused.
- Data: `/api/geo/settings` once; `/api/geo/points` and `/api/geo/places` with `libraryQueryParams()` + `lang`, refetched on `libraryVersion`; places polled every 5 s while `pending > 0`.
- Clustering: a small `ClusterLayer` component that creates `L.markerClusterGroup` through `useMap()` (no new dependency). Markers are `L.divIcon` thumbnails (`/api/cache/thumbnail/<hash>`) styled in CSS, so no image comes from unpkg. `spiderfyOnMaxZoom: false`; a `clusterclick` at max zoom, or a marker click, opens a popup of thumbnails; clicking one calls the store's add-to-tray.
- Fit: `fitBounds` over the points on load and when the selection changes; a place in the panel fits its `bounds`.
- Placing: a "Set location" toggle sets a crosshair cursor and takes the next map click; tray thumbnails become HTML5-draggable (`application/x-paloma-photo` = id) and the map container's `drop` uses `map.mouseEventToLatLng`. Both call `POST /api/photos/location`; if any target has `latitude !== null`, a react-bootstrap `Modal` asks first (same pattern as album delete). Success → `bumpLibrary()`.
- Address search: input with debounce on Enter, result list, `flyToBounds` + a temporary marker, and "Place selected photos here".
- "Remove location": in the map toolbar and in `PhotoTray`, with a confirmation `Modal`.
- Sidebar: `FilterType` gains `'geotagged'`; `PhotoCard`'s pin gets `title={photo.place ?? coords}`; the tray shows the place of a single selected photo.
- All new texts go into all 11 locale catalogs (the catalog test enforces completeness).

### 8. MVP code reused, rewritten or dropped

- **Reused**: `MetadataService` EXIF parsing (fixed to read `GPSInfo`, refs `N/S/E/W`, and to drop `0,0` and out-of-range values; tests added); `photos.latitude/longitude` columns; `PhotoCard` pin; Leaflet packages; folder-by-folder save pattern from `albumApi.ts`.
- **Rewritten**: `PlacesMap.tsx`; `FolderScannerService` location handling.
- **Dropped**: unpkg marker icons, `/api/photos?limit=1000` in the map, the hardcoded Ukraine centre (empty map shows the world at zoom 2).

## Risks / Trade-offs

- [Nominatim policy discourages bulk reverse geocoding] → 0.01° cells collapse most libraries to hundreds of lookups; one request per second; only languages actually used; the URL can point to a self-hosted Nominatim.
- [Privacy: coordinates and search text leave the machine] → reverse lookups send only the cell centre (~1 km); geocoding can be turned off in `.env`; `.env.example` documents both the geocoder and the tile server.
- [Cell centre gives a neighbouring town for photos near a boundary] → accepted for grouping; the exact coordinates remain shown when needed.
- [Changing the UI language creates a new wave of lookups] → names stay cached per language; first visit in a new language fills in at 1/s while the old names stay searchable.
- [`"geotag": null` is the only `null` field in the sidecar] → documented in the sidecar spec; readers that ignore it see "no geotag" and fall back to EXIF, which is the one visible difference.
- [Thousands of thumbnail markers] → clustering keeps visible DOM markers small; `/api/geo/points` is compact.
- [OSM tile usage policy] → tile URL configurable; attribution always shown.

## Migration Plan

1. On start, `db/columns.ts` adds the new `photos` columns and the `geo_places`/`geo_search` tables.
2. The existing post-scan `applyFolderState` pass computes effective locations and `geo_cell` from the folder files.
3. The scan re-reads EXIF GPS of every photo with an old `metadata_version` once (no thumbnail regeneration), so existing libraries get camera locations without a rebuild.
4. Rollback: run older code; extra columns/tables are ignored, sidecar `geotag` keys are preserved.
