# Proposal

## Why

Photos carry a location (camera GPS in EXIF, or a Picasa `geotag=`), but Paloma only reads EXIF GPS into the database and shows it on a bare demo map. The user can't set, fix or remove a location, the location doesn't travel with the folder, Picasa geotags are lost, and the map can't tell where a photo was taken in words or find photos by place.

## What Changes

- **Location of a photo**: a single effective location per photo. It comes from a geotag in the folder's `.paloma.json` when present, otherwise from a `geotag=lat,lon` in the Picasa `.ini` (while it is shown live or imported), otherwise from the photo's EXIF GPS. A geotag of `null` in the sidecar removes the location even if the file has EXIF GPS.
- **Sidecar**: a new photo field `geotag` (`{ "lat": …, "lon": … }`, decimal degrees, 6 decimal places, or `null`), with the same `modified`, empty-entry, import and preservation rules as the other fields. Photo files are never modified.
- **Picasa `.ini`**: the `geotag=lat,lon` key of a file section is read, shown live and imported like the other supported fields.
- **Database**: the library keeps the EXIF location and the effective location separately, so the effective one can be recomputed from disk at any time; it also caches reverse-geocoded place names.
- **API**: set or clear the location of one photo (`PATCH /api/photos/:id`) or of many photos across folders (saved folder by folder); `GET /api/photos` returns the location and its source and filters by `geotagged=true|false` and by place name; endpoints for address search (geocoding), place names (reverse geocoding) and places grouped with photo counts.
- **Geocoding**: through OpenStreetMap Nominatim, called only by the server, rate-limited to 1 request per second, with a persistent cache. The geocoder URL and the map tile URL come from `.env`; geocoding can be turned off, and the rest of the feature keeps working without it.
- **Map view** (rewrite of the MVP `PlacesMap`): shows the geotagged photos of the current library selection (folder, album, starred, search) with clustering; a places panel groups them by place with counts; selected photos can be placed by clicking or dropping them on the map or on an address search result; their location can be cleared.
- **Library**: a "Geotagged" filter in the sidebar; library search also matches place names; the photo card's pin and the tray show the place name of a photo.
- **BREAKING (MVP only)**: `PlacesMap` loading `/api/photos?limit=1000` and Leaflet marker icons from unpkg are dropped; the map no longer needs internet access except for tiles and geocoding.

## Capabilities

### New Capabilities
- `geotags`: the effective location of a photo — sources and precedence (sidecar, Picasa `.ini`, EXIF), the `geotag` sidecar field, setting and clearing locations through the API, and the geotagged filter.
- `geocoding`: turning addresses into coordinates and coordinates into place names through a configurable, rate-limited, cached geocoder; place names on photos, place search, and places grouped with counts.
- `photo-map`: the map view — clustered photos of the current selection, the places panel, and placing or clearing photo locations on the map.

### Modified Capabilities
- `sidecar-files`: `geotag` joins the stored photo fields, the mapped Picasa fields, the fields the library takes from the sidecar, and the fields `PATCH /api/photos/:id` accepts; `GET /api/photos` gains the location fields and the `geotagged` filter.

## Impact

- **Server**: `MetadataService` (EXIF GPS parsing kept, tested), `picasaIni.ts` (new `geotag` key), `SidecarService` (new field), `FolderScannerService` (effective location), `photoApi.ts`, new `geoApi.ts` and `GeocoderService`, `routes/index.ts`, `db/schema.ts` + `db/columns.ts` (new columns and a `places` cache table), `config.ts`.
- **Shared types**: `Photo` (location source), `PalomaPhotoEntry` (`geotag`), new geo API types.
- **Client**: `PlacesMap.tsx` rewritten, `LeftSidebar`, `App.tsx` (filter), `PhotoCard`, `PhotoTray`, store, i18n catalogs in all 11 languages.
- **Configuration**: new `.env` keys for the geocoder URL, contact e-mail/User-Agent and the tile URL (`.env.example` updated).
- **Dependencies**: none new (`leaflet`, `react-leaflet`, `leaflet.markercluster` are already in the client); Node's built-in `fetch` calls Nominatim.
- **Network/privacy**: coordinates and search text are sent to the configured geocoder; map tiles are loaded from the configured tile server. Both are documented in `.env.example`.
