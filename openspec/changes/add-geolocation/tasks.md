# Tasks

## 1. Configuration and shared types

- [ ] 1.1 Add `PALOMA_GEOCODER_URL` (unset → public Nominatim, empty → off), `PALOMA_GEOCODER_CONTACT`, `PALOMA_MAP_TILE_URL` and `PALOMA_MAP_TILE_ATTRIBUTION` to `server/src/config.ts` and `.env.example` with comments on what is sent where; verify with a `config` unit test covering unset, empty and custom values
- [ ] 1.2 Extend `shared/types.ts`: `Geotag`, `PalomaPhotoEntry.geotag` (object or `null`), `Photo.locationSource` and `Photo.place`, geo API response types (`GeoSettings`, `GeoPoint`, `GeoSearchResult`, `GeoPlaces`), and error codes `invalid_location`, `query_required`, `geocoder_disabled`, `geocoder_failed`; verify `npm run build` type-checks

## 2. Camera location (EXIF)

- [x] 2.1 Fix GPS extraction in `MetadataService` to read `exif-reader` 2.x `GPSInfo` with `N/S/E/W` refs, rejecting out-of-range and `0,0` values; add `MetadataService.test.ts` cases using small generated JPEG fixtures (sharp `withExif`) for N/E, S/W and no-GPS files
- [ ] 2.2 Add `exif_latitude`, `exif_longitude`, `location_source`, `geo_cell` and `metadata_version` columns to `db/schema.ts`, `db/index.ts` and `db/columns.ts`; verify in `columns.test.ts` that an MVP database gains them without losing rows
- [ ] 2.3 Make the scanner re-read EXIF (without regenerating thumbnails) for photos with an old `metadata_version` even when the hash is unchanged; verify in `FolderScannerService.test.ts` that an already indexed photo gets its EXIF location after restart

## 3. Geotag in folder files

- [ ] 3.1 Parse `geotag=lat,lon` in `picasaIni.ts` (two in-range numbers, 6-decimal rounding, otherwise ignored); verify in `picasaIni.test.ts` with valid, negative, malformed and out-of-range values
- [ ] 3.2 Support `geotag` in `SidecarService`: `fieldsOf` validation, `SUPPORTED_FIELDS`, `sameFields`, `null` vs deleted key in `FieldPatch`, rounding on write, `.ini` import and re-import; verify in `SidecarService.test.ts` (invalid geotag kept in file, `null` entry not removed as empty, re-import of a changed `.ini` geotag, conflict with a Paloma change)
- [ ] 3.3 Add `effectiveLocation(geotag, exif)` and use it on index and in `applyFolderState` to set `latitude`, `longitude`, `location_source` and `geo_cell`; verify in `FolderScannerService.test.ts` the precedence scenarios of the geotags spec, library rebuild from disk, a sidecar edited while running, and a sidecar location surviving a content change

## 4. Location API

- [ ] 4.1 Accept `location` in `parsePhotoPatch`/`updatePhoto` (object sets, `null` writes `"geotag": null` or deletes the key depending on EXIF, invalid → 400 `invalid_location`) and return `locationSource`; verify in `photoApi.test.ts` with the geotags and sidecar-files API scenarios, including caption + location in one write
- [ ] 4.2 Add `SidecarService.updatePhotosFields` (one atomic write per folder) and `POST /api/photos/location` with folder-by-folder saving, 404 for unknown ids, 409 for unreadable sidecars and `failedFolders` on write errors; verify in `photoApi.test.ts` with two folders, a corrupt sidecar and a read-only folder
- [ ] 4.3 Extract a shared `photoFilters` helper and add `geotagged=true|false` to `GET /api/photos`, plus `GET /api/geo/points` and `GET /api/geo/settings`; verify in `photoApi.test.ts`/`geoApi.test.ts` that points ignore the page limit and follow folder, album, starred, hidden and search filters

## 5. Geocoder and place names

- [ ] 5.1 Implement `GeocoderService`: throttled queue (≥1000 ms between request starts, user searches first), User-Agent with contact, 10 s timeout, Nominatim search and reverse (cell centre, `zoom=10`, place name from `address`), disabled mode; verify in `GeocoderService.test.ts` with a mocked `fetch` and fake timers (rate limit, priority, request URL and headers, name composition, errors)
- [ ] 5.2 Add `geo_places` and `geo_search` cache tables with `ok`/`none`/`failed` status and retry backoff; verify in tests that a cached search or place makes no request after a simulated restart and that a failed lookup is retried after its backoff
- [ ] 5.3 Implement `PlaceResolver` (languages seen in requests, missing `(cell, lang)` pairs, idle/wake on location changes) and wire it into server start and location updates; verify in `PlaceResolver.test.ts` that nearby photos share one lookup and new geotags get names without a restart
- [ ] 5.4 Add `lang` and `place` to `GET /api/photos`, place-name matching to `query` (Unicode case-insensitive via `search_text`), `GET /api/geo/places` (grouping, counts, bounds, `pending`) and `GET /api/geo/search` (400 `query_required`, 502 `geocoder_failed`, 503 `geocoder_disabled`); verify in `geoApi.test.ts` with seeded cache rows, including a Cyrillic search
- [ ] 5.5 Register the new routes in `routes/index.ts` and add the new error codes to `errors.test.ts`; verify the route tests pass

## 6. Client

- [ ] 6.1 Move grid query building from `App.tsx` into a shared `libraryQueryParams()` that also sends `lang`; add the `geotagged` filter to the store and a "Geotagged" item to `LeftSidebar`; verify in the browser that the grid shows only geotagged photos
- [ ] 6.2 Show the place name (or coordinates) in the `PhotoCard` pin tooltip and in `PhotoTray` for a single selected photo; add "Remove location" with a confirmation modal to the tray; verify in the browser on a geotagged photo
- [ ] 6.3 Rewrite `PlacesMap.tsx`: settings from `/api/geo/settings`, points from `/api/geo/points` with the library selection, a `ClusterLayer` on `leaflet.markercluster` with thumbnail `divIcon` markers, thumbnail popups that add photos to the tray, fit to bounds, empty-state message, no unpkg resources; verify in the browser with an album and with a folder without geotags
- [ ] 6.4 Add the places panel (`/api/geo/places`, pending count with polling, click fits bounds), hidden when geocoding is off; verify in the browser with geocoding on and with an empty `PALOMA_GEOCODER_URL`
- [ ] 6.5 Add placing photos: "Set location" + map click, dragging tray thumbnails onto the map, address search with results and "Place selected photos here", replacement confirmation, errors shown via the existing API error helper; verify in the browser each photo-map scenario, including a read-only folder
- [ ] 6.6 Add all new texts to the 11 locale catalogs; verify `catalogs.test.ts` passes

## 7. Documentation and verification

- [ ] 7.1 Update `docs/picassa/08-paloma-json-format.md` §4.1/§4.6 to match the specified `geotag` (6 decimals, `null` meaning removed, EXIF fallback); verify the doc and specs agree
- [ ] 7.2 Run the app against a test folder with EXIF GPS photos, a Picasa `.ini` with `geotag=` and a read-only folder, and check every scenario of the geotags, geocoding and photo-map specs end to end
- [ ] 7.3 Verify `npm run build` and `npm test` pass
